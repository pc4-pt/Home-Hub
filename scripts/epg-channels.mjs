#!/usr/bin/env node
// Writes data/channels.xml for iptv-org's guide grabber: one guide source per channel we
// keep (working streams only), preferring English listings and sites that already cover
// many of our channels, so the grabber hits as few sites as possible.
import fs from 'node:fs/promises';
import { loadConfig, getJSON, escapeXml } from './lib/common.mjs';
import { loadIptvOrg, healthKey } from './lib/iptvorg.mjs';

const cfg = await loadConfig();
const OUT = process.env.DATA_OUT || new URL('../data/', import.meta.url).pathname;
const health = await getJSON(`${OUT}/health.json`, { streams: {} });

const { channels, guides } = await loadIptvOrg(cfg);
const live = channels.filter((c) => (health.streams[healthKey(c)]?.fails || 0) < 2);
const wanted = new Set(live.map((c) => c.ioId));

const options = new Map(); // channel id -> guides[]
const siteCount = new Map();
for (const g of guides) {
  if (!wanted.has(g.channel) || !g.site || !g.site_id) continue;
  if (!options.has(g.channel)) options.set(g.channel, []);
  options.get(g.channel).push(g);
  siteCount.set(g.site, (siteCount.get(g.site) || 0) + 1);
}

const lines = [];
const sites = new Set();
for (const [id, list] of options) {
  const pick = [...list].sort((a, b) =>
    (b.lang === 'en') - (a.lang === 'en') || (siteCount.get(b.site) || 0) - (siteCount.get(a.site) || 0)
  )[0];
  sites.add(pick.site);
  const xmltvId = pick.feed ? `${id}@${pick.feed}` : id;
  lines.push(`  <channel site="${escapeXml(pick.site)}" lang="${escapeXml(pick.lang || 'en')}" xmltv_id="${escapeXml(xmltvId)}" site_id="${escapeXml(pick.site_id)}">${escapeXml(pick.site_name || id)}</channel>`);
}

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(`${OUT}/channels.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<channels>\n${lines.join('\n')}\n</channels>\n`);
console.log(`Guide sources for ${lines.length} of ${live.length} working channels, from ${sites.size} sites.`);
