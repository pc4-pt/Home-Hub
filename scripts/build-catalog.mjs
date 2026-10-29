#!/usr/bin/env node
// Builds public/catalog/channels.json + guide.json for the TV.
// Runs in GitHub Actions every 4 hours (pages.yml). Inputs:
//   - sources.json            which sources/regions/categories to use
//   - HEALTH_URL (optional)   health.json from the daily stream check (maintain.yml)
//   - EPG_URL    (optional)   guide.xml.gz from the daily guide grab (maintain.yml)
import fs from 'node:fs/promises';
import { loadConfig, get, getJSON, decode, slug, parseXMLTV } from './lib/common.mjs';
import { loadIptvOrg, healthKey } from './lib/iptvorg.mjs';

const cfg = await loadConfig();
const OUT_DIR = process.env.CATALOG_OUT || new URL('../public/catalog/', import.meta.url).pathname;
const now = Math.floor(Date.now() / 1000);
const guideFrom = now - 2 * 3600;
const guideTo = now + cfg.guideHours * 3600;
const exclude = new RegExp(cfg.exclude.namePattern, 'i');
const report = [];
const channels = [];
const guide = {};

// Category from playlist group / channel name. Order matters: sport, then films, then box sets.
const RULES = [
  ['sport', /sport|football|soccer|racing|motor|nascar|formula|golf|tennis|fight|boxing|wrestl|mma|ufc|\bnfl\b|\bnba\b|\bmlb\b|\bnhl\b|poker|darts|snooker|cricket|rugby|olympic|stadium|red ?bull|extreme|surf|\bski|horse|bowling|billiard|pickleball|hunting|fishing/i],
  ['films', /movie|film|cinema|flick|western|horror|thriller|kung ?fu|bollywood|noir|cine|screen/i],
  ['boxsets', /drama|crime|comedy|sitcom|series|classic tv|tv classics|reality|sci-?fi|mystery|detective|soap|binge|true crime|game show|competition|anime|docu-?series|investigat/i],
];
function categorise(group, name) {
  for (const text of [group, name]) {
    if (!text) continue;
    for (const [cat, re] of RULES) if (re.test(text)) return cat;
  }
  return null;
}

function parseM3U(text) {
  const out = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const attrs = {};
      let end = 0;
      for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) {
        if (line.slice(end, m.index).includes(',')) break; // reached the title
        attrs[m[1].toLowerCase()] = m[2];
        end = m.index + m[0].length;
      }
      const comma = line.indexOf(',', end);
      cur = { attrs, name: comma === -1 ? '' : decode(line.slice(comma + 1)) };
    } else if (line.startsWith('#EXTVLCOPT') && cur) {
      const m = line.match(/http-(referrer|user-agent)=(.+)$/i);
      if (m) cur[m[1].toLowerCase() === 'referrer' ? 'ref' : 'ua'] = m[2].trim();
    } else if (!line.startsWith('#') && cur) {
      out.push({ ...cur, url: line });
      cur = null;
    }
  }
  return out;
}

// ---------- generic M3U + XMLTV sources (sources.json "fast") ----------
for (const src of cfg.fast || []) {
  for (const region of src.regions ?? cfg.regions) {
    const label = `${src.name} ${region.toUpperCase()}`;
    try {
      const items = parseM3U(await get(src.m3u.replace('{region}', region)));
      const picked = [];
      for (const it of items) {
        const name = it.name || it.attrs['tvg-name'];
        if (!name || exclude.test(name)) continue;
        const cat = categorise(it.attrs['group-title'], name);
        if (!cat || !cfg.categories.includes(cat)) continue;
        const epgId = it.attrs['tvg-id'] || it.attrs['channel-id'] || '';
        picked.push({
          id: `${src.id}-${region}-${slug(epgId || name)}`,
          name, cat, region, src: src.id, srcName: src.name,
          logo: it.attrs['tvg-logo'] || '', url: it.url, ref: it.ref, ua: it.ua, epgId,
        });
      }
      let guided = 0;
      if (src.epg && picked.length) {
        try {
          const progs = parseXMLTV(await get(src.epg.replace('{region}', region)), new Set(picked.map((c) => c.epgId)), guideFrom, guideTo);
          for (const c of picked) if (progs.has(c.epgId)) { guide[c.id] = progs.get(c.epgId); guided++; }
        } catch (e) { report.push({ source: `${label} guide`, ok: false, error: e.message }); }
      }
      channels.push(...picked);
      report.push({ source: label, ok: true, kept: picked.length, withGuide: guided });
    } catch (e) {
      report.push({ source: label, ok: false, error: e.message });
    }
  }
}

