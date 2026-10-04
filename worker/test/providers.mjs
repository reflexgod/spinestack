/* /scans and its providers, run in the runtime wrangler dev uses (Miniflare), with made-up providers: every request
   the Worker sends out is answered here, so no key is needed and no search is spent.

     cd worker && npm test        (node test/providers.mjs)

   It checks the order (Serper, SerpApi, Brave, archive.org), stopping at the first usable scan, each provider's daily
   cap, a provider being left alone for the day after a 429, Serper's credit count, what's kept, /admin/usage, Serper
   being asked without double quotes (and once more, more plainly, after a 400), that no key ever comes back in an
   answer, and /identify giving a book's author in Latin letters when Open Library has them. */
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const bundle = await build({entryPoints: [fileURLToPath(new URL('../src/index.js', import.meta.url))], bundle: true, format: 'esm', write: false, external: ['cloudflare:workers'], logLevel: 'silent'});
const script = bundle.outputFiles[0].text;
const KEYS = {SERPER_KEY: 'serper-secret-key-123', SERPAPI_KEY: 'serpapi-secret-key-456', BRAVE_API_KEY: 'brave-secret-key-789'};
const ADMIN = 'admin-token-for-the-test';

/* ---------- the made-up providers ---------- */
let plan = {};          // what each answers next: 'wrap' (a usable scan of the title asked for), 'junk' (pictures the filters drop), or a status
const calls = [];       // each one asked, in order
const queries = {serper: [], serpapi: [], brave: []};   // what each was asked for
const fresh = () => { calls.length = 0; for (const k in queries) queries[k].length = 0; };
const said = [];        // every answer the Worker gave, to look for keys in
const titleIn = q => (/"([^"]+)"/.exec(q) || [, q])[1];
const answer = (name, title) => {
  const how = plan[name] || 'junk';
  if (typeof how === 'number') return {status: how};
  return {items: how === 'wrap' ? [{title: `${title} dvd cover scan`, page: `https://www.dvd-covers.org/${name}`, img: `https://img.example/${name}/${title.replace(/\W+/g, '-')}-cover.jpg`, w: 1500, h: 1000}]
    : [{title: `${title} poster`, page: 'https://example.com/poster', img: `https://img.example/${name}/poster.jpg`, w: 800, h: 800}]};
};
const jpegHead = (w, h) => { const b = new Uint8Array(64); b.set([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]); b.set([0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3], 20); return b; };
const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'Content-Type': 'application/json'}});
async function outbound(request) {
  const url = new URL(request.url);
  if (url.hostname === 'google.serper.dev') {
    calls.push('serper');
    if (request.headers.get('X-API-KEY') !== KEYS.SERPER_KEY) return json({message: 'Unauthorized.'}, 401);
    const {q, num} = await request.json(), a = answer('serper', titleIn(q));
    assert.equal(num, 100);
    queries.serper.push(q);
    // like the real one: 400 to a search with double quotes in it (and to whatever else the plan says it won't take)
    if (q.includes('"') || (plan.serperRefuses && plan.serperRefuses.test(q))) return json({message: 'Bad request'}, 400);
    if (a.status) return json({message: 'no'}, a.status);
    return json({images: a.items.map(i => ({title: i.title, link: i.page, imageUrl: i.img, imageWidth: i.w, imageHeight: i.h, thumbnailWidth: 300, thumbnailHeight: Math.round(300 * i.h / i.w)})), credits: plan.serperCredits || 2});
  }
  if (url.hostname === 'serpapi.com') {
    calls.push('serpapi');
    if (url.searchParams.get('api_key') !== KEYS.SERPAPI_KEY) return json({error: 'Invalid API key.'}, 401);
    assert.equal(url.searchParams.get('engine'), 'google_images');
    queries.serpapi.push(url.searchParams.get('q'));
    const a = answer('serpapi', titleIn(url.searchParams.get('q')));
    if (a.status) return json({error: 'no'}, a.status);
    return json({images_results: a.items.map(i => ({title: i.title, link: i.page, original: i.img, original_width: i.w, original_height: i.h}))});
  }
  if (url.hostname === 'api.search.brave.com') {
    calls.push('brave');
    if (request.headers.get('X-Subscription-Token') !== KEYS.BRAVE_API_KEY) return json({}, 401);
    queries.brave.push(url.searchParams.get('q'));
    const a = answer('brave', titleIn(url.searchParams.get('q')));
    if (a.status) return json({}, a.status);
    return json({results: a.items.map(i => ({title: i.title, url: i.page, properties: {url: i.img, width: i.w, height: i.h}, thumbnail: {width: 500, height: Math.round(500 * i.h / i.w)}}))});
  }
  if (url.hostname === 'archive.org') {
    const how = plan.archiveorg || 'junk';
    if (url.pathname === '/advancedsearch.php') {
      calls.push('archiveorg');
      if (typeof how === 'number') return json({}, how);
      const title = titleIn(url.searchParams.get('q'));
      return json({response: {docs: how === 'wrap' ? [{identifier: 'a-scanned-cover', title: `${title} DVD cover`}] : []}});
    }
    if (url.pathname.startsWith('/metadata/')) return json({result: [{name: 'full wrap.jpg', source: 'original', size: '300000'}, {name: '__ia_thumb.jpg', source: 'original', size: '30000'}, {name: 'full wrap_thumb.jpg', source: 'derivative', size: '9000'}]});
    if (url.pathname.startsWith('/download/')) { assert.equal(request.headers.get('Range'), 'bytes=0-65535'); return new Response(jpegHead(1500, 1000), {status: 206, headers: {'Content-Type': 'image/jpeg'}}); }
  }
  // Open Library, for /identify's books: an author whose name comes in Japanese script, with Latin-script names in
  // the search result, only in the author record, or nowhere
  if (url.hostname === 'openlibrary.org' && url.pathname === '/search.json') {
    const q = url.searchParams.get('q');
    assert.match(url.searchParams.get('fields'), /author_alternative_name/);
    const doc = {title: q, author_name: ['村上春樹'], author_key: ['OL1A'], first_publish_year: 1987, cover_i: 1, edition_count: 40, readinglog_count: 900};
    // as Open Library has them: the all-capitals one first
    if (q === 'norwegian wood') doc.author_alternative_name = ['MURAKAMI HARUKI', 'Murakami Haruki', 'ムラカミハルキ', '무라카미 하루키', 'Haruki MURAKAMI', 'Haruki Murakami', 'Murakami Haruki Kenkyūkai'];
    if (q === 'sputnik sweetheart') Object.assign(doc, {author_name: ['MURAKAMI HARUKI'], author_alternative_name: ['Murakami Haruki', 'MURAKAMI Haruki']});
    if (q === 'kafka on the shore') doc.author_key = ['OL2A'];
    if (q === 'the waves') Object.assign(doc, {author_name: ['Virginia Woolf'], author_key: ['OL3A']});
    return json({docs: [doc]});
  }
  if (url.hostname === 'openlibrary.org' && url.pathname.startsWith('/authors/')) {
    calls.push('author ' + url.pathname);
    return json(url.pathname === '/authors/OL2A.json' ? {name: '村上春樹', alternate_names: ['村上 春樹', 'Haruki Murakami']} : {name: '村上春樹', alternate_names: ['村上 春樹']});
  }
  if (url.hostname === 'www.wikidata.org') return json({search: []});
  calls.push('?? ' + url.href);
  return new Response('not a provider', {status: 404});
}

