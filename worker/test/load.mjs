/* A launch-day rehearsal: 500 visitors building shelves on make/ over 10 minutes, against the Worker as it is in
   src/index.js, run in the runtime wrangler dev uses (Miniflare). Nothing real is asked: TMDB, Open Library, the scan
   providers and the image hosts are made up here, with their usual delays (Open Library slow, sometimes very), and
   the scan caps are the live ones from wrangler.toml. No key is needed and nothing is spent.

     cd worker && node test/load.mjs                      (500 visitors, 10 minutes squeezed into 30 s: 20x as busy)
     node test/load.mjs --visitors 500 --minutes 10 --speed 1     (in real time: 10 minutes)

   Each visitor does what the page does: types each title (two suggestions as they type, from /identify), picks it,
   asks /scans round 0 (with the title's id), loads the scans (or only the found ones) and the cover through /img,
   and tells /found which scans it cut clean spines from; a pending answer is asked again 3 s later. Titles are
   picked the way people pick them: a few very popular ones, a long tail.

   It prints what the Worker was asked, how long answers took, what the scan providers spent, and how that compares
   with the free plans' limits. */
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d; };
const VISITORS = arg('visitors', 500), MINUTES = arg('minutes', 10), SPEED = arg('speed', 20), TITLES = arg('titles', 8);
const pause = ms => new Promise(r => setTimeout(r, ms));
const jitter = (ms, tail = 0) => ms * (0.6 + Math.random() * 0.8) * (Math.random() < tail ? 3 : 1);

/* ---------- the made-up world ---------- */
const CATALOG = Array.from({length: 600}, (_, i) => ({title: `title ${i}`, kind: i % 3 ? 'movie' : 'book', id: i % 3 ? String(1000 + i) : `OL${1000 + i}W`, year: String(1960 + i % 60), scan: i % 5 < 3}));
const zipf = (() => { const w = CATALOG.map((_, i) => 1 / Math.pow(i + 1, 1.05)), sum = w.reduce((a, b) => a + b); let acc = 0; const cdf = w.map(x => (acc += x) / sum); return () => { const r = Math.random(); return CATALOG[cdf.findIndex(c => c >= r)]; }; })();
const upstream = {tmdb: 0, openlibrary: 0, wikidata: 0, serper: 0, serpapi: 0, brave: 0, archiveorg: 0, images: 0};
const json = o => new Response(JSON.stringify(o), {headers: {'Content-Type': 'application/json'}});
const JPEG = (() => { const b = new Uint8Array(64); b.set([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]); return b; })();
const titleOf = q => (/"([^"]+)"/.exec(q) || [, q])[1].replace(/ (\d{4}|dvd|book|cover|spine|scan|english|criterion|dust|jacket|full|wrap|someone).*$/, '').trim();
async function outbound(request) {
  const url = new URL(request.url), h = url.hostname;
  if (h === 'api.themoviedb.org') {
    upstream.tmdb++; await pause(jitter(220, 0.05));
    const q = (url.searchParams.get('query') || '').toLowerCase();
    if (url.pathname.endsWith('/credits')) return json({crew: [{job: 'Director', name: 'Someone'}]});
    return json({results: CATALOG.filter(t => t.kind === 'movie' && t.title.startsWith(q)).slice(0, 20).map(t => ({id: +t.id, title: t.title, release_date: t.year + '-01-01', vote_count: 10, poster_path: '/' + t.id + '.jpg'}))});
  }
  if (h === 'openlibrary.org') {
    upstream.openlibrary++; await pause(jitter(1200, 0.12));   // Open Library: about a second, and one in eight much slower
    const q = (url.searchParams.get('q') || '').toLowerCase();
    return json({docs: CATALOG.filter(t => t.kind === 'book' && t.title.startsWith(q)).slice(0, 10).map(t => ({key: '/works/' + t.id, title: t.title, author_name: ['Someone Writer'], first_publish_year: +t.year, cover_i: 1, edition_count: 5, readinglog_count: 10}))});
  }
  if (h === 'www.wikidata.org') { upstream.wikidata++; await pause(jitter(300)); return json({search: []}); }
  const scanned = name => async title => {
    upstream[name]++; await pause(jitter(name === 'archiveorg' ? 2500 : 900, 0.1));
    const t = CATALOG.find(x => x.title === title), ok = t && t.scan;
    return ok ? [{title: `${title} dvd cover scan`, page: `https://www.dvd-covers.org/${encodeURIComponent(title)}`, img: `https://scans.example/${encodeURIComponent(title)}-${name}.jpg`, w: 1500, h: 1000}] : [];
  };
  if (h === 'google.serper.dev') { const {q} = await request.json(); const items = await scanned('serper')(titleOf(q)); return json({credits: 2, images: items.map(i => ({title: i.title, link: i.page, imageUrl: i.img, imageWidth: i.w, imageHeight: i.h}))}); }
  if (h === 'serpapi.com') { const items = await scanned('serpapi')(titleOf(url.searchParams.get('q'))); return json({images_results: items.map(i => ({title: i.title, link: i.page, original: i.img, original_width: i.w, original_height: i.h}))}); }
  if (h === 'api.search.brave.com') { const items = await scanned('brave')(titleOf(url.searchParams.get('q'))); return json({results: items.map(i => ({title: i.title, url: i.page, properties: {url: i.img, width: i.w, height: i.h}}))}); }
  if (h === 'archive.org') { upstream.archiveorg++; await pause(jitter(2500, 0.1)); return json({response: {docs: []}}); }
  upstream.images++; await pause(jitter(h === 'covers.openlibrary.org' ? 1500 : 250, 0.05));
  return new Response(JPEG, {headers: {'Content-Type': 'image/jpeg', 'Content-Length': '64'}});
}

