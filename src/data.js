import { useEffect, useState } from 'react';

export const CATS = [
  { id: 'films', label: 'Films' },
  { id: 'boxsets', label: 'Box sets' },
  { id: 'sport', label: 'Sport' },
];
export const REGION_FLAG = { gb: 'UK', us: 'US' };

const bust = () => Math.floor(Date.now() / 600000); // 10-minute cache buster

export function useCatalogue() {
  const [state, setState] = useState({ loading: true, channels: [], guide: {}, meta: null, error: null });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const ch = await fetch(`catalog/channels.json?v=${bust()}`).then((r) => {
          if (!r.ok) throw new Error(`channels.json: HTTP ${r.status}`);
          return r.json();
        });
        if (!alive) return;
        setState((s) => ({ ...s, loading: false, channels: ch.channels, meta: ch, error: null }));
        const g = await fetch(`catalog/guide.json?v=${bust()}`).then((r) => (r.ok ? r.json() : { programmes: {} }));
        if (alive) setState((s) => ({ ...s, guide: g.programmes || {}, guideRange: [g.from, g.to] }));
      } catch (e) {
        if (alive) setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return state;
}

/** Ticks every 30 s so progress bars and "now" stay current. */
export function useNow(period = 30000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), period);
    return () => clearInterval(t);
  }, [period]);
  return now;
}

/** [current, next] programme for a channel, or [] */
export function nowNext(progs, now) {
  if (!progs) return [];
  const i = progs.findIndex((p) => p[0] <= now && p[1] > now);
  if (i === -1) {
    const n = progs.find((p) => p[0] > now);
    return n ? [null, n] : [];
  }
  return [progs[i], progs[i + 1] || null];
}

export const fmtTime = (t) =>
  new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export const progress = (p, now) => (p ? Math.min(1, Math.max(0, (now - p[0]) / (p[1] - p[0]))) : 0);

export const minsLeft = (p, now) => (p ? Math.max(0, Math.round((p[1] - now) / 60)) : 0);