// (this Miniflare takes its options in a newer shape; convertV4MiniflareOptions turns these, the long-standing ones, into it)
const worker = (bindings = {}) => new Miniflare(convertV4MiniflareOptions({workers: [{
  name: 'spinestack', modules: [{type: 'ESModule', path: 'index.js', contents: script}], compatibilityDate: '2026-09-01',
  kvNamespaces: ['SPINE_CACHE'], r2Buckets: ['MEDIA'], durableObjects: {ARCHIVE: {className: 'Archive', useSQLite: true}},
  bindings: {...KEYS, ADMIN_TOKEN: ADMIN, SERPER_DAILY_CAP: '3', SERPER_TOTAL_CAP: '100', SERPAPI_DAILY_CAP: '2', BRAVE_DAILY_CAP: '2', ARCHIVE_ORG_DAILY_CAP: '5', ...bindings},
  outboundService: outbound,
}]}));
async function ask(mf, path, init) {
  const r = await mf.dispatchFetch('http://worker' + path, init), text = await r.text();
  said.push(text, JSON.stringify([...r.headers]));
  return {status: r.status, from: r.headers.get('X-Cache'), body: JSON.parse(text)};
}
const scans = (mf, title, round = 0) => { fresh(); return ask(mf, `/scans?kind=movie&title=${encodeURIComponent(title)}&year=1999&round=${round}`); };
const usage = async mf => Object.fromEntries((await ask(mf, '/admin/usage', {headers: {Authorization: 'Bearer ' + ADMIN}})).body.providers.map(p => [p.name, p]));
let n = 0; const ok = what => console.log(`  ok ${++n}  ${what}`);

