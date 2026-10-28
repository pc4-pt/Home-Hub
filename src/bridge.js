// Talks to the Fire TV wrapper (android/) when running inside it.
// In a normal browser every call degrades gracefully.

const N = typeof window !== 'undefined' ? window.HubNative : undefined;
export const isNative = !!N;

const listeners = new Set();
export const onNativeEvent = (fn) => (listeners.add(fn), () => listeners.delete(fn));

// The wrapper calls window.hubNativeEvent(type, json) and window.hubNativeBack().
if (typeof window !== 'undefined') {
  window.hubNativeEvent = (type, json) => {
    let data = {};
    try { data = json ? JSON.parse(json) : {}; } catch { /* ignore */ }
    listeners.forEach((fn) => fn(type, data));
  };
}

/** Hand a channel list to the native ExoPlayer; CH+/CH- (and up/down) zap within it. */
export function playNative(list, index) {
  const items = list.map(({ id, name, url, ref, ua, logo }) => ({ id, name, url, ref: ref || '', ua: ua || '', logo: logo || '' }));
  N.play(JSON.stringify({ index, items }));
}

/** Installed launchable apps: [{pkg, label}] */
export function installedApps() {
  if (!N) return [];
  try { return JSON.parse(N.listApps()); } catch { return []; }
}

export function launchApp(pkg) {
  return N ? N.launch(pkg) : false;
}

export function openStore(pkg) {
  if (N) N.openStore(pkg);
}

export function appVersion() {
  try { return N ? N.version() : 'browser'; } catch { return 'unknown'; }
}
