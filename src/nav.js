// Spatial (D-pad) navigation. Any element with [data-f] is focusable; arrows move
// to the geometrically nearest focusable in that direction inside the active scope
// (the last [data-scope] in the DOM, e.g. a modal, else the whole app).
// A container can set data-edge="<key>" and register a handler with onEdge(key, fn):
// it is called when there is nothing further in that direction (used by the guide
// to page through time and channels).

const SEL = '[data-f]:not([disabled])';
const edgeHandlers = new Map();
let lastFid = null;

export const onEdge = (key, fn) => {
  edgeHandlers.set(key, fn);
  return () => edgeHandlers.get(key) === fn && edgeHandlers.delete(key);
};

function scope() {
  const scopes = document.querySelectorAll('[data-scope]');
  return scopes.length ? scopes[scopes.length - 1] : document.getElementById('stage') || document.body;
}

function visible(el) {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function focusEl(el, { scroll = true } = {}) {
  if (!el) return false;
  el.focus({ preventScroll: true });
  if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (el.dataset.fid) lastFid = el.dataset.fid;
  return true;
}

export function focusFirst(root = scope()) {
  const pref = root.querySelector('[data-autofocus]' + ':is([data-f])') || [...root.querySelectorAll(SEL)].find(visible);
  return focusEl(pref);
}

export function focusFid(fid) {
  const el = fid && scope().querySelector(`[data-fid="${CSS.escape(fid)}"]`);
  return el ? focusEl(el) : false;
}

/** Called after renders: make sure something sensible inside the scope has focus. */
export function ensureFocus() {
  const s = scope();
  const a = document.activeElement;
  if (a && a !== document.body && s.contains(a) && a.matches(SEL) && visible(a)) return;
  if (!focusFid(lastFid)) focusFirst(s);
}

const gap = (a1, a2, b1, b2) => Math.max(0, Math.max(a1, b1) - Math.min(a2, b2));

export function move(dir) {
  const s = scope();
  const cur = document.activeElement;
  if (!cur || !s.contains(cur) || !cur.matches(SEL)) return focusFirst(s);
  const r = cur.getBoundingClientRect();
  const horiz = dir === 'left' || dir === 'right';
  let best = null;
  let bestScore = Infinity;
  for (const el of s.querySelectorAll(SEL)) {
    if (el === cur) continue;
    const c = el.getBoundingClientRect();
    if (!c.width || !c.height) continue;
    let main;
    if (dir === 'right') main = c.left - r.right;
    else if (dir === 'left') main = r.left - c.right;
    else if (dir === 'down') main = c.top - r.bottom;
    else main = r.top - c.bottom;
    if (main < -4) continue; // not in that direction
    if (horiz) {
      // left/right stays on the same row: require real vertical overlap
      const ov = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
      if (ov < Math.min(r.height, c.height) * 0.3) continue;
    }
    // cross-axis: 0 when the boxes overlap, otherwise the gap between them
    const cross = horiz ? gap(r.top, r.bottom, c.top, c.bottom) : gap(r.left, r.right, c.left, c.right);
    const align = horiz ? Math.abs(c.top - r.top) : Math.abs(c.left - r.left);
    const score = Math.max(0, main) + cross * 4 + align * 0.05;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) {
    // Entering a group (tab bar, filter chips) from outside lands on its active item.
    const g = best.closest('[data-group]');
    if (g && !g.contains(cur)) {
      const pref = g.querySelector('[data-f].on');
      if (pref) return focusEl(pref);
    }
    return focusEl(best);
  }
  // nothing that way: give the nearest edge handler a chance
  for (let p = cur.parentElement; p && p !== s.parentElement; p = p.parentElement) {
    const key = p.dataset?.edge;
    if (key && edgeHandlers.has(key) && edgeHandlers.get(key)(dir, cur)) return true;
  }
  return false;
}

export const KEY = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down',
  13: 'ok', 23: 'ok',
  27: 'back', 8: 'back', 4: 'back', 10009: 'back', 461: 'back',
  179: 'playpause', 415: 'play', 19: 'pause', 227: 'rewind', 228: 'ffwd', 412: 'rewind', 417: 'ffwd',
  82: 'menu', 93: 'menu', 33: 'chup', 34: 'chdown',
};
