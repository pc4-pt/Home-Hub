#!/usr/bin/env node
// Daily stream check. Probes every candidate stream (playlist, then first variant) and
// keeps a running record in data/health.json. A stream is dropped from the catalogue
// after 2 consecutive failed checks, so one bad night doesn't remove a channel.
//
// Caveat: GitHub's runners are in the US, so this finds dead/broken streams, not ones
// blocked only in Portugal. The app handles those itself.
import fs from 'node:fs/promises';
import { loadConfig, getJSON } from './lib/common.mjs';
import { loadIptvOrg, healthKey } from './lib/iptvorg.mjs';

const cfg = await loadConfig();
const OUT = process.env.DATA_OUT || new URL('../data/', import.meta.url).pathname;
const PREV = process.env.HEALTH_URL; // last published health.json, if any
const CONCURRENCY = +(process.env.CHECK_CONCURRENCY || 24);
const TIMEOUT = 12000;
const DEFAULT_UA = 'Mozilla/5.0 (Linux; Android 9; AFTKA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

async function fetchText(url, ch, limit = 256 * 1024) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { 'user-agent': ch.ua || DEFAULT_UA, ...(ch.ref ? { referer: ch.ref } : {}) },
  });
  if (!res.ok) { res.body?.cancel().catch(() => {}); throw new Error(`HTTP ${res.status}`); }
  const type = res.headers.get('content-type') || '';
  // Read only the start of the body: enough for a playlist, and avoids downloading video.
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return { text: Buffer.concat(chunks).toString('utf8'), type, url: res.url || url };
}

export async function probe(ch) {
  try {
    const first = await fetchText(ch.url, ch);
    if (!first.text.trimStart().startsWith('#EXTM3U')) {
      // Not HLS: accept a direct video stream (e.g. MPEG-TS) that starts sending data.
      if (/video|octet-stream|mp2t/i.test(first.type) && first.text.length > 0) return { ok: true };
      return { ok: false, reason: 'not a playlist' };
    }
    if (/#EXTINF/.test(first.text)) return { ok: true };
    const variant = first.text.split(/\r?\n/).find((l) => l && !l.startsWith('#'));
    if (!/#EXT-X-STREAM-INF/.test(first.text) || !variant) return { ok: false, reason: 'empty playlist' };
    const second = await fetchText(new URL(variant.trim(), first.url).href, ch);
    if (/#EXTINF|#EXT-X-STREAM-INF/.test(second.text)) return { ok: true };
    return { ok: false, reason: 'empty variant' };
  } catch (e) {
    return { ok: false, reason: e.name === 'TimeoutError' ? 'timeout' : e.cause?.code || e.message };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const { channels } = await loadIptvOrg(cfg);
const prev = PREV ? await getJSON(PREV, { streams: {} }) : { streams: {} };
const now = Math.floor(Date.now() / 1000);

const results = await pool(channels, CONCURRENCY, probe);
const streams = {};
let ok = 0, failing = 0, dropped = 0;
const reasons = {};
channels.forEach((ch, k) => {
  const key = healthKey(ch);
  const before = prev.streams?.[key] || { fails: 0 };
  const r = results[k];
  const rec = r.ok
    ? { fails: 0, lastOk: now }
    : { fails: (before.fails || 0) + 1, lastOk: before.lastOk || null, reason: r.reason };
  streams[key] = rec;
  if (r.ok) ok++;
  else {
    failing++;
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    if (rec.fails >= 2) dropped++;
  }
});

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(`${OUT}/health.json`, JSON.stringify({ checkedAt: now, total: channels.length, ok, failing, dropped, streams }));

const summary = [
  `### Stream check`,
  `${channels.length} streams · **${ok} working** · ${failing} failed today · ${dropped} dropped (failed 2+ checks in a row)`,
  '',
  '| Failure | Count |', '|---|---|',
  ...Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `| ${r} | ${n} |`),
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
