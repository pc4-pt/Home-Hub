// Shared helpers for the catalogue, stream check and guide scripts.
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gunzip = promisify(zlib.gunzip);

export async function loadConfig() {
  const path = process.env.SOURCES || new URL('../../sources.json', import.meta.url);
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

/** GET a URL (or read a local path) as text; transparently gunzips. */
export async function get(url, { timeout = 60000 } = {}) {
  let buf;
  if (!/^https?:/i.test(url)) {
    buf = await fs.readFile(url);
  } else {
    const res = await fetch(url, { headers: { 'user-agent': 'home-hub-catalog/0.2' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const gz = buf[0] === 0x1f && buf[1] === 0x8b;
  return (gz ? await gunzip(buf) : buf).toString('utf8');
}

export const getJSON = async (url, fallback) => {
  try { return JSON.parse(await get(url)); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
};

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decode = (s = '') =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
   .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
     e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m)
   .replace(/<[^>]+>/g, '')
   .trim();

export const escapeXml = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
export const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s || '');

export function xmltvTime(s) {
  const m = s && s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-]\d{4})?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se = '00', tz = '+0000'] = m;
  const off = (tz[0] === '-' ? -1 : 1) * (+tz.slice(1, 3) * 60 + +tz.slice(3, 5));
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) / 1000 - off * 60;
}

const tag = (body, name) => {
  const m = body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

/**
 * Programmes from an XMLTV document for the channels in `wanted`, clipped to [from, to].
 * `key(channelAttr)` maps the XML channel id to the id used in `wanted`.
 * Returns Map<id, [start, stop, title, subtitle, desc, icon][]>.
 */
export function parseXMLTV(text, wanted, from, to, key = (x) => x) {
  const progs = new Map();
  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  for (let m; (m = re.exec(text)); ) {
    const a = m[1];
    const ch = key(decode((a.match(/channel="([^"]*)"/) || [])[1]));
    if (!wanted.has(ch)) continue;
    const start = xmltvTime((a.match(/start="([^"]*)"/) || [])[1]);
    const stop = xmltvTime((a.match(/stop="([^"]*)"/) || [])[1]);
    if (!start || !stop || stop <= from || start >= to) continue;
    const b = m[2];
    const ep = tag(b, 'episode-num');
    const sub = [tag(b, 'sub-title'), /^S\d+\s*E\d+/i.test(ep) ? ep : ''].filter(Boolean).join(' · ');
    const icon = (b.match(/<icon[^>]*src="([^"]+)"/) || [])[1] || '';
    if (!progs.has(ch)) progs.set(ch, []);
    progs.get(ch).push([start, stop, clip(tag(b, 'title'), 90), clip(sub, 80), clip(tag(b, 'desc'), 220), icon]);
  }
  for (const [ch, list] of progs) {
    list.sort((x, y) => x[0] - y[0]);
    // the same programme can come from overlapping days: drop exact repeats
    progs.set(ch, list.filter((p, i) => i === 0 || p[0] !== list[i - 1][0]));
  }
  return progs;
}