/* ---------- the Worker, with the live caps ---------- */
const bundle = await build({entryPoints: [fileURLToPath(new URL('../src/index.js', import.meta.url))], bundle: true, format: 'esm', write: false, external: ['cloudflare:workers'], logLevel: 'silent'});
const mf = new Miniflare(convertV4MiniflareOptions({workers: [{
  name: 'spinestack', modules: [{type: 'ESModule', path: 'index.js', contents: bundle.outputFiles[0].text}], compatibilityDate: '2026-09-01',
  kvNamespaces: ['SPINE_CACHE'], r2Buckets: ['MEDIA'], durableObjects: {ARCHIVE: {className: 'Archive', useSQLite: true}},
  bindings: {TMDB_TOKEN: 'tmdb-load-test-token-000000000000000000000', SERPER_KEY: 'k1', SERPAPI_KEY: 'k2', BRAVE_API_KEY: 'k3',
    SERPER_DAILY_CAP: '100', SERPER_TOTAL_CAP: '2400', SERPAPI_DAILY_CAP: '8', BRAVE_DAILY_CAP: '30', ARCHIVE_ORG_DAILY_CAP: '100'},
  outboundService: outbound,
}]}));

/* ---------- the visitors ---------- */
const stats = new Map(), errors = new Map(), outcome = {real: 0, found: 0, generated: 0, capped: 0, pending: 0, slowSearch: 0};
const note = (k, ms, status) => { const s = stats.get(k) || {n: 0, ms: []}; s.n++; s.ms.push(ms); stats.set(k, s); if (status >= 400) errors.set(`${k} ${status === 599 ? 'no local connection (this machine, not the Worker)' : status}`, (errors.get(`${k} ${status === 599 ? 'no local connection (this machine, not the Worker)' : status}`) || 0) + 1); };
async function ask(kind, path, init) {
  const t = Date.now();
  try { const r = await mf.dispatchFetch('http://worker' + path, init); const body = r.headers.get('Content-Type')?.includes('json') ? await r.json() : (await r.arrayBuffer(), null); note(kind, Date.now() - t, r.status); return {status: r.status, body}; }
  catch { note(kind, Date.now() - t, 599); return {status: 599, body: null}; }
}
async function visitor() {
  for (let i = 0; i < TITLES; i++) {
    const t = zipf(), want = t.kind === 'movie' ? 'movie' : 'book';
    await ask('/identify (typing)', `/identify?want=all&q=${encodeURIComponent(t.title.slice(0, 5))}&suggest=1`);
    await pause(jitter(1500) / SPEED);
    await ask('/identify (typing)', `/identify?want=all&q=${encodeURIComponent(t.title)}&suggest=1`);
    const base = `/scans?kind=${want}&title=${encodeURIComponent(t.title)}&year=${t.year}&creator=${t.kind === 'book' ? 'Someone%20Writer' : ''}&id=${t.id}`;
    const cover = ask('/img (cover)', '/img?url=' + encodeURIComponent(t.kind === 'movie' ? `https://image.tmdb.org/t/p/w500/${t.id}.jpg` : `https://covers.openlibrary.org/b/id/${t.id}-L.jpg`));
    const t0 = Date.now();
    let r = (await ask('/scans', base + '&round=0')).body || {};
    for (let k = 0; r.pending && k < 2; k++) { await pause(3000 / Math.min(SPEED, 3)); const a = (await ask('/scans (cacheonly)', base + '&round=0&cacheonly=1')).body || {}; if (a.cached) r = a; }
    if (Date.now() - t0 > 2000) outcome.slowSearch++;
    if (r.found && r.found.length) { outcome.found++; await ask('/img (scan)', '/img?url=' + encodeURIComponent(r.found[0].img)); }
    else if (r.results && r.results.length) {
      outcome.real++;
      await Promise.all(r.results.map(s => ask('/img (scan)', '/img?url=' + encodeURIComponent(s.img))));
      await ask('/found', '/found', {method: 'POST', headers: {'Content-Type': 'text/plain'}, body: JSON.stringify({kind: want, id: t.id, title: t.title, year: t.year, creator: t.kind === 'book' ? 'Someone Writer' : '', cuts: [{img: r.results[0].img, round: 0, score: 88}]})});
    } else {
      outcome[r.capped ? 'capped' : r.pending ? 'pending' : 'generated']++;
      if (!r.capped && !r.pending) for (let round = 1; round < (want === 'book' ? 3 : 4); round++) await ask('/scans (cacheonly)', base + `&round=${round}&cacheonly=1`);
    }
    await cover;
    await pause(jitter(8000) / SPEED);   // looking at it, picking the next
  }
}
const started = Date.now(), spread = MINUTES * 60e3 / SPEED, all = [];
console.log(`${VISITORS} visitors over ${MINUTES} minutes${SPEED > 1 ? `, squeezed into ${Math.round(spread / 1000)} s (${SPEED}x as busy)` : ''}, ${TITLES} titles each...`);
for (let v = 0; v < VISITORS; v++) { all.push(pause(Math.random() * spread).then(visitor)); }
await Promise.all(all);
await mf.dispose();

