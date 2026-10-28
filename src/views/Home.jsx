import { useMemo, useState } from 'react';
import Tile, { Logo } from './Tile.jsx';
import { CATS, nowNext, fmtTime, progress, minsLeft, REGION_FLAG } from '../data.js';
import { isUnavailable } from '../store.js';
import { AppRow } from './Apps.jsx';

const ROW_LIMIT = 40;

function Hero({ ch, progs, now }) {
  if (!ch) return <section className="hero empty" />;
  const [cur, next] = nowNext(progs, now);
  return (
    <section className="hero">
      <div className="hero-logo"><Logo ch={ch} /></div>
      <div className="hero-body">
        <div className="hero-meta">
          <span className="pill">{CATS.find((c) => c.id === ch.cat)?.label}</span>
          <span className="pill dim">{REGION_FLAG[ch.region]} · {ch.srcName}</span>
          <span className="hero-ch">{ch.name}</span>
        </div>
        {cur ? (
          <>
            <h1>{cur[2]}</h1>
            <div className="hero-time">
              {fmtTime(cur[0])} – {fmtTime(cur[1])}
              {cur[3] && <> · {cur[3]}</>}
              <span className="left">{minsLeft(cur, now)} min left</span>
            </div>
            <div className="bar big"><i style={{ width: `${progress(cur, now) * 100}%` }} /></div>
            <p>{cur[4]}</p>
            {next && <div className="hero-next">Next · {fmtTime(next[0])} {next[2]}</div>}
          </>
        ) : (
          <>
            <h1>{ch.name}</h1>
            <p className="dim">No programme information for this channel. Press OK to watch live.</p>
          </>
        )}
      </div>
    </section>
  );
}

function Row({ title, list, all, guide, now, store, play, setHero, note }) {
  if (!list.length) return null;
  const shown = list.slice(0, ROW_LIMIT);
  return (
    <section className="row">
      <h2>{title} <span className="count">{list.length}{list.length > ROW_LIMIT ? ` · ${ROW_LIMIT} shown, all in TV Guide` : ''}</span>{note && <span className="note">{note}</span>}</h2>
      <div className="strip">
        {shown.map((ch) => (
          <Tile
            key={ch.id}
            ch={ch}
            progs={guide[ch.id]}
            now={now}
            fav={store.favourites.includes(ch.id)}
            bad={isUnavailable(store, ch.id)}
            onFocus={() => setHero(ch.id)}
            onPlay={() => play(all || list, (all || list).indexOf(ch))}
          />
        ))}
      </div>
    </section>
  );
}

export default function Home({ channels, guide, now, play, store, byId }) {
  const [heroId, setHero] = useState(null);
  const recents = useMemo(() => store.recents.map((id) => byId.get(id)).filter((c) => c && channels.includes(c)), [store.recents, byId, channels]);
  const favs = useMemo(() => channels.filter((c) => store.favourites.includes(c.id)), [channels, store.favourites]);
  const byCat = useMemo(() => Object.fromEntries(CATS.map((c) => [c.id, channels.filter((ch) => ch.cat === c.id)])), [channels]);
  const hero = byId.get(heroId) || recents[0] || channels[0];
  const rowProps = { guide, now, store, play, setHero };

  return (
    <div className="home">
      <Hero ch={hero} progs={guide[hero?.id]} now={now} />
      <div className="rows">
        <Row title="Continue watching" list={recents} {...rowProps} />
        <AppRow />
        <Row title="Favourites" list={favs} {...rowProps} note="Press ≡ on any channel to add or remove" />
        {CATS.map((c) => <Row key={c.id} title={c.label} list={byCat[c.id]} {...rowProps} />)}
        {!channels.length && <div className="state">No channels for this region. Change it in Settings.</div>}
      </div>
    </div>
  );
}
