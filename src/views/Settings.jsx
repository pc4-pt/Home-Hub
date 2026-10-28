import { appVersion, isNative } from '../bridge.js';
import { resetFailures, update } from '../store.js';
import { fmtTime } from '../data.js';

const REGIONS = [
  { id: 'all', label: 'UK and US' },
  { id: 'gb', label: 'UK only' },
  { id: 'us', label: 'US only' },
];

export default function Settings({ meta, store, total, setRegion, say }) {
  const failing = Object.values(store.failures).filter((n) => n >= 2).length;
  const when = meta?.generatedAt ? new Date(meta.generatedAt * 1000) : null;
  return (
    <div className="page settings">
      <section className="row">
        <h2>Channels</h2>
        <div className="chips" data-group>
          {REGIONS.map((r) => (
            <button key={r.id} data-f data-fid={`reg-${r.id}`} className={`chip ${store.region === r.id ? 'on' : ''}`} onClick={() => setRegion(r.id)}>{r.label}</button>
          ))}
        </div>
      </section>

      <section className="row">
        <h2>Housekeeping</h2>
        <div className="chips">
          <button data-f className="chip" onClick={() => { resetFailures(); say('Channels will be retried'); }}>
            Retry channels that didn't play ({failing})
          </button>
          <button data-f className="chip" onClick={() => { update(() => ({ favourites: [] })); say('Favourites cleared'); }}>Clear favourites</button>
          <button data-f className="chip" onClick={() => { update(() => ({ recents: [] })); say('History cleared'); }}>Clear watch history</button>
          <button data-f className="chip" onClick={() => { update(() => ({ pinnedApps: null })); say('App row reset'); }}>Reset app row</button>
        </div>
      </section>

      <section className="row info">
        <h2>Catalogue</h2>
        <p>{total} channels{when && <> · updated {when.toLocaleDateString('en-GB')} {fmtTime(meta.generatedAt)}</>}{meta?.sample && ' · sample data'}</p>
        <table>
          <tbody>
            {(meta?.sources || []).map((s) => (
              <tr key={s.source} className={s.ok ? '' : 'bad'}>
                <td>{s.source}</td>
                <td>{s.ok ? `${s.kept ?? 0} channels${s.withGuide != null ? ` · ${s.withGuide} with guide` : ''}` : `unavailable (${s.error})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dim">
          Channels are free, ad-supported or free-to-air streams. Some are limited to the UK or US and won't play from
          Portugal; after two failed attempts a channel is moved to the end of its list.
        </p>
      </section>

      <section className="row info">
        <h2>Coming next</h2>
        <p className="dim">Cameras with doorbell pop-ups, Home Assistant notifications and multi-room music arrive once the home server is running.</p>
        <p className="dim">App: {isNative ? `Fire TV ${appVersion()}` : 'browser'} · Hub 0.1.0</p>
      </section>
    </div>
  );
}
