import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { onEdge, move, focusFid } from '../nav.js';
import { CATS, fmtTime, nowNext, progress, REGION_FLAG } from '../data.js';
import { isUnavailable } from '../store.js';
import { Logo } from './Tile.jsx';

const WIN = 3 * 3600;         // visible window
const STEP = 1800;            // paging step
const GRID_W = 1500;          // px for the programme area
const PPS = GRID_W / WIN;     // px per second
const RENDER_AHEAD = 14;      // rows around the focused one that get programme cells

const FILTERS = [{ id: 'all', label: 'All channels' }, ...CATS, { id: 'fav', label: 'Favourites' }];

const floorHalfHour = (t) => t - (t % 1800);

const GuideRow = memo(function GuideRow({ ch, num, progs, t0, now, live, fav, bad, playAt, onFocusProg }) {
  const onPlay = () => playAt(num - 1);
  const cells = [];
  if (live) {
    const end = t0 + WIN;
    const vis = (progs || []).filter((p) => p[1] > t0 && p[0] < end);
    if (!vis.length) {
      cells.push(
        <button key="none" data-f data-channel={ch.id} className="prog none" style={{ left: 0, width: GRID_W - 4 }} onClick={onPlay} onFocus={() => onFocusProg(ch, null)}>
          {ch.name} · live
        </button>
      );
    }
    for (const p of vis) {
      const left = Math.max(0, (p[0] - t0) * PPS);
      const right = Math.min(GRID_W, (p[1] - t0) * PPS);
      const onAir = p[0] <= now && p[1] > now;
      cells.push(
        <button
          key={p[0]}
          data-f
          data-fid={`p-${ch.id}-${p[0]}`}
          data-channel={ch.id}
          className={`prog ${onAir ? 'onair' : ''} ${p[1] <= now ? 'past' : ''}`}
          style={{ left, width: Math.max(8, right - left - 4) }}
          onClick={onPlay}
          onFocus={() => onFocusProg(ch, p)}
        >
          {p[0] < t0 && <span className="cont">‹</span>}
          <b>{p[2]}</b>
          <small>{fmtTime(p[0])}{p[3] ? ` · ${p[3]}` : ''}</small>
        </button>
      );
    }
  }
  return (
    <div className={`grow ${bad ? 'bad' : ''}`}>
      <button data-f data-fid={`ch-${ch.id}`} data-channel={ch.id} className="gch" onClick={onPlay} onFocus={() => onFocusProg(ch, nowNext(progs, now)[0] || null)}>
        <span className="num">{num}</span>
        <Logo ch={ch} className="small" />
        <span className="gname">{ch.name}<small>{REGION_FLAG[ch.region]}{fav ? ' ★' : ''}{bad ? ' · not playing here' : ''}</small></span>
      </button>
      <div className="gcells">{cells}</div>
    </div>
  );
});

export default function Guide({ channels, guide, now, play, store, guideRange }) {
  const [filter, setFilter] = useState('all');
  const [t0, setT0] = useState(() => floorHalfHour(now));
  const [focus, setFocus] = useState({ row: 0, ch: null, prog: null });
  const pending = useRef(null);

  const list = useMemo(() => {
    if (filter === 'all') return channels;
    if (filter === 'fav') return channels.filter((c) => store.favourites.includes(c.id));
    return channels.filter((c) => c.cat === filter);
  }, [channels, filter, store.favourites]);

  const index = useMemo(() => new Map(list.map((c, i) => [c.id, i])), [list]);
  const maxT0 = guideRange?.[1] ? floorHalfHour(guideRange[1] - WIN + STEP) : t0 + 12 * 3600;
  const minT0 = floorHalfHour(Math.max(now - 3600, guideRange?.[0] || 0));

  // Paging through time when the focus runs off the visible window.
  useEffect(() => onEdge('guide', (dir) => {
    if (dir === 'right' && t0 < maxT0) { pending.current = 'right'; setT0(t0 + STEP); return true; }
    if (dir === 'left' && t0 > minT0) { pending.current = 'left'; setT0(t0 - STEP); return true; }
    return false;
  }), [t0, maxT0, minT0]);

  useLayoutEffect(() => {
    if (pending.current) { const d = pending.current; pending.current = null; move(d); }
  }, [t0]);

  const onFocusProg = useCallback((ch, prog) => setFocus({ row: index.get(ch.id) ?? 0, ch, prog }), [index]);
  const playAt = useCallback((i) => play(list, i), [play, list]);

  const nowX = (now - t0) * PPS;
  const ticks = [];
  for (let t = t0; t < t0 + WIN; t += 1800) ticks.push(t);
  const { ch: fch, prog: fp } = focus;

  return (
    <div className="guide">
      <section className="gdetail">
        {fch ? (
          <>
            <div className="gd-ch"><Logo ch={fch} className="small" /> {fch.name}</div>
            <h1>{fp ? fp[2] : 'Live channel'}</h1>
            {fp && (
              <div className="hero-time">
                {fmtTime(fp[0])} – {fmtTime(fp[1])}{fp[3] && <> · {fp[3]}</>}
                {fp[0] <= now && fp[1] > now && <span className="left">On now</span>}
              </div>
            )}
            {fp && fp[0] <= now && fp[1] > now && <div className="bar big"><i style={{ width: `${progress(fp, now) * 100}%` }} /></div>}
            <p>{fp ? fp[4] : 'No programme information for this channel.'}</p>
          </>
        ) : (
          <p className="dim">Use ◀ ▶ to move through time, ▲ ▼ for channels, OK to watch, ≡ to favourite.</p>
        )}
      </section>

      <div className="gfilters" data-group>
        {FILTERS.map((f) => (
          <button key={f.id} data-f data-fid={`gf-${f.id}`} className={`chip ${filter === f.id ? 'on' : ''}`}
            onClick={() => { setFilter(f.id); setFocus({ row: 0, ch: null, prog: null }); setTimeout(() => focusFid(`gf-${f.id}`), 0); }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="gtimes">
        <div className="gday">{new Date(t0 * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
        <div className="gticks">
          {ticks.map((t) => <span key={t} style={{ left: (t - t0) * PPS }}>{fmtTime(t)}</span>)}
        </div>
      </div>

      <div className="gwrap">
      {nowX > 0 && nowX < GRID_W && <div className="nowline" style={{ left: 380 + nowX }} />}
      <div className="gbody" data-edge="guide">
        {list.map((ch, i) => (
          <GuideRow
            key={ch.id}
            ch={ch}
            num={i + 1}
            progs={guide[ch.id]}
            t0={t0}
            now={Math.floor(now / 60) * 60}
            live={Math.abs(i - focus.row) <= RENDER_AHEAD}
            fav={store.favourites.includes(ch.id)}
            bad={isUnavailable(store, ch.id)}
            playAt={playAt}
            onFocusProg={onFocusProg}
          />
        ))}
        {!list.length && <div className="state">{filter === 'fav' ? 'No favourites yet — press ≡ on any channel.' : 'No channels.'}</div>}
      </div>
      </div>
    </div>
  );
}