/* ---------- the chain ---------- */
let mf = worker();
try {
  plan = {serper: 'wrap', serperCredits: 1};
  let r = await scans(mf, 'alpha one');
  assert.deepEqual([r.status, r.from, calls], [200, 'serper', ['serper']]);
  assert.equal(r.body.results.length, 1);
  assert.deepEqual(Object.keys(r.body.results[0]).sort(), ['en', 'height', 'img', 'source', 'title', 'vhs', 'width']);   // the result's shape is what it always was
  assert.deepEqual([r.body.round, r.body.more, 'capped' in r.body], [0, true, false]);
  assert.deepEqual([r.body.results[0].width, r.body.results[0].height, r.body.results[0].en], [1500, 1000, true]);
  ok('Serper is asked first, and a usable scan from it is the answer: nobody else is asked');

  r = await scans(mf, 'alpha one');
  assert.deepEqual([r.from, calls, r.body.results.length], ['raw', [], 1]);
  ok('the same title again comes from what was kept: no search');

  fresh();
  r = await ask(mf, `/scans?kind=movie&title=${encodeURIComponent('alpha one')}&year=1999&round=0&cacheonly=1`);
  assert.deepEqual([r.body.cached, r.body.results.length, calls], [true, 1, []]);
  r = await ask(mf, `/scans?kind=movie&title=${encodeURIComponent('alpha one')}&year=1999&round=1&cacheonly=1`);
  assert.deepEqual([r.body.cached, r.body.results.length, calls], [false, 0, []]);
  ok('cacheonly=1 never searches, and says whether that round was kept (cached: true or false)');

  plan = {serper: 'junk', serpapi: 'wrap'};
  r = await scans(mf, 'beta two');
  assert.deepEqual([r.from, calls, r.body.results.length], ['serpapi', ['serper', 'serpapi'], 1]);
  ok('nothing usable from Serper: SerpApi is asked next, and it stops there');

  plan = {serper: 429, serpapi: 'wrap'};
  r = await scans(mf, 'gamma three');
  assert.deepEqual([r.from, calls], ['serpapi', ['serper', 'serpapi']]);
  let u = await usage(mf);
  assert.deepEqual([u.serper.today, u.serper.out, u.serpapi.today, u.serpapi.cap], [3, true, 2, 2]);
  ok('Serper answers 429: it is out for the day, and SerpApi answers instead');

  plan = {serper: 'wrap', serpapi: 'wrap', brave: 'wrap'};
  r = await scans(mf, 'delta four');
  assert.deepEqual([r.from, calls], ['brave', ['brave']]);
  ok('Serper is left alone for the rest of the day and SerpApi is at its cap of 2: Brave is asked');

  plan = {brave: 'junk', archiveorg: 'wrap'};
  r = await scans(mf, 'epsilon five');
  assert.deepEqual([r.from, calls, r.body.results.length], ['archiveorg', ['brave', 'archiveorg'], 1]);
  assert.deepEqual([r.body.results[0].img, r.body.results[0].width, r.body.results[0].height], ['https://archive.org/download/a-scanned-cover/full%20wrap.jpg', 1500, 1000]);
  assert.equal(r.body.capped, undefined);
  ok('nothing usable from Brave: archive.org is the last one asked, and its picture\'s size is read from the file');

  plan = {archiveorg: 'junk'};
  r = await scans(mf, 'zeta six');
  assert.deepEqual([r.from, calls, r.body.results, r.body.capped], ['capped', ['archiveorg'], [], true]);
  ok('every keyed provider at its cap or out, nothing on archive.org: capped, so the page makes a spine from the cover');

  r = await scans(mf, 'eta seven', 1);
  assert.deepEqual([r.from, calls, r.body.capped], ['capped', [], true]);
  ok('a later round has no archive.org search: with the rest at their caps, nothing is asked');

  u = await usage(mf);
  assert.deepEqual(Object.keys(u), ['serper', 'serpapi', 'brave', 'archiveorg']);
  assert.deepEqual([u.serper.today, u.serpapi.today, u.brave.today, u.archiveorg.today], [3, 2, 2, 2]);
  assert.deepEqual([u.serper.key, u.serpapi.key, u.brave.key, u.archiveorg.key], [true, true, true, 'not needed']);
  assert.deepEqual([u.serper.credits, u.serper.creditCap], [5, 100]);   // three searches at 2 credits, less the one Serper said cost 1
  assert.equal((await ask(mf, '/admin/usage')).status, 401);
  assert.equal((await ask(mf, '/admin/usage', {headers: {Authorization: 'Bearer wrong'}})).status, 401);
  ok('/admin/usage: today\'s count for each provider, with the admin token only');

  plan = {archiveorg: 'wrap'};
  r = await ask(mf, '/admin/raw?provider=archiveorg&q=' + encodeURIComponent('theta eight'), {headers: {Authorization: 'Bearer ' + ADMIN}});
  assert.deepEqual([r.status, r.body.provider, r.body.results.length, r.body.results[0].w], [200, 'archiveorg', 1, 1500]);
  r = await ask(mf, '/admin/raw?provider=serper&q=x', {headers: {Authorization: 'Bearer ' + ADMIN}});
  assert.equal(r.status, 429);   // out for the day
  assert.equal((await ask(mf, '/admin/raw?provider=archiveorg&q=x')).status, 401);
  ok('/admin/raw: one provider\'s answer before the filters, counted like any search');

  r = await ask(mf, '/health');
  assert.deepEqual(r.body.scans, {serper: true, serpapi: true, brave: true, archiveorg: true});
  ok('/health says which providers are set up');
} finally { await mf.dispose(); }

