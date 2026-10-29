# Home hub: Phase 1 (Watch)

This is a TV-style home screen for the Fire TV, built to be driven with the remote:

- **Home:** what's on now, rows of free **Films**, **Box sets** and **Sport** channels, Continue watching, Favourites, and **Your apps** (Apple TV, Prime Video, and the free UK apps if they're installed).
- **TV Guide:** a grid with now and next, 12 hours ahead. Filter by category or favourites.
- **Apps:** every installed app. Press ≡ on an app to pin or unpin it from Home.
- **Settings:** choose UK/US/both, see where the channels come from, and reset things.
- **Cameras / Music:** placeholders. They arrive in Phase 2 with Home Assistant.

The project has three parts:

| Part | Where | What it does |
|---|---|---|
| Web app (`src/`) | React + Vite, hosted on GitHub Pages | Everything you see |
| Catalogue (`scripts/build-catalog.mjs`, `sources.json`) | GitHub Actions, every 4 h | Fetches free UK/US playlists and guides, keeps only film/box-set/sport channels, and writes small JSON files for the TV |
| Fire TV app (`android/`) | Kotlin, built by GitHub Actions | Full-screen wrapper. It plays video with the native ExoPlayer (smoother than a WebView on a stick, and it can send the headers some streams need), launches other apps, and forwards Back, ≡ and media keys |

## Where the channels come from

The channels are UK/US free-to-air streams from [iptv-org](https://github.com/iptv-org/iptv), filtered to film, box-set and sport channels. iptv-org's blocklist is applied and geo-blocked streams are skipped. BBC, ITV, Channel 4 and 5 are deliberately left out; use their own apps from the Apps row. The ad-supported services (Pluto TV, Plex, Tubi, The Roku Channel) are reached through their official apps, which appear in Your apps when installed. The third-party playlists for those services were withdrawn after a DMCA notice. `sources.json` still accepts any M3U + XMLTV source you're entitled to use.

Two scheduled jobs keep the list honest:

| Workflow | When | What |
|---|---|---|
| *Daily stream check + TV guide* (`maintain.yml`) | 03:23 UTC | Probes every stream (playlist, then first variant). A stream is hidden after failing **2 checks in a row**. Then it runs iptv-org's guide grabber for the working channels and publishes `health.json` + `guide.xml.gz` to the `data-latest` release. Finally it triggers a site rebuild. |
| *Hub site + channel catalogue* (`pages.yml`) | every 4 h | Builds the catalogue from iptv-org, minus hidden streams, plus the latest guide, and deploys the site. |

What to expect:
- **The stream check runs on GitHub's US servers.** It catches dead and broken streams, but not ones blocked only in Portugal. The app handles those: two failed plays on the TV and the channel moves to the end of its list, marked "Not playing from here". You can reset this in Settings.
- **Guide coverage is partial.** Only channels that iptv-org can map to a listings site get programmes. The rest show as "live".
- **Premium sport isn't in here.** Premier League, Sky, TNT, DAZN and the like are paid.

## Setup (one-off, about 20 minutes)

1. **Create a GitHub repo and push this folder to `main`.** Make it public: GitHub Pages is free for public repos, and the Fire TV needs to download the APK without logging in. Nothing secret lives in this repo.
2. **Turn on Pages:** go to Settings → Pages → Source and choose **GitHub Actions**.
3. **Build the site:** go to Actions → *Daily stream check + TV guide* → Run workflow. The first run takes 20–60 minutes, and the site rebuilds itself when it finishes. (*Hub site + channel catalogue* on its own also works, just without the stream check and guide.) When it finishes, your hub is at `https://<you>.github.io/<repo>/`. Open it in a desktop browser and use the arrow keys, Enter, Esc and `f` to check it.
4. **(Recommended) Signing key:** run `scripts/make-keystore.sh` once, from inside the repo with the `gh` CLI logged in. Without it, each APK build is signed differently and you'd have to uninstall before every update.
5. **Build the Fire TV app:** go to Actions → *Fire TV app (APK)* → Run workflow. It publishes `home-hub.apk` on a release called `apk-latest`. To point the app somewhere other than GitHub Pages (later, a box on your LAN), set a repository variable `HUB_URL`.
6. **Install it on the Fire TV:**
   - Settings → My Fire TV → About: click the device name 7 times to enable Developer Options. Then go to Developer Options and turn on **Install unknown apps** for **Downloader**. Install *Downloader* from the Amazon Appstore if you don't have it.
   - In Downloader, enter `https://github.com/<you>/<repo>/releases/download/apk-latest/home-hub.apk`.
   - Alternative from a laptop: `adb connect <firetv-ip>` then `adb install -r home-hub.apk`.
   - "Home" then appears with your apps. To make it the first thing you see, move it to the front of the Fire TV app row.

> **Device check:** this needs a Fire TV running **Fire OS** (4K Max, Cube, older sticks, Fire TV TVs). The **Fire TV Stick 4K Select** and the 2026 Wi-Fi 6 **Fire TV Stick HD** run Vega OS and can't install it. A Google TV Streamer also works.

## Remote control

| Key | Home / Guide | Player |
|---|---|---|
| ◀ ▲ ▶ ▼ | Move. In the guide, ◀ ▶ also pages through time | ▲ ▼ change channel |
| OK | Watch / open | Show the channel banner |
| ≡ (Menu) | Add or remove a favourite (Apps: pin or unpin) | Show the channel banner |
| Back | Back to Home, then leave the app | Return to the hub |
| ⏯ | | Pause / resume |

In a desktop browser, use the arrow keys, Enter, Esc/Backspace for Back, and `f` for ≡.

## Local development

```bash
npm install
npm run catalog:sample   # offline sample data (all channels play a test stream)
npm run catalog          # or: build the real catalogue (needs internet)
npm run dev              # http://localhost:5173
```

To try the Fire TV app against your laptop, build it with `-PhubUrl=http://<laptop-ip>:5173/` and run `npm run dev -- --host`.

## Status

- The web app and catalogue builder were tested headless: D-pad navigation, guide paging, favourites, the player error path, and a simulated Fire TV bridge for app launching.
- The catalogue builder was tested against local copies of the playlist and XMLTV formats. Its first run against the live sources happens in GitHub Actions.
- **The Android app hasn't been compiled or run on a device yet.** The build environment couldn't reach Google's Maven repository, so the first CI run is its first build. If it fails, paste the error and I'll fix it.

## Phase 2 (Home Assistant)

Phase 2 adds Cameras and Music tabs and a notification overlay. These will talk to Home Assistant's WebSocket API using a long-lived token stored **only on the TV**, never in this repo. The wrapper already allows plain-HTTP requests to the LAN, so the hub can reach `http://homeassistant.local:8123` even though it's served from HTTPS.