/* ---------- the report ---------- */
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };
let total = 0;
console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)} s.\n\nWorker requests              count    p50 ms   p95 ms   max ms`);
for (const [k, s] of [...stats].sort()) { total += s.n; console.log(`${k.padEnd(28)} ${String(s.n).padStart(6)} ${String(pct(s.ms, .5)).padStart(9)} ${String(pct(s.ms, .95)).padStart(8)} ${String(Math.max(...s.ms)).padStart(8)}`); }
console.log(`${'all'.padEnd(28)} ${String(total).padStart(6)}   (${Math.round(total / VISITORS)} a visitor)`);
console.log('\nErrors:', errors.size ? Object.fromEntries(errors) : 'none');
console.log('Titles picked:', outcome, '(found: loaded only the scan someone cut before; slowSearch: over 2 s to a spine choice)');
console.log('Asked upstream:', upstream);
const free = 100000;
console.log(`\nAgainst the free plans:
  Workers Free: 100,000 requests a day. This run: ${total} (${Math.round(100 * total / free)}%). Each more visitor like these: ~${Math.round(total / VISITORS)}; the day runs out at ~${Math.floor(free / (total / VISITORS))} visitors making shelves
    (plus every page view's images: a signed-out home view is ~3 Supabase reads and up to ~40 /img and /u/blob requests).
  Scan searches: Serper ${upstream.serper}/100, SerpApi ${upstream.serpapi}/8, Brave ${upstream.brave}/30, archive.org ${upstream.archiveorg}/100 today; titles past them get a spine made from the cover at once.`);
