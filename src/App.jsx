import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KEY, move, ensureFocus, focusFid } from './nav.js';
import { useCatalogue, useNow, fmtTime } from './data.js';
import { useStore, update, markFailed, markWatched, isUnavailable, toggleFavourite } from './store.js';
import { isNative, playNative, onNativeEvent } from './bridge.js';
import Home from './views/Home.jsx';
import Guide from './views/Guide.jsx';
import Apps from './views/Apps.jsx';
import Settings from './views/Settings.jsx';
import Player from './views/Player.jsx';

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'guide', label: 'TV Guide' },
  { id: 'apps', label: 'Apps' },
  { id: 'settings', label: 'Settings' },
];
const SOON = ['Cameras', 'Music'];

function useStageScale() {
  useLayoutEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      const el = document.getElementById('stage');
      el.style.transform = `scale(${s})`;
      el.style.left = `${(window.innerWidth - 1920 * s) / 2}px`;
      el.style.top = `${(window.innerHeight - 1080 * s) / 2}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
}

export default function App() {
  useStageScale();
  const cat = useCatalogue();
  const store = useStore();
  const now = useNow();
  const [view, setView] = useState('home');
  const [player, setPlayer] = useState(null); // {list, index} for the in-browser player
  const [toast, setToast] = useState(null);
  const keyHandler = useRef(null);
  const toastTimer = useRef(0);

  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Region filter; channels that keep failing here sink to the end of every list.
  const channels = useMemo(() => {
    const list = cat.channels.filter((c) => store.region === 'all' || c.region === store.region);
    const bad = (c) => (isUnavailable(store, c.id) ? 1 : 0);
    return [...list].sort((a, b) => bad(a) - bad(b));
  }, [cat.channels, store]);

  const byId = useMemo(() => new Map(cat.channels.map((c) => [c.id, c])), [cat.channels]);

  const play = useCallback((list, index) => {
    const ch = list[index];
    if (!ch) return;
    if (isNative) {
      playNative(list, index);
      markWatched(ch.id);
    } else {
      setPlayer({ list, index });
    }
  }, []);

  const goBack = useCallback(() => {
    if (player) { setPlayer(null); return true; }
    if (view !== 'home') { setView('home'); setTimeout(() => focusFid('tab-home'), 0); return true; }
    return false;
  }, [player, view]);

  // Events from the native player
  useEffect(() => onNativeEvent((type, d) => {
    if (type === 'error' && d.id) {
      markFailed(d.id);
      say(`${byId.get(d.id)?.name || 'Channel'} won't play from here right now — often a regional restriction.`);
    }
    if (type === 'playing' && d.id) markWatched(d.id);
    if (type === 'closed' && d.id) setTimeout(() => focusFid(`ch-${d.id}`), 50);
  }), [byId, say]);

  // Remote control keys. Arrows/OK arrive as normal key events; the Fire TV wrapper
  // forwards Back, Menu and media keys through window.hubNativeBack / hubNativeKey.
  useEffect(() => {
    const handle = (k) => {
      if (keyHandler.current && keyHandler.current(k)) return true;
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { move(k); return true; }
      if (k === 'ok') {
        const a = document.activeElement;
        if (a?.matches('[data-f]')) { a.click(); return true; }
        return false;
      }
      if (k === 'back') return goBack();
      if (k === 'menu') {
        const a = document.activeElement;
        const id = a?.dataset?.channel;
        if (id) {
          const fav = store.favourites.includes(id);
          toggleFavourite(id);
          say(fav ? 'Removed from favourites' : 'Added to favourites');
          return true;
        }
        a?.dispatchEvent(new CustomEvent('hubmenu', { bubbles: true }));
        return true;
      }
      return false;
    };
    const onKey = (e) => {
      const k = KEY[e.keyCode] || (e.key === 'f' ? 'menu' : null);
      if (k && handle(k)) e.preventDefault();
      else if (k === 'back') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.hubNativeBack = () => handle('back');
    window.hubNativeKey = (k) => handle(k);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack, store.favourites, say]);

  useEffect(() => { ensureFocus(); });

  const openView = (id) => { setView(id); setTimeout(() => ensureFocus(), 0); };

  const common = { channels, guide: cat.guide, now, play, store, say };
  return (
    <div id="stage">
      <header className="topbar">
        <div className="brand"><span className="dot" />Home</div>
        <nav className="tabs" data-group>
          {TABS.map((t) => (
            <button key={t.id} data-f data-fid={`tab-${t.id}`} className={`tab ${view === t.id ? 'on' : ''}`} onClick={() => openView(t.id)}>
              {t.label}
            </button>
          ))}
          {SOON.map((s) => <span key={s} className="tab soon" title="Arrives with Home Assistant">{s}<em>soon</em></span>)}
        </nav>
        <div className="clock">{fmtTime(now)}</div>
      </header>

      <main className="content">
        {cat.loading && <div className="state">Loading channels…</div>}
        {cat.error && !cat.channels.length && (
          <div className="state error">
            Couldn't load the channel list ({cat.error}).<br />
            <small>Check the hub address in the Fire TV app, or that the catalogue workflow has run.</small>
          </div>
        )}
        {!cat.loading && !cat.error && (
          <>
            {view === 'home' && <Home {...common} byId={byId} />}
            {view === 'guide' && <Guide {...common} guideRange={cat.guideRange} />}
            {view === 'apps' && <Apps say={say} store={store} />}
            {view === 'settings' && <Settings meta={cat.meta} store={store} total={cat.channels.length} say={say} setRegion={(r) => update(() => ({ region: r }))} />}
          </>
        )}
      </main>

      {player && (
        <Player
          {...player}
          guide={cat.guide}
          now={now}
          setIndex={(index) => setPlayer((p) => ({ ...p, index }))}
          registerKeys={(fn) => (keyHandler.current = fn)}
          onFail={(id) => markFailed(id)}
          onPlaying={(id) => markWatched(id)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
      {cat.meta?.sample && <div className="sample-flag">Sample data</div>}
    </div>
  );
}