// ---------- iptv-org ----------
if (cfg.iptvOrg.enabled) {
  try {
    const { channels: io } = await loadIptvOrg(cfg);

    // Drop streams that failed the last 2+ daily checks.
    let health = null;
    if (process.env.HEALTH_URL) {
      health = await getJSON(process.env.HEALTH_URL, null);
      report.push(health
        ? { source: 'Stream check', ok: true, detail: `${health.ok} of ${health.total} working on ${new Date(health.checkedAt * 1000).toISOString().slice(0, 10)} · ${health.dropped} hidden` }
        : { source: 'Stream check', ok: false, error: 'not run yet' });
    }
    const live = io.filter((c) => !health || (health.streams[healthKey(c)]?.fails || 0) < 2);

    // Guide from the daily grab. xmltv ids may carry a feed suffix ("Foo.uk@HD").
    let progs = new Map();
    if (process.env.EPG_URL) {
      try {
        progs = parseXMLTV(await get(process.env.EPG_URL), new Set(live.map((c) => c.ioId)), guideFrom, guideTo, (x) => x.split('@')[0]);
      } catch (e) {
        report.push({ source: 'Guide (iptv-org)', ok: false, error: /404/.test(e.message) ? 'not run yet' : e.message });
      }
    }

    let guided = 0;
    for (const c of live) {
      const id = `iptvorg-${c.region}-${slug(c.ioId)}`;
      channels.push({ id, name: c.name, cat: c.cat, region: c.region, src: 'iptvorg', srcName: 'Free-to-air',
        logo: c.logo, url: c.url, ref: c.ref, ua: c.ua });
      if (progs.has(c.ioId)) { guide[id] = progs.get(c.ioId); guided++; }
    }
    report.push({ source: 'iptv-org (UK/US)', ok: true, kept: live.length, withGuide: process.env.EPG_URL ? guided : undefined });
  } catch (e) {
    report.push({ source: 'iptv-org', ok: false, error: e.message });
  }
}

// De-duplicate the same channel offered by several sources: prefer the copy with a guide.
const seen = new Map();
for (const c of channels) {
  const key = `${c.region}:${slug(c.name.replace(/^(pluto tv|plex|samsung)\s+/i, ''))}`;
  const prev = seen.get(key);
  if (!prev || (!guide[prev.id] && guide[c.id])) seen.set(key, c);
}
const final = [...seen.values()].sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
const keepIds = new Set(final.map((c) => c.id));
for (const id of Object.keys(guide)) if (!keepIds.has(id)) delete guide[id];
for (const c of final) { delete c.epgId; if (!c.ref) delete c.ref; if (!c.ua) delete c.ua; }

if (!final.length) {
  console.error('No channels produced — keeping the previous catalogue.', report);
  process.exit(1);
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(`${OUT_DIR}/channels.json`, JSON.stringify({ generatedAt: now, sources: report, channels: final }));
await fs.writeFile(`${OUT_DIR}/guide.json`, JSON.stringify({ generatedAt: now, from: guideFrom, to: guideTo, programmes: guide }));

const counts = final.reduce((m, c) => ((m[c.cat] = (m[c.cat] || 0) + 1), m), {});
console.table(report);
console.log(`Channels: ${final.length}`, counts, `with guide: ${Object.keys(guide).length}`);