/* ---------- no key, and no credits ---------- */
mf = worker({SERPER_KEY: '', SERPAPI_DAILY_CAP: '5'});
try {
  plan = {serper: 'wrap', serpapi: 'wrap'};
  const r = await scans(mf, 'iota nine');
  assert.deepEqual([r.from, calls], ['serpapi', ['serpapi']]);
  assert.equal((await usage(mf)).serper.key, false);
  ok('a provider with no key is passed over');
} finally { await mf.dispose(); }

mf = worker({SERPER_TOTAL_CAP: '3', SERPAPI_DAILY_CAP: '5'});
try {
  plan = {serper: 'wrap', serpapi: 'wrap'};
  let r = await scans(mf, 'kappa ten');
  assert.deepEqual([r.from, calls], ['serper', ['serper']]);
  r = await scans(mf, 'lambda eleven');
  assert.deepEqual([r.from, calls], ['serpapi', ['serpapi']]);   // 2 credits used of 3: the next search's 2 aren't there
  const u = await usage(mf);
  assert.deepEqual([u.serper.today, u.serper.credits, u.serper.creditCap], [1, 2, 3]);
  ok('Serper stops when its credits in all are used up');
} finally { await mf.dispose(); }

/* ---------- a bad key, and a provider that's down ---------- */
mf = worker({SERPER_KEY: 'a-wrong-key', SERPAPI_DAILY_CAP: '5'});
try {
  plan = {serpapi: 500, brave: 'wrap'};
  let r = await scans(mf, 'mu twelve');
  assert.deepEqual([r.from, calls], ['brave', ['serper', 'serpapi', 'brave']]);
  plan = {serpapi: 'wrap'};
  r = await scans(mf, 'nu thirteen');
  assert.deepEqual([r.from, calls], ['serpapi', ['serpapi']]);   // Serper (401) is out for the day; SerpApi (500 last time) is asked again
  const u = await usage(mf);
  assert.deepEqual([u.serper.out, u.serpapi.out], [true, false]);
  ok('a 401 puts a provider out for the day; a 500 only passes this search on to the next');
} finally { await mf.dispose(); }

