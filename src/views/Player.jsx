// In-browser player (used when the hub is opened in a normal browser).
// On the Fire TV the wrapper's native ExoPlayer is used instead.
import { useEffect, useRef, useState } from 'react';
import { Logo } from './Tile.jsx';
import { fmtTime, nowNext, progress } from '../data.js';

export default function Player({ list, index, setIndex, guide, now, registerKeys, onFail, onPlaying }) {
  const ch = list[index];
  const video = useRef(null);
  const [err, setErr] = useState(null);
  const [osd, setOsd] = useState(true);
  const osdTimer = useRef(0);

  const showOsd = () => {
    setOsd(true);
    clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsd(false), 5000);
  };

  useEffect(() => {
    let hls;
    let dead = false;
    const v = video.current;
    setErr(null);
    showOsd();
    const fail = (why) => {
      if (dead) return;
      dead = true;
      onFail(ch.id);
      const mixed = location.protocol === 'https:' && ch.url.startsWith('http:');
      setErr(mixed ? 'This stream is plain HTTP, which browsers block on a secure page. It will play in the Fire TV app.'
        : ch.ref || ch.ua ? 'This stream needs special request headers that only the Fire TV app can send.'
        : `This channel won't play from here right now (${why}). It may be restricted to the UK or US.`);
    };
    v.onplaying = () => onPlaying(ch.id);
    v.onerror = () => fail('media error');
    (async () => {
      if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = ch.url;
      } else {
        const { default: Hls } = await import('hls.js');
        if (!Hls.isSupported()) return fail('HLS not supported');
        hls = new Hls({ maxBufferLength: 20 });
        hls.on(Hls.Events.ERROR, (_e, d) => d.fatal && fail(d.details));
        hls.loadSource(ch.url);
        hls.attachMedia(v);
      }
      v.play().catch(() => {});
    })().catch((e) => fail(e.message));
    return () => { dead = true; hls?.destroy(); v.removeAttribute('src'); v.load(); };
  }, [ch.id]);

  useEffect(() => {
    registerKeys((k) => {
      if (k === 'up' || k === 'chup') { setIndex((index - 1 + list.length) % list.length); return true; }
      if (k === 'down' || k === 'chdown') { setIndex((index + 1) % list.length); return true; }
      if (k === 'ok' || k === 'left' || k === 'right' || k === 'menu') { showOsd(); return k !== 'menu'; }
      if (k === 'playpause') { const v = video.current; v.paused ? v.play() : v.pause(); return true; }
      return false; // back is handled by the app
    });
    return () => registerKeys(null);
  }, [index, list.length]);

  const [cur, next] = nowNext(guide[ch.id], now);
  return (
    <div className="player" data-scope>
      <video ref={video} autoPlay playsInline />
      {err && <div className="perr"><b>{ch.name}</b><p>{err}</p><small>▲ ▼ to change channel · Back to close</small></div>}
      <div className={`osd ${osd || err ? 'show' : ''}`}>
        <div className="osd-num">{index + 1}</div>
        <Logo ch={ch} className="small" />
        <div className="osd-body">
          <div className="osd-ch">{ch.name}</div>
          {cur ? (
            <>
              <div className="osd-title">{cur[2]} <span>{fmtTime(cur[0])} – {fmtTime(cur[1])}</span></div>
              <div className="bar"><i style={{ width: `${progress(cur, now) * 100}%` }} /></div>
              {next && <div className="osd-next">Next {fmtTime(next[0])} · {next[2]}</div>}
            </>
          ) : <div className="osd-title">Live</div>}
        </div>
        <div className="osd-help">▲ ▼ channel · Back to close</div>
      </div>
      <button data-f className="sr" aria-label="player" />
    </div>
  );
}
