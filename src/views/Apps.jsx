import { useMemo, useState } from 'react';
import { isNative, installedApps, launchApp, openStore } from '../bridge.js';
import { useStore, update } from '../store.js';

// Matched against installed apps by package first, then by label, so it works on
// Fire OS and Google TV without hard-coding every variant.
export const FEATURED = [
  { name: 'Apple TV', paid: true, match: /apple ?tv/i, web: 'https://tv.apple.com', pkgs: ['com.apple.atve.amazon.appletv', 'com.apple.atve.androidtv.appletv'] },
  { name: 'Prime Video', paid: true, match: /prime video/i, web: 'https://www.primevideo.com', pkgs: ['com.amazon.firebat', 'com.amazon.amazonvideo.livingroom', 'com.amazon.avod.thirdpartyclient'] },
  { name: 'BBC iPlayer', match: /iplayer/i, web: 'https://www.bbc.co.uk/iplayer', pkgs: ['uk.co.bbc.iplayer'] },
  { name: 'ITVX', match: /^itvx|itv hub/i, web: 'https://www.itv.com/watch', pkgs: [] },
  { name: 'Channel 4', match: /^channel 4|^all ?4/i, web: 'https://www.channel4.com', pkgs: [] },
  { name: 'My5', match: /^my ?5$|^channel 5/i, web: 'https://www.channel5.com', pkgs: [] },
  { name: 'Pluto TV', match: /pluto/i, web: 'https://pluto.tv', pkgs: ['tv.pluto.android'] },
  { name: 'Tubi', match: /^tubi/i, web: 'https://tubitv.com', pkgs: ['com.tubitv', 'com.tubitv.ott'] },
  { name: 'Plex', match: /^plex$/i, web: 'https://watch.plex.tv', pkgs: ['com.plexapp.android'] },
  { name: 'YouTube', match: /^youtube$/i, web: 'https://www.youtube.com', pkgs: ['com.amazon.firetv.youtube', 'com.google.android.youtube.tv'] },
];

let cache = null;
const getInstalled = () => (cache ??= installedApps());

function resolveFeatured(installed) {
  return FEATURED.map((f) => {
    const app = installed.find((a) => f.pkgs.includes(a.pkg)) || installed.find((a) => f.match.test(a.label));
    return { ...f, app };
  });
}

function usePinned() {
  const store = useStore();
  return useMemo(() => {
    if (!isNative) return FEATURED.map((f) => ({ key: f.name, label: f.name, web: f.web, paid: f.paid }));
    const installed = getInstalled();
    if (store.pinnedApps) {
      return store.pinnedApps
        .map((pkg) => installed.find((a) => a.pkg === pkg))
        .filter(Boolean)
        .map((a) => ({ key: a.pkg, label: a.label, app: a }));
    }
    // Automatic: installed featured apps, plus a "get it" tile for the paid ones you said you'll use.
    return resolveFeatured(installed)
      .filter((f) => f.app || f.paid)
      .map((f) => ({ key: f.app?.pkg || f.name, label: f.name, app: f.app, missing: !f.app, storePkg: f.pkgs[0] }));
  }, [store.pinnedApps]);
}

function open(item, say) {
  if (item.app) {
    if (!launchApp(item.app.pkg)) say?.(`Couldn't open ${item.label}`);
  } else if (item.missing) {
    openStore(item.storePkg);
  } else if (item.web) {
    window.open(item.web, '_blank', 'noopener');
  }
}

function AppTile({ item, say, onMenu, pinned }) {

  return (
    <button
      data-f
      data-fid={`app-${item.key}`}
      className={`apptile ${item.missing ? 'missing' : ''}`}
      onClick={() => open(item, say)}
      ref={(el) => {
        if (!el || !onMenu) return;
        el.addEventListener('hubmenu', onMenu);
        return () => el.removeEventListener('hubmenu', onMenu);
      }}
    >
      <div className="appcard">
        {item.app?.banner ? <img src={item.app.banner} alt="" />
          : item.app?.icon ? <><img className="icon" src={item.app.icon} alt="" /><span className="under">{item.label}</span></>
          : <span>{item.label}</span>}
        {pinned && <span className="fav">★</span>}
      </div>
      <div className="t-name">{item.missing ? `Get ${item.label}` : item.label}</div>
    </button>
  );
}

export function AppRow() {
  const pinned = usePinned();
  if (!pinned.length) return null;
  return (
    <section className="row">
      <h2>Your apps {!isNative && <span className="note">Opens the websites here · opens the installed apps on the Fire TV</span>}</h2>
      <div className="strip">{pinned.map((it) => <AppTile key={it.key} item={it} />)}</div>
    </section>
  );
}

export default function Apps({ say, store }) {
  const pinned = usePinned();
  const [installed] = useState(() => (isNative ? getInstalled() : []));
  const pinnedPkgs = store.pinnedApps ?? pinned.filter((p) => p.app).map((p) => p.app.pkg);

  const togglePin = (pkg, label) => {
    const next = pinnedPkgs.includes(pkg) ? pinnedPkgs.filter((p) => p !== pkg) : [...pinnedPkgs, pkg];
    update(() => ({ pinnedApps: next }));
    say(pinnedPkgs.includes(pkg) ? `Unpinned ${label}` : `Pinned ${label} to Home`);
  };

  return (
    <div className="page">
      <section className="row">
        <h2>Your apps</h2>
        <div className="grid">{pinned.map((it) => <AppTile key={it.key} item={it} say={say} />)}</div>
      </section>
      {isNative ? (
        <section className="row">
          <h2>All apps <span className="note">Press ≡ to pin or unpin from Home</span></h2>
          <div className="grid">
            {installed.map((a) => (
              <AppTile key={a.pkg} item={{ key: `all-${a.pkg}`, label: a.label, app: a }} say={say} pinned={pinnedPkgs.includes(a.pkg)} onMenu={() => togglePin(a.pkg, a.label)} />
            ))}
          </div>
        </section>
      ) : (
        <p className="hint">You're viewing the hub in a browser. On the Fire TV, this page lists your installed apps, and Apple TV, Prime Video and the free UK apps open directly.</p>
      )}
    </div>
  );
}