/* ---------- Serper and double quotes ---------- */
mf = worker({SERPER_DAILY_CAP: '20', SERPAPI_DAILY_CAP: '20'});
try {
  const admin = {headers: {Authorization: 'Bearer ' + ADMIN}};
  plan = {serper: 'wrap', serpapi: 'wrap'};
  let r = await scans(mf, 'xi fourteen');
  assert.deepEqual([r.from, calls, queries.serper, r.body.results.length], ['serper', ['serper'], ['xi fourteen 1999 dvd cover'], 1]);
  ok('Serper is asked without the double quotes (it answers 400 to a search that has them)');

  plan = {serper: 'junk', serpapi: 'junk', brave: 'wrap'};
  r = await scans(mf, 'omicron fifteen');
  assert.deepEqual([r.from, queries.serper, queries.serpapi, queries.brave], ['brave', ['omicron fifteen 1999 dvd cover'], ['"omicron fifteen" 1999 dvd cover'], ['"omicron fifteen" 1999 dvd cover']]);
  ok('SerpApi and Brave are still asked for the title in quotes');

  plan = {serper: 'wrap', serpapi: 'wrap', serperRefuses: /english/};
  r = await scans(mf, 'pi sixteen', 1);
  assert.deepEqual([r.from, calls, queries.serper, r.body.results.length], ['serper', ['serper', 'serper'], ['pi sixteen 1999 dvd cover english', 'pi sixteen 1999 dvd cover'], 1]);
  let u = await usage(mf);
  assert.deepEqual([u.serper.today, u.serper.credits, u.serper.out], [3, 6, false]);
  ok('Serper still answers 400: it is asked once more with the title, the year and "dvd cover", all counted as one search');

  plan = {serper: 'wrap', serperRefuses: /spine/};
  fresh();
  r = await ask(mf, '/scans?kind=book&title=rho%20seventeen&creator=Some%20Writer&year=1950');
  assert.deepEqual([r.from, queries.serper, r.body.results.length], ['serper', ['rho seventeen Some Writer book cover spine', 'rho seventeen book cover'], 1]);
  ok('a book is asked for again as its title and "book cover"');

  plan = {serper: 'wrap', serpapi: 'wrap', serperRefuses: /./};
  r = await scans(mf, 'sigma eighteen', 2);
  assert.deepEqual([r.from, calls, queries.serper], ['serpapi', ['serper', 'serper', 'serpapi'], ['sigma eighteen dvd cover scan', 'sigma eighteen 1999 dvd cover']]);
  r = await scans(mf, 'tau nineteen');
  assert.deepEqual([r.from, calls], ['serpapi', ['serper', 'serpapi']]);   // a film's first round already is the plain search: it isn't sent twice
  u = await usage(mf);
  assert.deepEqual([u.serper.today, u.serper.out], [6, false]);
  plan = {serper: 'wrap', serpapi: 'wrap'};
  r = await scans(mf, 'upsilon twenty');
  assert.deepEqual([r.from, calls], ['serper', ['serper']]);
  ok('400 both times: that search goes to SerpApi, and Serper is not out for the day (the next title asks it again)');

  fresh();
  r = await ask(mf, '/admin/raw?provider=serper&q=' + encodeURIComponent('"phi twenty-one" 1999 dvd cover'), admin);
  assert.deepEqual([r.status, queries.serper, r.body.results.length], [200, ['phi twenty-one 1999 dvd cover'], 1]);
  plan = {serper: 'wrap', serperRefuses: /./};
  fresh();
  r = await ask(mf, '/admin/raw?provider=serper&q=' + encodeURIComponent('chi twenty-two'), admin);
  assert.deepEqual([r.status, r.body.error, calls], [502, 'Serper answered 400', ['serper']]);
  assert.equal((await usage(mf)).serper.out, false);
  ok('/admin/raw: the quotes come out there too, and a 400 is shown as it is, asked once');
} finally { await mf.dispose(); }

