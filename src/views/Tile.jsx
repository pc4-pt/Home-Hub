import { memo } from 'react';
import { nowNext, progress, REGION_FLAG } from '../data.js';

export const Logo = ({ ch, className = '' }) =>
  ch.logo ? (
    <img className={`logo ${className}`} src={ch.logo} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
  ) : (
    <div className={`logo text ${className}`}>{ch.name}</div>
  );

const Tile = memo(function Tile({ ch, progs, now, fav, bad, onPlay, onFocus }) {
  const [cur] = nowNext(progs, now);
  return (
    <button
      data-f
      data-fid={`ch-${ch.id}`}
      data-channel={ch.id}
      className={`tile ${bad ? 'bad' : ''}`}
      onClick={onPlay}
      onFocus={onFocus}
    >
      <div className="card">
        <Logo ch={ch} />
        <span className="badge">{REGION_FLAG[ch.region]}</span>
        {fav && <span className="fav">★</span>}
        {cur && <div className="bar"><i style={{ width: `${progress(cur, now) * 100}%` }} /></div>}
      </div>
      <div className="t-name">{ch.name}</div>
      <div className="t-sub">{bad ? 'Not playing from here' : cur ? cur[2] : ch.srcName}</div>
    </button>
  );
});
export default Tile;
