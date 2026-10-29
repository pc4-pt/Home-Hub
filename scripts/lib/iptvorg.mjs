// Picks the iptv-org channels the hub offers: UK/US, film/box-set/sport categories,
// not NSFW, not closed, not on the blocklist, with a usable stream.
import { getJSON } from './common.mjs';

export async function loadIptvOrg(cfg) {
  const io = cfg.iptvOrg;
  const exclude = new RegExp(cfg.exclude.namePattern, 'i');
  const [chs, streams, blocklist, logos, guides] = await Promise.all([
    getJSON(`${io.api}/channels.json`),
    getJSON(`${io.api}/streams.json`),
    getJSON(`${io.api}/blocklist.json`, []),
    getJSON(`${io.api}/logos.json`, []),
    getJSON(`${io.api}/guides.json`, []),
  ]);

  const blocked = new Set(blocklist.map((b) => b.channel));
  const logoOf = new Map();
  for (const l of logos) if (!logoOf.has(l.channel) || l.in_use) logoOf.set(l.channel, l.url);

  // Best stream per channel: unlabelled (24/7, not geo-blocked) first, then highest quality.
  const q = (x) => parseInt(x?.quality) || 0;
  const byChannel = new Map();
  for (const s of streams) {
    if (!s.channel || !s.url) continue;
    if (io.skipGeoBlocked && /geo/i.test(s.label || '')) continue;
    const prev = byChannel.get(s.channel);
    if (!prev || (!s.label && prev.label) || (!!s.label === !!prev.label && q(s) > q(prev))) byChannel.set(s.channel, s);
  }

  const channels = [];
  for (const [region, codes] of Object.entries(io.countries)) {
    if (!cfg.regions.includes(region)) continue;
    for (const c of chs) {
      if (!codes.includes(c.country) || c.is_nsfw || c.closed || blocked.has(c.id)) continue;
      if (exclude.test(c.name)) continue;
      const cat = (c.categories || []).map((k) => io.categoryMap[k]).find(Boolean);
      const st = byChannel.get(c.id);
      if (!cat || !st || !cfg.categories.includes(cat)) continue;
      channels.push({
        ioId: c.id, name: c.name, cat, region,
        logo: logoOf.get(c.id) || c.logo || '',
        url: st.url,
        ref: st.referrer || st.http_referrer || '',
        ua: st.user_agent || '',
      });
    }
  }
  return { channels, guides };
}

/** Streams are tracked by URL so a replaced stream starts with a clean record. */
export const healthKey = (c) => c.url;
