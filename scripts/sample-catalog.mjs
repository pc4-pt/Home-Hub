#!/usr/bin/env node
// Writes an obviously-fake catalogue so the UI can be developed offline.
// Every sample channel plays Mux's public test stream.
import fs from 'node:fs/promises';

const TEST = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const now = Math.floor(Date.now() / 1000);
const t0 = now - (now % 1800) - 3600;
const words = {
  films: ['Midnight Harbour', 'The Long Road West', 'Iron Valley', 'Cold Signal', 'Paper Crown', 'Last Train North', 'Blue Meridian', 'Hollow Point'],
  boxsets: ['Harbour Lane S2', 'Case Files', 'The Bakery S1', 'Night Shift S4', 'Northern Line S3', 'The Inspector S7', 'Lakeside S1'],
  sport: ['Classic Match Replay', 'Fight Night Rewind', 'Extreme Sports Weekly', 'Motorsport Highlights', 'Darts Masters Classics', 'Golf Greatest Rounds'],
};
const names = {
  films: ['Sample Action', 'Sample Thrillers', 'Sample Westerns', 'Sample Classics', 'Sample Comedy Films', 'Sample Horror', 'Sample Family Films', 'Sample Sci-Fi Films'],
  boxsets: ['Sample Crime Drama', 'Sample Sitcoms', 'Sample Mysteries', 'Sample Reality', 'Sample Detectives', 'Sample Soaps'],
  sport: ['Sample Fight Sports', 'Sample Motorsport', 'Sample Extreme', 'Sample Darts', 'Sample Golf'],
};
const colours = ['e85d4a', '4a90e2', 'f5a623', '7ed321', 'bd10e0', '50e3c2', 'ff6f91', '9b9b9b'];
const channels = [];
const programmes = {};
let n = 0;
for (const [cat, list] of Object.entries(names)) {
  list.forEach((name, i) => {
    const id = `sample-${cat}-${i}`;
    const region = i % 2 ? 'us' : 'gb';
    const logo = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" rx="10" fill="#${colours[n % colours.length]}"/><text x="80" y="56" font-family="sans-serif" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${name.split(' ').slice(1).map((w) => w[0]).join('')}</text></svg>`
    )}`;
    channels.push({ id, name, cat, region, src: 'sample', srcName: 'Sample', logo, group: cat, url: TEST });
    if (i === list.length - 1) { n++; return; } // one channel without a guide
    const p = [];
    let t = t0 - ((i * 900) % 1800);
    let k = i;
    while (t < now + 12 * 3600) {
      const len = cat === 'films' ? 5400 + (k % 3) * 1800 : cat === 'sport' ? 3600 * (1 + (k % 2)) : 1800 * (1 + (k % 2));
      const title = words[cat][k % words[cat].length];
      p.push([t, t + len, title, cat === 'boxsets' ? `Episode ${(k % 10) + 1}` : '', `Sample listing for ${title}. Real listings come from the scheduled catalogue build.`, '']);
      t += len; k++;
    }
    programmes[id] = p;
    n++;
  });
}
const out = new URL('../public/catalog/', import.meta.url);
await fs.mkdir(out, { recursive: true });
await fs.writeFile(new URL('channels.json', out), JSON.stringify({ generatedAt: now, sample: true, sources: [{ source: 'Sample data', ok: true, kept: channels.length }], channels }));
await fs.writeFile(new URL('guide.json', out), JSON.stringify({ generatedAt: now, from: t0, to: now + 12 * 3600, programmes }));
console.log(`Wrote ${channels.length} sample channels`);