/* ---------- a book's rounds: the spine, then the dust jacket, and no fourth ---------- */
mf = worker({SERPER_DAILY_CAP: '20'});
try {
  plan = {serper: 'wrap'};
  const book = async round => { fresh(); return ask(mf, `/scans?kind=book&title=psi%20twenty-three&creator=Some%20Writer&year=1950&round=${round}`); };
  let r = await book(1);
  assert.deepEqual([queries.serper, r.body.more], [['psi twenty-three Some Writer book spine'], true]);
  r = await book(2);
  assert.deepEqual([queries.serper, r.body.round, r.body.more], [['psi twenty-three Some Writer dust jacket full wrap'], 2, false]);
  r = await book(3);
  assert.deepEqual([queries.serper, r.body.round, r.from], [[], 2, 'raw']);   // there is no round 3 for a book: it's round 2, kept
  fresh();
  r = await ask(mf, '/scans?kind=movie&title=psi%20twenty-three&year=1950&round=3');
  assert.deepEqual([r.body.round, r.body.more], [3, false]);
  ok('a book: round 1 searches "<title>" <author> book spine, round 2 "<title>" <author> dust jacket full wrap, and that is the last');
} finally { await mf.dispose(); }

/* ---------- /identify: a book's author in Latin letters ---------- */
mf = worker();
try {
  const book = async q => { fresh(); return (await ask(mf, `/identify?want=book&q=${encodeURIComponent(q)}`)).body.results[0]; };
  let b = await book('norwegian wood');
  assert.deepEqual([b.title, b.creator, calls.filter(c => c.startsWith('author'))], ['norwegian wood', 'Haruki Murakami', []]);
  ok('an author given as 村上春樹: Haruki Murakami from author_alternative_name, not its first Latin name, MURAKAMI HARUKI (no author record asked for)');
  b = await book('sputnik sweetheart');
  assert.equal(b.creator, 'Haruki Murakami');
  ok('an author given as MURAKAMI HARUKI: in ordinary case, the family name (the one in capitals in "MURAKAMI Haruki") last');
  b = await book('kafka on the shore');
  assert.deepEqual([b.creator, calls.filter(c => c.startsWith('author'))], ['Haruki Murakami', ['author /authors/OL2A.json']]);
  ok('none in the search result: the first Latin-script name in the author record\'s alternate_names');
  b = await book('after dark');
  assert.equal(b.creator, '村上春樹');
  ok('no Latin-script name anywhere: the name stays as it came');
  b = await book('the waves');
  assert.deepEqual([b.creator, calls.filter(c => c.startsWith('author'))], ['Virginia Woolf', []]);
  ok('a name already in Latin letters is used as it is, with nothing more asked');
} finally { await mf.dispose(); }

/* ---------- no key ever comes back ---------- */
const everything = said.join('\n');
for (const key of [...Object.values(KEYS), 'a-wrong-key', ADMIN]) assert.equal(everything.includes(key), false, 'a key came back in an answer');
ok('no key or token is in anything the Worker answered');
console.log(`\n${n} checks passed`);
