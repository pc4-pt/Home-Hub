// Per-device settings in localStorage (wrapped: storage can be unavailable).
import { useSyncExternalStore } from 'react';

const KEY = 'homehub.v1';
const defaults = {
  favourites: [],          // channel ids
  recents: [],             // channel ids, most recent first
  failures: {},            // channel id -> consecutive failed plays
  region: 'all',           // 'all' | 'gb' | 'us'
  pinnedApps: null,        // null = automatic (match by name), else [pkg]
};

let state = load();
const subs = new Set();

function load() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

export function update(fn) {
  state = { ...state, ...fn(state) };
  save();
  subs.forEach((s) => s());
}

export const useStore = () =>
  useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => state);

export const toggleFavourite = (id) =>
  update((s) => ({ favourites: s.favourites.includes(id) ? s.favourites.filter((f) => f !== id) : [id, ...s.favourites] }));

export const markWatched = (id) =>
  update((s) => {
    const failures = { ...s.failures };
    delete failures[id];
    return { recents: [id, ...s.recents.filter((r) => r !== id)].slice(0, 12), failures };
  });

export const markFailed = (id) =>
  update((s) => ({ failures: { ...s.failures, [id]: (s.failures[id] || 0) + 1 } }));

export const resetFailures = () => update(() => ({ failures: {} }));
export const resetAll = () => update(() => ({ ...defaults }));

/** Two failed attempts in a row: treat as not playable here (usually geo-blocked). */
export const isUnavailable = (s, id) => (s.failures[id] || 0) >= 2;
