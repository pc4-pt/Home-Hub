#!/usr/bin/env node
// Builds public/catalog/channels.json + guide.json from the sources in sources.json.
// Runs in GitHub Actions on a schedule (see .github/workflows/pages.yml) so the TV
// never has to download or parse multi-megabyte playlists and XMLTV files itself.
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gunzip = promisify(zlib.gunzip);
const root = new URL('..', import.meta.url);
const cfg = JSON.parse(await fs.readFile(process.env.SOURCES || new URL('sources.json', root), 'utf8'));
const OUT_DIR = process.env.CATALOG_OUT;
const OUT = OUT_DIR ? new URL(`file://${OUT_DIR.replace(/\/?$/, '/')}`) : new URL('public/catalog/', root);
const now = Math.floor(Date.now() / 1000);
const guideFrom = now - 2 * 3600;
const guideTo = now + cfg.guideHours * 3600;
const exclude = new RegExp(cfg.exclude.namePattern, 'i');
const report = [];

// ---------- helpers ----------
async function get(url, { binary = false } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': 'home-hub-catalog/0.1' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (binary) return buf;
  const gz = buf[0] === 0x1f && buf[1] === 0x8b;
  return (gz ? await gunzip(buf) : buf).toString('utf8');
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s = '') =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
   .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
     e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m)
   .replace(/<[^>]+>/g, '')
   .trim();

const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s || '');

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

// ---------- M3U ----------
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

// ---------- XMLTV ----------
function xmltvTime(s) {
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
function parseXMLTV(text, wanted) {
  const progs = new Map();
  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  for (let m; (m = re.exec(text)); ) {
    const a = m[1];
    const ch = decode((a.match(/channel="([^"]*)"/) || [])[1]);
    if (!wanted.has(ch)) continue;
    const start = xmltvTime((a.match(/start="([^"]*)"/) || [])[1]);
    const stop = xmltvTime((a.match(/stop="([^"]*)"/) || [])[1]);
    if (!start || !stop || stop <= guideFrom || start >= guideTo) continue;
    const b = m[2];
    const ep = tag(b, 'episode-num');
    const sub = [tag(b, 'sub-title'), /^S\d+\s*E\d+/i.test(ep) ? ep : ''].filter(Boolean).join(' · ');
    const icon = (b.match(/<icon[^>]*src="([^"]+)"/) || [])[1] || '';
    if (!progs.has(ch)) progs.set(ch, []);
    progs.get(ch).push([start, stop, clip(tag(b, 'title'), 90), clip(sub, 80), clip(tag(b, 'desc'), 220), icon]);
  }
  for (const list of progs.values()) list.sort((x, y) => x[0] - y[0]);
  return progs;
}

// ---------- sources ----------
const channels = [];
const guide = {};

for (const src of cfg.fast) {
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
          logo: it.attrs['tvg-logo'] || '',
          group: it.attrs['group-title'] || '',
          url: it.url, ref: it.ref, ua: it.ua, epgId,
        });
      }
      let guided = 0;
      if (src.epg && picked.length) {
        try {
          const progs = parseXMLTV(await get(src.epg.replace('{region}', region)), new Set(picked.map((c) => c.epgId)));
          for (const c of picked) if (progs.has(c.epgId)) { guide[c.id] = progs.get(c.epgId); guided++; }
        } catch (e) { report.push({ source: `${label} guide`, ok: false, error: e.message }); }
      }
      channels.push(...picked);
      report.push({ source: label, ok: true, total: items.length, kept: picked.length, withGuide: guided });
    } catch (e) {
      report.push({ source: label, ok: false, error: e.message });
    }
  }
}

if (cfg.iptvOrg.enabled) {
  const io = cfg.iptvOrg;
  try {
    const [chs, streams, blocklist, logos] = await Promise.all(
      ['channels', 'streams', 'blocklist', 'logos'].map((n) => get(`${io.api}/${n}.json`).then(JSON.parse).catch(() => []))
    );
    const blocked = new Set(blocklist.map((b) => b.channel));
    const logoOf = new Map();
    for (const l of logos) if (!logoOf.has(l.channel) || l.in_use) logoOf.set(l.channel, l.url);
    const byChannel = new Map();
    for (const s of streams) {
      if (!s.channel) continue;
      if (io.skipGeoBlocked && /geo/i.test(s.label || '')) continue;
      const prev = byChannel.get(s.channel);
      const q = (x) => parseInt(x?.quality) || 0;
      if (!prev || (!s.label && prev.label) || q(s) > q(prev)) byChannel.set(s.channel, s);
    }
    let kept = 0;
    for (const [region, codes] of Object.entries(io.countries)) {
      if (!cfg.regions.includes(region)) continue;
      for (const c of chs) {
        if (!codes.includes(c.country) || c.is_nsfw || c.closed || blocked.has(c.id)) continue;
        if (exclude.test(c.name)) continue;
        const cat = (c.categories || []).map((k) => io.categoryMap[k]).find(Boolean);
        const st = byChannel.get(c.id);
        if (!cat || !st || !cfg.categories.includes(cat)) continue;
        channels.push({
          id: `iptvorg-${region}-${slug(c.id)}`, name: c.name, cat, region, src: 'iptvorg', srcName: 'Free-to-air',
          logo: logoOf.get(c.id) || c.logo || '', group: '', url: st.url,
          ref: st.referrer || st.http_referrer || undefined, ua: st.user_agent || undefined, epgId: c.id,
        });
        kept++;
      }
    }
    report.push({ source: 'iptv-org (UK/US)', ok: true, kept });
  } catch (e) {
    report.push({ source: 'iptv-org', ok: false, error: e.message });
  }
}

// De-duplicate the same channel offered by several services: prefer the copy with a guide.
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

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(new URL('channels.json', OUT), JSON.stringify({ generatedAt: now, sources: report, channels: final }));
await fs.writeFile(new URL('guide.json', OUT), JSON.stringify({ generatedAt: now, from: guideFrom, to: guideTo, programmes: guide }));

const counts = final.reduce((m, c) => ((m[c.cat] = (m[c.cat] || 0) + 1), m), {});
console.table(report);
console.log(`Channels: ${final.length}`, counts, `with guide: ${Object.keys(guide).length}`);
