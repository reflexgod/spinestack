/* Spinestack Worker: film/book lookup, DVD/book scan search, a CORS image proxy, and a small
   moderated archive of spines people cut from their own scans. Keys live in Worker secrets
   (TMDB_TOKEN, SERPER_KEY, SERPAPI_KEY, BRAVE_API_KEY, ADMIN_TOKEN), never in the page, and are never logged or sent back.

   GET  /identify?q=&want=all|movie|book[&suggest=1]  -> {results:[{kind,title,year,creator,cover}], partial?}
        suggest=1 is a half-typed title (the page suggests as you type). Answered within BUDGET: when TMDB or Open
        Library is slower, what has come is the answer (partial: true) and the whole one is kept at the edge for the next ask.
   GET  /scans?title=&year=&kind=movie|book&creator=&round=0-3 (a book 0-2)[&id=][&cacheonly=1]
        -> {results:[{img,source,title,width,height, archive?,id?}], round, more, found?, capped?, pending?, cached? (with cacheonly)}
        One query per round, so the page asks for the next round only when it still needs spines.
        Round 0 starts with approved spines from the archive, and found: the scans someone's page cut a clean spine
        from before (POST /found), best first, so a popular title loads one or two scans instead of a search's worth.
        What isn't already kept is looked for with Serper, then SerpApi, then Brave, then archive.org, stopping at the
        first that gives a usable scan. Each has a cap on searches a day, across everyone (wrangler.toml). capped: true
        means nothing usable was found and at least one of them was at its cap or out for the day (when all are, that's
        said at once, with nothing asked). pending: true means the search is still going (someone else's, or this one
        past BUDGET): it's kept when it's done, and the page asks again with cacheonly=1.
   POST /found  (body, as text: {kind, id, title, year, creator, cuts:[{img, round, score}]})  -> {ok, kept}
        the scans this page cut clean spines from. Only scans /scans gave for that title and round are kept.
   GET  /img?url=  -> the image, with CORS
   POST /archive?kind=&title=&year=&author=  (body: PNG of one spine) -> {ok, id, status:'pending'}
   GET  /archive/img?id=  -> an approved spine (pending ones only with the admin token)
        Limits: 10 uploads a day per visitor and 50 a day in all; see the Archive class below.
   POST /report?id=  -> three reports send an approved spine back to pending
   GET  /admin/list?status=pending|approved, POST /admin/approve?id=, POST /admin/delete?id=
   GET  /admin/usage  -> {day, providers:[{name, key, today, cap, out, credits?, creditCap?}]}: today's searches by each provider
   GET  /admin/raw?provider=serper|serpapi|brave|archiveorg&q=  -> what that provider says before any filtering (costs one search)
        (Authorization: Bearer ADMIN_TOKEN)

   Accounts (Supabase sign-in; the page sends the user's access token as Authorization: Bearer ...):
   POST /u/blob  (body: a PNG, WebP or JPEG, 200 KB max) -> {key: '<user id>/<sha-256>'}
        a spine or cover image a saved shelf needs that isn't in the archive or on TMDB / Open Library.
        Stored once per user and content: the same image again costs nothing.
   GET  /u/blob?k=<user id>/<sha-256>  -> the image (anyone with the key; it never changes)
   POST /u/preview?shelf=<id>  (body: a small WebP or JPEG, 120 KB max) -> {key}   the shelf's picture for lists
   GET  /u/preview?k=<user id>/p/<shelf id>&v=<updated>  -> the picture
   POST /u/forget?shelf=<id>  -> removes that shelf's picture (the shelf itself is deleted in Supabase)
        Limits: 150 images a day per account and 600 a day in all (KV's free plan allows 1,000 writes a day).
   POST /m/upload?kind=avatar|wall|png  (body: a PNG, WebP or JPEG, 2 MB max) -> {key: '<user id>/<kind>/<32 hex>'}
        a profile photo, a wall or a PNG for the wall, kept in R2 (MEDIA). Walls and PNGs need Pro.
        Limits: 20 a minute and 200 a day per account, 20,000 a day in all.
   GET  /m/img?k=<key>  -> the picture (anyone with the key)
   GET  /s/u/<username>[/<shelf id>], /s/t/film/<id>, /s/t/book/<id>  -> a share link: a link preview's fetcher gets a
        page of og: tags (the person's, the shelf's or the title's, with its picture); anyone else a 302 to the page
   POST /m/delete?k=<key>  -> deletes one of your own pictures once no shelf of yours and not your profile uses it
   Every day at 03:00 UTC (cron) the Worker makes one tiny read from Supabase, so the free project isn't
   paused for being inactive.
*/
import UPNG from 'upng-js';
import {DurableObject} from 'cloudflare:workers';

const ORIGINS = ['https://reflexgod.github.io', 'https://shelfstackd.com', 'https://www.shelfstackd.com', 'http://localhost:8080'];
const DAY = 86400, MONTH = 30 * DAY;
const MAX_IMG = 8 * 1024 * 1024, MAX_UPLOAD = 300 * 1024, UPLOADS_PER_DAY = 10, REPORTS_TO_HIDE = 3;
const UA = 'Spinestack/1.0 (+https://reflexgod.github.io/spinestack/)';

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const cors = ORIGINS.includes(origin) ? {'Access-Control-Allow-Origin': origin, 'Vary': 'Origin'} : {'Vary': 'Origin'};
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400'}});
    if (req.method !== 'GET' && req.method !== 'POST') return json({error: 'Only GET and POST are allowed.'}, 405, cors);

    const url = new URL(req.url), p = url.searchParams, path = url.pathname, ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const post = req.method === 'POST';
    try {
      if (!post && path === '/img') {
        if (!(await allowed(env.IMG_LIMITER, ip))) return json({error: 'Too many images at once. Wait a minute and try again.'}, 429, cors);
        return await image(p.get('url') || '', cors, ctx);
      }
      if (!post && path === '/archive/img') return await archiveImage(p.get('id'), req, env, cors);
      if (!post && (path === '/u/blob' || path === '/u/preview')) return await userImage(path, p, env, cors, ctx);
      if (post && path.startsWith('/u/')) {
        const user = await userOf(req, env);
        if (!user) return json({error: 'Sign in again to save shelves.'}, 401, cors);
        if (path === '/u/blob') return await putUserImage(req, env, cors, user, 'blob');
        if (path === '/u/preview') return await putUserImage(req, env, cors, user, 'preview', p.get('shelf'));
        if (path === '/u/forget') return await forgetPreview(env, cors, user, p.get('shelf'));
        return json({error: 'Not found.'}, 404, cors);
      }
      if (!post && path === '/m/img') return await mediaImage(p, env, cors, ctx);
      if (!post && path.startsWith('/s/')) return await sharePage(path, req, env, ctx);   // a share link (a preview, or straight on)
      if (post && path.startsWith('/m/')) {
        const user = await userOf(req, env);
        if (!user) return json({error: 'Sign in again to save pictures.'}, 401, cors);
        if (path === '/m/upload') return await putMedia(req, p, env, cors, user);
        if (path === '/m/delete') return await deleteMedia(req, p, env, cors, user);
        return json({error: 'Not found.'}, 404, cors);
      }
      if (path.startsWith('/admin/')) {
        if (!(await isAdmin(req, env))) return json({error: 'Wrong or missing admin token.'}, 401, cors);
        if (!post && path === '/admin/list') return json({items: await listMeta(env, p.get('status') === 'approved' ? 'approved' : 'pending')}, 200, cors, {'Cache-Control': 'no-store'});
        if (post && path === '/admin/approve') return await approve(p.get('id'), env, cors);
        if (post && path === '/admin/delete') return await remove(p.get('id'), env, cors);
        if (!post && path === '/admin/usage') return json(await usage(env), 200, cors, {'Cache-Control': 'no-store'});
        // what one provider returns before any filtering, to tune the filters or check a key (costs one search)
        if (!post && (path === '/admin/raw' || path === '/admin/brave')) return await rawFrom(path === '/admin/brave' ? 'brave' : p.get('provider'), clean(p.get('q'), 200), env, cors);
        return json({error: 'Not found.'}, 404, cors);
      }
      if (!(await allowed(env.LIMITER, ip))) return json({error: 'Too many requests. Wait a minute and try again.'}, 429, cors);
      if (!post && path === '/identify') return await identify(p, env, cors, ctx);
      if (!post && path === '/title') return await titleInfo(p, env, cors, ctx);
      if (!post && path === '/scans') return await scans(p, env, cors, ctx);
      if (post && path === '/found') return await foundPost(req, env, cors);
      if (post && path === '/archive') return await upload(req, p, ip, env, cors);
      if (post && path === '/report') return await report(p.get('id'), ip, env, cors);
      if (!post && (path === '/' || path === '/health')) return json({ok: true, tmdb: !!env.TMDB_TOKEN, brave: !!env.BRAVE_API_KEY, braveDailyCap: braveCap(env), scans: Object.fromEntries(PROVIDERS.map(pv => [pv.name, !!pv.key(env)])), archive: !!(env.ADMIN_TOKEN && env.ARCHIVE), accounts: !!(env.SUPABASE_URL && env.SUPABASE_KEY), userStore: env.USER_R2 ? 'r2' : 'kv'}, 200, cors);
      return json({error: 'Not found.'}, 404, cors);
    } catch (e) {
      return json({error: 'Something went wrong. Try again in a moment.', detail: String(e && e.message || e).slice(0, 200)}, 502, cors);
    }
  },
  // keeps the free Supabase project from pausing: one tiny read a day (with the public key; RLS returns no rows)
  async scheduled(event, env, ctx) {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return;
    ctx.waitUntil(fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {headers: {apikey: env.SUPABASE_KEY}}));
  },
};

const json = (body, status, cors, extra = {}) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra}});
/* No answer the page waits on (/identify, /scans) takes longer than this. What's still coming after it goes on in the
   background (ctx.waitUntil) and is kept, so the next ask has it. */
const BUDGET = 1800;
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* What this copy of the Worker has learned lately. A copy serves many requests in a row, so a busy minute asks TMDB,
   Open Library and Wikidata once for what many searches share: a film's director, an author's name, a book's year.
   Only finished answers are kept (never a promise: a request mustn't wait on another request's fetch), never a key,
   nothing about a person. */
const MEMO = new Map();
async function memo(key, ms, make) {
  const hit = MEMO.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await make();
  if (MEMO.size > 3000) MEMO.clear();
  MEMO.set(key, {value, until: Date.now() + ms});
  return value;
}
const edgeKeep = (key, body, ttl) => caches.default.put(key, new Response(JSON.stringify(body), {headers: {'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}`}}));
async function allowed(limiter, ip) {
  if (!limiter) return true;   // binding not configured: no limit
  try { return (await limiter.limit({key: ip})).success; } catch { return true; }
}
const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
const words = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
const decode = u => { try { return decodeURIComponent(u.replace(/\+/g, ' ')); } catch { return u; } };

/* ---------- /identify ---------- */
// one GET to TMDB, Open Library or Wikidata, given up on after `wait` ms (a hung host never holds a request open)
async function getJSON(url, init, wait = 6000) {
  const r = await fetch(url, {...init, signal: AbortSignal.timeout(wait)});
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return r.json();
}
/* How close a title is to what was typed: 0 the same, 1 starting with it, 2 having it, 3 neither. A leading "the",
   "a" or "an" doesn't count, nor does a year typed after the title, and a year in figures is also its words (1984 is
   Nineteen Eighty-Four, just after a title that is 1984). The page's rank() in add.js does the same: keep them in step. */
const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = 'x x twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const under100 = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
const yearWords = y => y >= 2000 && y < 2010 ? 'two thousand' + (y % 10 ? ' ' + ONES[y % 10] : '') : under100(Math.floor(y / 100)) + ' ' + (y % 100 === 0 ? 'hundred' : y % 100 < 10 ? 'oh ' + ONES[y % 100] : under100(y % 100));
const spelled = s => s.replace(/\b(1[0-9]|20)\d\d\b/g, y => yearWords(+y));
const bare = s => words(s).join(' ').replace(/^(the|a|an) /, '');
function closeness(title, q) {
  const t = bare(title), typed = bare(String(q).replace(/[\s,(]+(?:19|20)\d\d\)?$/, ''));
  if (!typed) return 3;
  const how = w => t === w ? 0 : t.startsWith(w) ? 1 : (' ' + t + ' ').includes(' ' + w + ' ') || t.includes(w) ? 2 : 3;
  const say = spelled(typed);   // written out, it comes just after the same in figures
  return say === typed ? how(typed) : Math.min(how(typed), how(say) + .5);
}
async function tmdbFilms(q, token) {
  if (!token) return [];
  const bearer = token.length > 40, init = {headers: bearer ? {Authorization: 'Bearer ' + token, 'User-Agent': UA} : {'User-Agent': UA}};
  const key = bearer ? '' : '&api_key=' + encodeURIComponent(token);
  const find = (s, y) => getJSON('https://api.themoviedb.org/3/search/movie?include_adult=false&query=' + encodeURIComponent(s) + (y ? '&year=' + y : '') + key, init);
  const yq = q.match(/^(.+?)[\s,(]+((?:19|20)\d\d)\)?$/);   // "kids 1995": TMDB finds nothing when the year is in the query
  let r = yq ? await find(yq[1], yq[2]) : await find(q);
  if (yq && !(r.results || []).length) r = await find(yq[1]);
  // the whole page TMDB gives (20), closest title first, then most voted for, before five are kept: "gumm" had Gummo
  // seventh, so it was never shown
  const films = (r.results || []).map((m, i) => ({m, i, c: closeness(m.title || '', q)})).sort((a, b) => a.c - b.c || (b.m.vote_count || 0) - (a.m.vote_count || 0) || a.i - b.i).map(x => x.m);
  return Promise.all(films.slice(0, 5).map(async (m, i) => {
    let creator = '';
    if (i < 3) try { creator = await memo('dir:' + m.id, DAY * 1000, async () => (((await getJSON(`https://api.themoviedb.org/3/movie/${m.id}/credits?` + key.slice(1), init)).crew || []).find(p => p.job === 'Director') || {}).name || ''); } catch {}
    return {kind: 'movie', tmdb: String(m.id), title: m.title || '', year: (m.release_date || '').slice(0, 4), creator, cover: m.poster_path ? 'https://image.tmdb.org/t/p/w500' + m.poster_path : ''};
  }));
}
/* Open Library also files government reports and the like as books ("John W. Gummo", 1888, by "United States.
   Congress. House..."). A record with no cover is dropped when its author reads like an organisation, or when it has
   one edition and is on nobody's reading list. Open Library also searches everything it knows about a book, so
   "gummo" finds books on the Marx Brothers: what was typed has to be in the title or an author's name (a year after
   a title isn't part of it). The rest go most-read first, then by how many editions there are, and a title that
   comes more than once by the same author (other printings, other languages) is kept once. */
const ORG_AUTHOR = /\b(congress|committee|department|office|list|directory)\b/i;
const notABook = d => !d.cover_i && (ORG_AUTHOR.test((d.author_name || []).join(' ')) || ((d.edition_count || 0) <= 1 && !d.readinglog_count));
/* An author's name in Latin letters. Open Library sometimes gives the name as written in its own script (村上春樹 for
   Norwegian Wood): then the first Latin-script name in author_alternative_name is used, or, when there's none there,
   the first in the author record's alternate_names. With neither, the name stays as it came. The name is then put the
   way the person writes it (personName). */
const LATIN = /^[\p{Script=Latin}\p{M}\p{N}\s.,'’()&-]+$/u, latin = n => !!n && LATIN.test(n) && /\p{Script=Latin}/u.test(n);
/* A person's name as they'd write it, from the Latin-script names Open Library has for them: "MURAKAMI HARUKI",
   "Murakami Haruki" and "Haruki MURAKAMI" are Haruki Murakami. A word in capitals (three letters or more, not an
   initial) is put in ordinary case. The family name is the word a library writes in capitals beside a given name in
   ordinary case ("Haruki MURAKAMI"); it goes last. A name already in ordinary case is kept as it is. */
const CAPS = w => (w.match(/\p{L}/gu) || []).length >= 3 && !w.includes('.') && w === w.toUpperCase();
const cased = w => CAPS(w) ? w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : w;
function personName(names){
  const list = names.filter(Boolean).map(n => String(n).trim().replace(/\s+/g, ' ')).filter(n => n && n.split(' ').length <= 4);
  if (!list.length) return '';
  let family = '', marked = '';
  for (const n of list){ const ws = n.split(' '), caps = ws.filter(CAPS); if (ws.length >= 2 && caps.length === 1){ family = caps[0].toLowerCase(); marked = n; break; } }
  const ordinary = n => !n.split(' ').some(CAPS);
  const best = list.find(n => ordinary(n) && (!family || n.split(' ').slice(-1)[0].toLowerCase() === family)) || marked || list.find(ordinary) || list[0];
  let ws = best.split(' ').map(cased);
  if (family && ws.length === 2 && ws[0].toLowerCase() === family) ws = [ws[1], ws[0]];
  return ws.join(' ');
}
async function authorName(d) {
  const name = (d.author_name || [''])[0];
  if (!name || latin(name) && !name.split(/\s+/).some(CAPS)) return name;
  const alts = [...(latin(name) ? [name] : []), ...(d.author_alternative_name || []).filter(latin)];
  if (alts.length) return personName(alts) || name;
  const key = (d.author_key || [])[0];
  if (!key) return name;
  try { return await memo('au:' + key, DAY * 1000, async () => personName(((await getJSON(`https://openlibrary.org/authors/${encodeURIComponent(key)}.json`, {headers: {'User-Agent': UA}})).alternate_names || []).filter(latin))) || name; }
  catch { return name; }
}
async function olBooks(q) {
  const r = await getJSON('https://openlibrary.org/search.json?limit=50&fields=key,title,author_name,author_alternative_name,author_key,first_publish_year,publish_year,cover_i,edition_count,readinglog_count&q=' + encodeURIComponent(q), {headers: {'User-Agent': UA}});
  const typed = q.replace(/[\s,(]+(?:19|20)\d\d\)?$/, ''), wants = [words(typed), words(spelled(words(typed).join(' ')))];   // 1984 is also nineteen eighty four
  const says = d => { const hay = words([d.title, ...(d.author_name || [])].join(' ')).join(' '); return wants.some(want => want.length > 0 && want.every(w => hay.includes(w))); };
  const seen = new Set(), once = d => { const k = words(d.title).join(' ').replace(/^(the|a|an) /, '') + '|' + words((d.author_name || [''])[0]).join(' '); return !seen.has(k) && !!seen.add(k); };
  const docs = (r.docs || []).filter(d => !notABook(d) && says(d))
    .sort((a, b) => closeness(a.title || '', q) - closeness(b.title || '', q) || (b.readinglog_count || 0) - (a.readinglog_count || 0) || (b.edition_count || 0) - (a.edition_count || 0)).filter(once).slice(0, 5);
  // Open Library's first year is sometimes a stray record (It Ends With Us: 2012, The Bell Jar: 1948).
  // Wikidata's publication date is right for known books; without it, a lone early year with a gap after it is dropped.
  const [years, authors] = await Promise.all([Promise.all(docs.map(d => wikidataYear(d.title, (d.author_name || [''])[0]).then(y => y ? String(y) : olYear(d)))), Promise.all(docs.map(authorName))]);
  return docs.map((d, i) => ({kind: 'book', ol: workId(d.key), title: d.title || '', year: years[i], creator: authors[i], cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : ''}));
}
function olYear(d) {
  const ys = (d.publish_year || []).filter(y => y > 1000).sort((a, b) => a - b), first = d.first_publish_year || ys[0];
  if (!first) return '';
  const next = ys.find(y => y > first);
  return next && next - first > 2 && ys.length > 3 ? '' : String(first);   // unsure: show no year
}
async function wikidataYear(title, author) {
  const want = words(title).join(' '), last = words(author).slice(-1)[0] || '', init = {headers: {'User-Agent': UA}};
  if (!want || !last) return null;
  // kept a day by this copy of the Worker (an error isn't kept: the next ask tries again)
  try {
    return await memo(`wd:${want}|${words(author).join(' ')}`, DAY * 1000, async () => {
      const s = await getJSON('https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=' + encodeURIComponent(title), init, 3000);
      // same title, and the author's surname in the description ("2016 novel by Colleen Hoover")
      const hit = (s.search || []).find(x => words(x.label).join(' ') === want && words(x.description).includes(last));
      if (!hit) return null;
      const e = (await getJSON(`https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`, init, 3000)).entities[hit.id];
      const ys = ((e.claims || {}).P577 || []).map(c => c.mainsnak.datavalue && parseInt(c.mainsnak.datavalue.value.time.slice(1, 5), 10)).filter(y => y > 1000);
      return ys.length ? Math.min(...ys) : null;
    });
  } catch { return null; }
}
async function identify(p, env, cors, ctx) {
  const q = clean(p.get('q'), 120), want = ['movie', 'book'].includes(p.get('want')) ? p.get('want') : 'all';
  if (!q) return json({error: 'Type a title to search.'}, 400, cors);
  // id8: each with its id (tmdb, or ol: Open Library's work), for the title page (/t/); id7: the closest titles first, ranked before five are kept, and 1984 finding Nineteen Eighty-Four;
  // id6: an author's name as they write it ("Haruki Murakami", not "MURAKAMI HARUKI"); id5: a book's author in Latin letters when Open Library has them (id4 answers could have 村上春樹); id4: books only
  // when the title or author has what was typed, each once (id3 answers had the rest; id2 the reports)
  // Kept at the edge for a day (an empty answer an hour), half-typed or not. Answers kept in KV before 6 October 2026
  // are still read; none is written there now: KV's free plan allows 1,000 writes a day, and saved shelves' pictures
  // and scan searches need them more (an answer costs nothing but a TMDB and an Open Library ask to make again).
  const key = `id8:${want}:${q.toLowerCase()}`, ekey = new Request('https://identify.cache/' + encodeURIComponent(key));
  const hold = body => edgeKeep(ekey, body, body.results.length ? DAY : 3600);
  const held = await caches.default.match(ekey);
  if (held) return json(await held.json(), 200, cors, {'X-Cache': 'EDGE'});
  const kept = env.SPINE_CACHE ? await env.SPINE_CACHE.get(key, 'json').catch(() => null) : null;
  if (kept) { ctx.waitUntil(hold(kept)); return json(kept, 200, cors, {'X-Cache': 'HIT'}); }
  // TMDB and Open Library side by side. Whatever has come by BUDGET is the answer (partial: true, so the page asks again
  // in a moment); the whole answer is kept at the edge when it comes.
  const sides = [want !== 'book' ? tmdbFilms(q, env.TMDB_TOKEN) : [], want !== 'movie' ? olBooks(q) : []].map(x => Promise.resolve(x));
  const got = sides.map(s => { const o = {done: false, value: []}; s.then(v => { o.done = true; o.value = v; }, () => { o.done = true; }); return o; });
  const all = Promise.allSettled(sides).then(([f, b]) => {
    if (f.status === 'rejected' && b.status === 'rejected') throw new Error('TMDB and Open Library did not answer');
    return {results: [...(f.value || []), ...(b.value || [])]};
  });
  const late = await Promise.race([all.then(() => false, () => false), sleep(BUDGET).then(() => true)]);
  if (!late) {
    const body = await all;
    ctx.waitUntil(hold(body));
    return json(body, 200, cors, {'X-Cache': 'MISS'});
  }
  ctx.waitUntil(all.then(hold, () => {}));
  return json({results: got.flatMap(o => o.done ? o.value : []), partial: true}, 200, cors, {'X-Cache': 'LATE', 'Cache-Control': 'no-store'});
}

/* ---------- /title: one film or book, for its page (/t/) ----------
   ?film=<TMDB id> or ?book=<Open Library work id, OL…W>; or ?kind=movie|book&title=&year= (a title as a log or a
   spine keeps it, with no id), answered with the closest match and its id, so the page can take that address. It gives
   what TMDB or Open Library says: the title, year, director or author, runtime or pages, up to four genres, a short
   overview, the cover; and the spine, when the archive has one approved. Kept at the edge for a week (no KV write). */
// a 404 from TMDB or Open Library: there's no such film or book (null); anything else is still an error
const orNone = p => p.catch(e => { if (/ answered 404$/.test(String(e && e.message))) return null; throw e; });
const workId = k => (/^\/works\/(OL\d{1,10}W)$/.exec(k || '') || [])[1] || '';
// an overview cut to its first sentences, 420 characters at most
function short(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim().replace(/\s*\(\[source\][^)]*\)\s*$/i, '').replace(/\s*-{3,}.*$/, '');
  if (t.length <= 420) return t;
  const cut = t.slice(0, 420), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 120 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
async function titleInfo(p, env, cors, ctx) {
  const film = /^\d{1,9}$/.test(p.get('film') || '') ? p.get('film') : '', book = /^OL\d{1,10}W$/.test(p.get('book') || '') ? p.get('book') : '';
  const kind = film ? 'movie' : book ? 'book' : ['movie', 'book'].includes(p.get('kind')) ? p.get('kind') : '';
  const title = clean(p.get('title'), 200), year = /^\d{4}$/.test(p.get('year') || '') ? p.get('year') : '';
  if (!kind || (!film && !book && !title)) return json({error: 'Which film or book?'}, 400, cors);
  const key = 'title1:' + (film ? 'film:' + film : book ? 'book:' + book : `${kind}:${title.toLowerCase()}:${year}`);
  const edge = caches.default, ekey = new Request('https://title.cache/' + encodeURIComponent(key));
  const held = await edge.match(ekey);
  if (held) return json(await held.json(), 200, cors, {'X-Cache': 'EDGE', 'Cache-Control': 'public, max-age=3600'});
  let body;
  try { body = kind === 'movie' ? await filmInfo(film, title, year, env.TMDB_TOKEN) : await bookInfo(book, title, year); }
  catch { return json({error: 'TMDB or Open Library didn’t answer. Try again in a moment.'}, 502, cors); }
  if (!body) return json({error: 'Not found.'}, 404, cors);
  const spine = (await archiveFor(env, body.kind, body.title, body.year, body.creator).catch(() => []))[0];
  body.spine = spine ? spine.img : '';
  ctx.waitUntil(edge.put(ekey, new Response(JSON.stringify(body), {headers: {'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${7 * DAY}`}})));
  return json(body, 200, cors, {'X-Cache': 'MISS', 'Cache-Control': 'public, max-age=3600'});
}
/* ---------- /s/...: share links that show a picture and a title in a link preview ----------
   GitHub Pages serves the site as plain files, and a link preview (WhatsApp, Instagram, iMessage, X, Discord, Slack...)
   reads only a page's own tags, before any script runs: /u/?viraaj would preview as "Profile". So the site's Share and
   Copy link give these addresses instead. A preview fetcher is answered with a small page whose og: tags are that
   person's, that shelf's or that title's (its title, a line, a picture); anyone else is sent straight on (302) to the
   page on shelfstackd.com, with nothing asked of anyone on the way.
     /s/u/<username>                  a profile (the picture: their main shelf's, otherwise their photo)
     /s/u/<username>/<shelf id>       a shelf (its picture)
     /s/t/film/<TMDB id>, /s/t/book/<Open Library work id>   a title (its cover)
   What a fetcher was told is kept at the edge for 10 minutes. Only what anyone may read is read (the public key, so
   Row Level Security leaves out private shelves and profiles: those preview as shelfstackd with the person's name). */
const SITE = 'https://shelfstackd.com';
const BOTS = /bot\b|bot\/|crawler|spider|facebookexternalhit|facebot|meta-externalagent|whatsapp|telegram|slack|discord|twitter|linkedin|pinterest|embedly|skype|vkshare|iframely|snapchat|viber|line\/|kakaotalk|mastodon|preview/i;
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
async function sbRead(env, path, body) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, body ? {method: 'POST', headers: {apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {headers: {apikey: env.SUPABASE_KEY}});
  return r.ok ? r.json() : null;
}
function shareTarget(parts) {
  const [kind, a, b] = parts;
  if (kind === 'u' && /^[a-z0-9_]{3,20}$/.test(a || '')) return SITE + '/u/?' + a + (b && /^[0-9a-f-]{36}$/.test(b) ? '&shelf=' + b : b === 'shelf' ? '&shelf' : '');
  if (kind === 't' && a === 'film' && /^\d{1,9}$/.test(b || '')) return SITE + '/t/?film=' + b;
  if (kind === 't' && a === 'book' && /^OL\d{1,10}W$/.test(b || '')) return SITE + '/t/?book=' + b;
  return '';
}
const shelfLabel = s => String(s.name || s.caption || '').trim() || 'untitled shelf';
async function shareTags(parts, origin, env) {
  const [kind, a, b0] = parts, plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const b = kind === 't' || b0 === 'shelf' || /^[0-9a-f-]{36}$/.test(b0 || '') ? b0 : '';   // a shelf: its id, or its owner's main one
  if (kind === 'u') {
    const p = ((await sbRead(env, `profiles?select=id,username,display_name,bio,avatar_key,pinned_shelf_id&username=eq.${a}`)) || [])[0];
    if (!p) {   // private, or no one: the card's name at most
      const c = ((await sbRead(env, 'rpc/profile_card', {p_username: a})) || [])[0];
      return c ? {title: `${(c.display_name || '').trim() || '@' + c.username} (@${c.username}) on shelfstackd`, about: 'A private profile on shelfstackd.', type: 'profile'} : null;
    }
    const who = (p.display_name || '').trim() ? `${p.display_name.trim()} (@${p.username})` : '@' + p.username;
    const shelves = (await sbRead(env, `shelves?select=id,name,caption,preview_key,updated_at,created_at,shelf_items(count)&owner=eq.${p.id}&is_public=is.true&hidden=is.false&order=created_at.asc&limit=200`)) || [];
    if (b) {
      const s = b === 'shelf' ? shelves.find(x => x.id === p.pinned_shelf_id) || shelves[0] : shelves.find(x => x.id === b);
      if (!s) return {title: `${who} on shelfstackd`, about: 'A shelf on shelfstackd.', type: 'website'};
      const titles = ((await sbRead(env, `shelf_items?select=title&shelf_id=eq.${s.id}&order=position&limit=6`)) || []).map(r => r.title).filter(Boolean);
      const n = ((s.shelf_items || [])[0] || {}).count || titles.length;
      return {title: `${shelfLabel(s)}: a shelf by @${p.username}`, about: `${plural(n, 'spine', 'spines')}${titles.length ? ': ' + titles.slice(0, 5).join(', ') : ''}. On shelfstackd.`,
        image: s.preview_key ? `${origin}/u/preview?k=${encodeURIComponent(s.preview_key)}&v=${encodeURIComponent(s.updated_at || '')}` : '', imageAlt: `${shelfLabel(s)}, a shelf of spines`, type: 'website', tall: true};
    }
    const main = shelves.find(x => x.id === p.pinned_shelf_id) || shelves[0];
    const image = main && main.preview_key ? `${origin}/u/preview?k=${encodeURIComponent(main.preview_key)}&v=${encodeURIComponent(main.updated_at || '')}` : p.avatar_key ? `${origin}/m/img?k=${encodeURIComponent(p.avatar_key)}` : '';
    const n = main ? ((main.shelf_items || [])[0] || {}).count || 0 : 0;
    return {title: `${who} on shelfstackd`, about: (p.bio || '').trim().slice(0, 160) || (main ? `${plural(n, 'spine', 'spines')} on their shelf, and the films and books they log.` : 'Their shelf, and the films and books they log.'),
      image, imageAlt: main ? `@${p.username}'s shelf` : `@${p.username}'s photo`, type: 'profile', tall: !!(main && main.preview_key)};
  }
  const t = a === 'film' ? await filmInfo(b, '', '', env.TMDB_TOKEN).catch(() => null) : await bookInfo(b, '', '').catch(() => null);
  if (!t) return null;
  const label = `${t.title}${t.year ? ` (${t.year})` : ''}`, by = t.creator ? (t.kind === 'movie' ? `dir. ${t.creator}` : `by ${t.creator}`) : '';
  return {title: `${label} on shelfstackd`, about: [by, t.overview ? t.overview.slice(0, 150) : ''].filter(Boolean).join(' · ') || 'On shelfstackd.', image: t.cover, imageAlt: `The cover of ${label}`,
    type: t.kind === 'movie' ? 'video.movie' : 'book', tall: true, to: `${SITE}/t/?${t.kind === 'movie' ? 'film' : 'book'}=${t.id}&title=${encodeURIComponent(t.title)}${t.year ? '&year=' + t.year : ''}`};
}
async function sharePage(path, req, env, ctx) {
  const parts = path.split('/').slice(2).map(decode), target = shareTarget(parts);
  if (!target) return Response.redirect(SITE + '/', 302);
  if (!BOTS.test(req.headers.get('User-Agent') || '')) return new Response(null, {status: 302, headers: {Location: target, 'Cache-Control': 'no-store'}});
  const edge = caches.default, ekey = new Request('https://share.cache' + path);
  const held = await edge.match(ekey);
  if (held) return new Response(held.body, {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600', 'X-Cache': 'EDGE'}});
  let tags = null;
  try { tags = await shareTags(parts, new URL(req.url).origin, env); } catch {}
  tags = tags || {title: 'shelfstackd', about: 'Shelve the films and books you love, with their real spines.', type: 'website'};
  const to = tags.to || target, image = tags.image || SITE + '/og.jpg', alt = tags.image ? tags.imageAlt : 'shelfstackd: a white hedgehog with four coloured quills, on dark grey.';
  const meta = (k, v, attr = 'property') => `<meta ${attr}="${k}" content="${escHtml(v)}">`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(tags.title)}</title>${meta('description', tags.about, 'name')}<link rel="canonical" href="${escHtml(to)}">
${meta('og:site_name', 'shelfstackd')}${meta('og:type', tags.type)}${meta('og:title', tags.title)}${meta('og:description', tags.about)}${meta('og:url', to)}
${meta('og:image', image)}${meta('og:image:alt', alt)}${tags.image ? '' : meta('og:image:width', '1200') + meta('og:image:height', '630')}
${meta('twitter:card', tags.image && tags.tall ? 'summary' : 'summary_large_image', 'name')}${meta('twitter:title', tags.title, 'name')}${meta('twitter:description', tags.about, 'name')}${meta('twitter:image', image, 'name')}
<meta http-equiv="refresh" content="0;url=${escHtml(to)}"></head><body><p><a href="${escHtml(to)}">${escHtml(tags.title)}</a></p></body></html>`;
  ctx.waitUntil(edge.put(ekey, new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600'}})));
  return new Response(html, {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600', 'X-Cache': 'MISS'}});
}
async function filmInfo(id, title, year, token) {
  if (!token) return null;
  const bearer = token.length > 40, init = {headers: bearer ? {Authorization: 'Bearer ' + token, 'User-Agent': UA} : {'User-Agent': UA}};
  const key = bearer ? '' : 'api_key=' + encodeURIComponent(token);
  if (!id) {   // by its title (and year): the closest TMDB has
    const r = await getJSON('https://api.themoviedb.org/3/search/movie?include_adult=false&query=' + encodeURIComponent(title) + (year ? '&year=' + year : '') + (key ? '&' + key : ''), init);
    const best = (r.results || []).map((m, i) => ({m, i, c: closeness(m.title || '', title)})).sort((a, b) => a.c - b.c || (b.m.vote_count || 0) - (a.m.vote_count || 0) || a.i - b.i)[0];
    if (!best) return null;
    id = String(best.m.id);
  }
  const m = await orNone(getJSON(`https://api.themoviedb.org/3/movie/${id}?append_to_response=credits` + (key ? '&' + key : ''), init));
  if (!m || !m.id) return null;
  return {kind: 'movie', id: String(m.id), title: m.title || '', year: (m.release_date || '').slice(0, 4),
    creator: (((m.credits || {}).crew || []).find(c => c.job === 'Director') || {}).name || '', runtime: m.runtime || null, pages: null,
    genres: (m.genres || []).map(g => g.name).filter(Boolean).slice(0, 4), overview: short(m.overview), cover: m.poster_path ? 'https://image.tmdb.org/t/p/w500' + m.poster_path : ''};
}
const olGet = u => getJSON(u, {headers: {'User-Agent': UA}});
const FIELDS = 'key,title,author_name,author_alternative_name,author_key,first_publish_year,publish_year,number_of_pages_median,cover_i,subject';
async function bookInfo(id, title, year) {
  let d = null;
  if (!id) {   // by its title (and year): the closest Open Library has, the one from that year first
    const r = await olGet('https://openlibrary.org/search.json?limit=10&fields=' + FIELDS + '&title=' + encodeURIComponent(title));
    const docs = (r.docs || []).filter(x => workId(x.key)).map((x, i) => ({x, i, c: closeness(x.title || '', title) + (year && String(x.first_publish_year) !== year ? 0.5 : 0)}));
    d = (docs.sort((a, b) => a.c - b.c || a.i - b.i)[0] || {}).x;
    if (!d) return null;
    id = workId(d.key);
  }
  const [w, s] = await Promise.all([orNone(olGet(`https://openlibrary.org/works/${id}.json`)),
    d ? Promise.resolve({docs: [d]}) : olGet('https://openlibrary.org/search.json?limit=1&fields=' + FIELDS + '&q=' + encodeURIComponent('key:/works/' + id))]);
  d = (s.docs || []).find(x => workId(x.key) === id) || {};   // the one with this work key
  if (!w || !w.title) return null;
  const about = typeof w.description === 'string' ? w.description : (w.description || {}).value || '';
  // genres: Open Library's subjects, the short plain ones (not "Fiction, general" or "nyt:..."), four at most
  const genres = (d.subject || w.subjects || []).filter(g => /^[A-Za-z][A-Za-z '&-]{2,24}$/.test(g)).map(g => g[0].toUpperCase() + g.slice(1).toLowerCase())
    .filter((g, i, all) => all.indexOf(g) === i).slice(0, 4);
  const cover = d.cover_i || (w.covers || []).find(c => c > 0);
  return {kind: 'book', id, title: w.title || d.title || '', year: d.first_publish_year ? String(d.first_publish_year) : '', creator: d.author_name ? await authorName(d) : '',
    runtime: null, pages: d.number_of_pages_median || null, genres, overview: short(about), cover: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : ''};
}

/* ---------- /scans: DVD / book wraps and single spines, from image searches ---------- */
const SCAN_SITES = /covercity|dvd-covers|dvdcover|cdcovers|covercentury|freecovers|coverlib|cover-?addict/i;
// Editions: most people want the English-language DVD or Blu-ray. These words, scripts and country domains
// point to another language or region; VHS is kept only as a last resort.
const FOREIGN_WORDS = new Set(('polish polska polski deutsch deutsche german germany espanol spanish espana coleccion edicion francais french france ' +
  'italiano italian italia russian russia japanese japan nihon dutch nederlands svensk swedish norsk norwegian dansk danish suomi finnish turk turkish ' +
  'korean chinese portugues portuguese brasil brazil czech cesky hungarian magyar greek pal ' +
  // short language and country codes that show up in scan file names (not 'de' or 'it': De Niro, It)
  'nl pl ger esp fra ita jpn rus').split(' '));
const FOREIGN_SCRIPT = /[Ѐ-ӿͰ-Ͽ぀-ヿ一-鿿가-힯؀-ۿ]/;
const FOREIGN_TLD = /\.(pl|de|es|fr|it|ru|jp|nl|se|no|dk|fi|tr|kr|cn|pt|br|cz|hu|gr|at|ch|be|mx|ar)$/i;
const ENGLISH_HINTS = [' english ', ' region 1 ', ' r1 ', ' criterion ', ' usa ', ' us '];
function edition(r, img, text) {
  // the page's country domain only: images often sit on CDNs such as preview.redd.it
  const hosts = [r.url].map(u => { try { return new URL(u).hostname; } catch { return ''; } });
  const foreign = text.split(' ').some(w => FOREIGN_WORDS.has(w)) || / region [2-6] /.test(text) || FOREIGN_SCRIPT.test(r.title || '') || hosts.some(h => FOREIGN_TLD.test(h));
  return {en: !foreign, vhs: / vhs | videocassette /.test(text), hint: ENGLISH_HINTS.some(x => text.includes(x))};
}
/* A film has four rounds. A book has three: when round 0 finds no clean spine, a search for the spine itself, then for
   the dust jacket laid flat (one paid search each, and the page asks for the next only while it still has nothing).
   Image search mostly finds photos of a book on a table, which have no spine to cut (docs/BOOK-SPINES.md). */
const roundsFor = kind => kind === 'book' ? 3 : 4;
function queryFor(kind, round, title, year, creator) {
  const q = kind === 'movie'
    ? [`"${title}" ${year} dvd cover`, `"${title}" ${year} dvd cover english`, `"${title}" dvd cover scan`, `"${title}" criterion dvd`]
    : [`"${title}" ${creator} book cover spine`, `"${title}" ${creator} book spine`, `"${title}" ${creator} dust jacket full wrap`];
  return q[round].replace(/\s+/g, ' ').trim();
}
// what a round is kept under: a book's round 2 asks something new (it was "<title>" spine), so it has a key of its own
const roundKey = (kind, round) => kind === 'book' && round === 2 ? '2j' : String(round);
/* Where a round's pictures are looked for, in this order, stopping at the first that gives a usable scan (one that
   passes the wrap and spine filters in pick() below):
     1. what's already kept in KV (and, on round 0, approved spines from the archive, which scans() adds)
     2. Serper (Google Images), while its one-time free credits last
     3. SerpApi (Google Images), a few a day, so a month stays inside its free 250
     4. Brave Image Search, which bills after about 1,000 a month
     5. archive.org's own search, which needs no key (round 0 only: there's one way to ask it)
   Each has a cap on searches a day, across everyone ([vars] in wrangler.toml), and Serper a cap on credits in all.
   A search is counted in the Archive Durable Object before it's made, in one step, so two requests can't both take
   the last one; if it can't be counted, it isn't made. A provider that answers 401, 402, 403 or 429 (a bad key, no
   credit left, too many) is left alone for the rest of the day; any other answer (a 400, a 500) only passes that one
   search on. One with no key is passed over.
   Every provider's answer is turned into the same list ({title, url, properties: {url, width, height}, thumbnail}),
   which is what the filters read and what's kept. */
const today = () => new Date().toISOString().slice(0, 10);
const capOf = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
const braveCap = env => capOf(env.BRAVE_DAILY_CAP, 30);
const PROVIDERS = [
  // a 100-result image search costs 2 Serper credits; its answer says what it really cost, and the count follows that
  {name: 'serper', key: env => env.SERPER_KEY, cap: env => capOf(env.SERPER_DAILY_CAP, 100), total: env => capOf(env.SERPER_TOTAL_CAP, 2400), cost: 2, search: serper},
  {name: 'serpapi', key: env => env.SERPAPI_KEY, cap: env => capOf(env.SERPAPI_DAILY_CAP, 8), search: serpapi},
  {name: 'brave', key: env => env.BRAVE_API_KEY, cap: braveCap, search: brave},
  {name: 'archiveorg', key: () => 'none needed', cap: env => capOf(env.ARCHIVE_ORG_DAILY_CAP, 100), search: archiveOrg, firstRoundOnly: true},
];
const OUT_FOR_TODAY = [401, 402, 403, 429];
const PROVIDER_WAIT = 8000;   // ms: a provider that hasn't answered by then has, for this search, said nothing
// what went wrong with a provider: its name and the status it answered with, nothing else (never an address, which may hold a key)
class ProviderError extends Error { constructor(name, status) { super(`${name} answered ${status}`); this.status = status; } }
async function provJSON(name, url, init) {
  let r;
  try { r = await fetch(url, {...init, signal: AbortSignal.timeout(PROVIDER_WAIT)}); } catch { throw new ProviderError(name, 'nothing'); }
  if (!r.ok) throw new ProviderError(name, r.status);
  try { return await r.json(); } catch { throw new ProviderError(name, 'something unreadable'); }
}
/* A provider that's done for the day (at its cap, out of credits, or out after a 401/402/403/429) stays done until
   midnight UTC: this copy of the Worker remembers it, so on a busy day with every cap reached, a title that isn't
   kept is told "capped" at once, with nothing asked of the counter (the Durable Object) or anyone else. */
const OUT = {day: '', names: new Set()};
const isOut = name => OUT.day === today() && OUT.names.has(name);
function markOut(name) { if (OUT.day !== today()) { OUT.day = today(); OUT.names = new Set(); } OUT.names.add(name); }
// one search by a provider, counted first: {ok: true}, or {ok: false, why: 'cap' | 'blocked' | 'total' | 'out' | 'uncounted'}
async function spendOn(env, pv) {
  if (isOut(pv.name)) return {ok: false, why: 'out'};
  if (!env.ARCHIVE) return {ok: false, why: 'uncounted'};
  let r;
  try { r = await store(env).spendSearch(pv.name, today(), pv.cap(env), pv.total ? pv.total(env) : null, pv.cost || 1); }
  catch { return {ok: false, why: 'uncounted'}; }
  if (!r.ok) markOut(pv.name);
  return r;
}
async function blockFor(env, name) { markOut(name); await store(env).blockSearch(name, today()).catch(() => {}); }
/* Serper answers 400 to a search with double quotes in it ("gummo" 1997 dvd cover), and 200 to the same one without
   them. So the quotes come out before it's asked: the filters in pick() look for the whole title in each result
   anyway. If it still answers 400, it's asked once more with the plainest search there is (the title, a film's year,
   "dvd cover" or "book cover") before the next provider gets the search. A 400 says something about that search, not
   about the key or the credits, so it never puts Serper out for the day. /admin/raw (raw) asks once: it's there to
   show what one search really gets. */
const unquoted = q => String(q).replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
const plainQuery = (kind, title, year) => unquoted(kind === 'movie' ? `${title} ${year} dvd cover` : `${title} book cover`);
async function serper(q, key, {kind, title, year, raw}) {
  const ask = q => provJSON('Serper', 'https://google.serper.dev/images', {method: 'POST', headers: {'X-API-KEY': key, 'Content-Type': 'application/json'}, body: JSON.stringify({q, num: 100, gl: 'us', hl: 'en'})});
  const first = unquoted(q), plain = plainQuery(kind, title, year);
  let j;
  try { j = await ask(first); }
  catch (e) {
    if (e.status !== 400 || raw || plain === first) throw e;   // (a film's first round already is the plain search)
    j = await ask(plain);
  }
  return {credits: j.credits, list: (j.images || []).map(r => ({title: r.title, url: r.link, properties: {url: r.imageUrl, width: r.imageWidth, height: r.imageHeight}, thumbnail: {width: r.thumbnailWidth, height: r.thumbnailHeight}}))};
}
async function serpapi(q, key) {
  const j = await provJSON('SerpApi', 'https://serpapi.com/search.json?engine=google_images&hl=en&gl=us&safe=active&q=' + encodeURIComponent(q) + '&api_key=' + encodeURIComponent(key));
  return {list: (j.images_results || []).map(r => ({title: r.title, url: r.link, properties: {url: r.original, width: r.original_width, height: r.original_height}, thumbnail: null}))};
}
async function brave(q, key) {
  const j = await provJSON('Brave', 'https://api.search.brave.com/res/v1/images/search?count=100&safesearch=strict&q=' + encodeURIComponent(q), {headers: {'Accept': 'application/json', 'X-Subscription-Token': key}});
  return {list: j.results || []};
}
/* archive.org. Its search finds items, not pictures (a cover someone scanned is usually an item with a few pictures in
   it), and doesn't say how large a picture is. So: up to 4 image items with the title in theirs, each one's largest
   original JPEGs and PNGs (6 pictures at most in all), and each picture's size read from its first bytes. */
async function archiveOrg(q, key, {title}) {
  const init = {headers: {'User-Agent': UA}};
  const found = await provJSON('archive.org', 'https://archive.org/advancedsearch.php?output=json&rows=8&fl%5B%5D=identifier&fl%5B%5D=title&q=' +
    encodeURIComponent(`title:("${String(title).replace(/["\\]/g, ' ')}") AND mediatype:image`), init);
  const items = ((found.response || {}).docs || []).filter(d => /^[\w.-]+$/.test(d.identifier || '')).slice(0, 4), list = [];
  for (const d of items) {
    if (list.length >= 6) break;
    let files; try { files = (await provJSON('archive.org', `https://archive.org/metadata/${d.identifier}/files`, init)).result || []; } catch { continue; }
    const pics = files.filter(f => f.source === 'original' && /\.(jpe?g|png)$/i.test(f.name || '') && !/^__ia_thumb/.test(f.name) && +f.size > 20000 && +f.size < MAX_IMG)
      .sort((a, b) => b.size - a.size).slice(0, 3);
    for (const f of pics) {
      if (list.length >= 6) break;
      const url = `https://archive.org/download/${d.identifier}/${f.name.split('/').map(encodeURIComponent).join('/')}`;
      const size = await imageSize(url, init).catch(() => null);
      if (size) list.push({title: `${d.title || ''} ${f.name}`, url: 'https://archive.org/details/' + d.identifier, properties: {url, width: size[0], height: size[1]}, thumbnail: null});
    }
  }
  return {list};
}
// a JPEG's or PNG's width and height, from its first 64 KB
async function imageSize(url, init) {
  const r = await fetch(url, {...init, headers: {...(init && init.headers), Range: 'bytes=0-65535'}, signal: AbortSignal.timeout(4000)});
  if (!r.ok || !r.body) return null;
  const reader = r.body.getReader(), parts = []; let n = 0;
  while (n < 65536) { const {done, value} = await reader.read(); if (done) break; parts.push(value); n += value.byteLength; }
  reader.cancel().catch(() => {});
  const b = new Uint8Array(n); let at = 0; for (const part of parts) { b.set(part, at); at += part.byteLength; }
  const u16 = i => (b[i] << 8) | b[i + 1];
  if (n > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return [(u16(16) << 16) | u16(18), (u16(20) << 16) | u16(22)];
  if (n > 4 && b[0] === 0xFF && b[1] === 0xD8) {
    for (let i = 2; i + 9 < n;) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return [u16(i + 7), u16(i + 5)];   // the frame: height, then width
      i += 2 + u16(i + 2);
    }
  }
  return null;
}
/* What the providers said for one title and round, kept as it came (trimmed to the fields we use). The key has no
   filter or scoring version in it: when the filters change they run again on this, with no new search. */
const LEGACY = ['sc11', 'sc10', 'sc9', 'sc8', 'sc7', 'sc6'];
const slim = list => list.map(r => ({title: r.title || '', url: r.url || '',
  properties: {url: r.properties && r.properties.url, width: (r.properties && +r.properties.width) || 0, height: (r.properties && +r.properties.height) || 0},
  thumbnail: r.thumbnail ? {width: +r.thumbnail.width || 0, height: +r.thumbnail.height || 0} : null}));
async function rawScans(env, ctx, kind, title, year, creator, round, cacheOnly) {
  const t0 = Date.now();
  // book searches don't use the year (and book years get corrected), so a book's key has none
  const ckey = `raw1:${kind}:${words(title).join(' ')}:${kind === 'book' ? '' : year}:${roundKey(kind, round)}`, keep = n => ({expirationTtl: n ? 365 * DAY : 7 * DAY});
  const hit = await env.SPINE_CACHE.get(ckey, 'json').catch(() => null);
  if (hit) return {list: hit, from: 'raw'};
  // cacheonly: what's kept under raw1 and nothing more. The page asks it for three rounds of every title it opens, so
  // the older keys below (more KV reads, and for a book KV lists, 1,000 a day on the free plan) are only looked
  // through when they'd save a search
  if (cacheOnly) return {list: [], from: 'miss'};
  // before raw1, only the filtered results were kept (sc6-sc11). They still carry everything the filters read,
  // so they stand in for the raw answer instead of a new search, and are copied to raw1 for next time. (They were
  // kept a month: the last go by 29 October 2026, and this can go then.)
  try {
    for (const v of kind === 'book' && round === 2 ? [] : LEGACY) {
      let old = await env.SPINE_CACHE.get(`${v}:${kind}:${title.toLowerCase()}:${year}:${creator.toLowerCase()}:${round}`, 'json');
      if (!old && kind === 'book') {   // stored under whatever year the book had then
        const k = (await env.SPINE_CACHE.list({prefix: `${v}:book:${title.toLowerCase()}:`, limit: 50})).keys.find(x => x.name.endsWith(':' + round));
        if (k) old = await env.SPINE_CACHE.get(k.name, 'json');
      }
      if (!old || !old.results) continue;
      const list = old.results.map(r => ({title: r.title || '', url: r.source || '', properties: {url: r.img, width: r.width || 0, height: r.height || 0}, thumbnail: null}));
      ctx.waitUntil(env.SPINE_CACHE.put(ckey, JSON.stringify(list), keep(list.length)).catch(() => {}));
      return {list, from: v};
    }
  } catch {}   // KV's reads or lists for the day are used up: on to a search
  // who could be asked for this round. When every one of them is done for the day, that's the answer, at once
  const open = PROVIDERS.filter(pv => pv.key(env) && !(pv.firstRoundOnly && round > 0));
  if (open.length && open.every(pv => isOut(pv.name))) return {list: [], from: 'capped'};
  // one search for a title's round at a time, whoever asks: anyone else is told it's under way (pending) and asks
  // again in a moment, so a title a thousand people add in the same minute is searched once
  if (open.length && env.ARCHIVE) {
    const c = await store(env).claimSearch(ckey, Date.now()).catch(() => ({go: true}));
    if (!c.go) return {list: [], from: 'pending'};
  }
  const run = searchRound(env, kind, title, year, creator, round, ckey, keep);
  ctx.waitUntil(run.work);
  const late = await Promise.race([run.answer.then(() => false), sleep(Math.max(300, BUDGET - (Date.now() - t0))).then(() => true)]);
  return late ? {list: [], from: 'pending'} : run.answer;
}
/* Each provider in turn, until one gives a scan the filters keep. answer: what to tell the page, as soon as it's known;
   work: that, then keeping it (KV, the counts, the claim), which may go on after the page has had its answer (and,
   past BUDGET, the search itself does). */
function searchRound(env, kind, title, year, creator, round, ckey, keep) {
  let say;
  const answer = new Promise(r => { say = r; }), later = [];
  const work = (async () => {
    const q = queryFor(kind, round, title, year, creator), all = [], started = Date.now();
    let asked = 0, capped = false, failed = false, found = '';
    for (const pv of PROVIDERS) {
      const key = pv.key(env);
      if (!key || (pv.firstRoundOnly && round > 0)) continue;
      if (Date.now() - started > 20000) { failed = true; break; }   // waitUntil gives 30 seconds: leave room to keep what there is
      if (!(await spendOn(env, pv)).ok) { capped = true; continue; }   // today's searches (or its credits) are used up, or it's out for the day
      let got;
      try { got = await pv.search(q, key, {kind, title, year, creator, round}); }
      catch (e) {
        if (OUT_FOR_TODAY.includes(e && e.status)) { capped = true; later.push(blockFor(env, pv.name)); }
        else failed = true;   // it didn't answer, or not sensibly: the next one is asked, and this title is tried again tomorrow
        continue;
      }
      if (pv.total && Number.isFinite(got.credits) && got.credits !== pv.cost) later.push(store(env).addCredits(pv.name, got.credits - pv.cost).catch(() => {}));
      asked++;
      const list = slim(got.list || []);
      all.push(...list);
      if (pick(list, kind, title, year, creator).length) { found = pv.name; break; }
    }
    say({list: all, from: found || (capped ? 'capped' : asked ? 'none' : 'miss')});
    // Kept: what a search found, a year (nothing usable in it: a week). Nothing usable while a provider was at its cap,
    // out for the day or not answering: a day only, so the title gets its turn with that provider tomorrow.
    if (asked) later.push(env.SPINE_CACHE.put(ckey, JSON.stringify(all), found || !(capped || failed) ? keep(all.length) : {expirationTtl: DAY}).catch(() => {}));
    await Promise.all(later);
    if (env.ARCHIVE) await store(env).searchDone(ckey, Date.now()).catch(() => {});
  })();
  return {answer, work: work.catch(() => say({list: [], from: 'none'}))};
}
/* The filters: which of the pictures found are a scan of this title, best first (10 at most). */
function pick(found, kind, title, year, creator) {
  // wraps: back | spine | front. Films 1.3-1.9 wide (Blu-ray wraps run wider than DVDs), books 1.2-2.4.
  // Also single spines: at least 4 times taller than wide.
  const [lo, hi] = kind === 'movie' ? [1.3, 1.9] : [1.2, 2.4];
  // the whole title, words in order, must appear in the result's title or addresses:
  // this drops look-alikes such as "Texas - Paris" for Paris, Texas or other films on the same page
  const phrase = words(title), extra = [year, ...words(creator).slice(-1)].filter(Boolean);
  const seen = new Set(), out = [];
  for (const r of found) {
    const img = r.properties && r.properties.url;
    if (!img || !/^https?:/i.test(img)) continue;
    const id = img.replace(/\/s-l\d+\./, '/s-l.');   // eBay serves one photo at many sizes
    if (seen.has(id)) continue;
    seen.add(id);
    // full-size size when the provider has it, else the thumbnail (same aspect, 500px wide)
    const w = r.properties.width || (r.thumbnail && r.thumbnail.width) || 0, h = r.properties.height || (r.thumbnail && r.thumbnail.height) || 0;
    if (!w || !h) continue;
    const wrap = w / h >= lo && w / h <= hi, solo = h / w >= 4;
    if (!wrap && !solo) continue;
    if (r.properties.width && (wrap ? r.properties.width < 400 : r.properties.height < 400)) continue;
    const text = ' ' + words([r.title, decode(r.url || ''), decode(img)].join(' ')).join(' ') + ' ';
    // ...and it has to be in the image's own title or file name, not only the page address: shop pages
    // (amazon.com/Paris-Texas/...) also show other films' covers, e.g. "The Longest Day" on Paris, Texas's page
    const own = ' ' + words([r.title, decode(img)].join(' ')).join(' ') + ' ';
    if (!own.includes(' ' + phrase.join(' ') + ' ')) continue;
    const hits = extra.filter(x => text.includes(' ' + x + ' ')).length;
    if (phrase.length === 1 && extra.length && !hits) continue;   // "Kids" alone also matches "Spy Kids": want the year or director too
    const ed = edition(r, img, text);
    const rank = (SCAN_SITES.test(r.url || img) ? 2 : 0) + hits + (/\bscan|cover|spine/.test(text) ? 1 : 0) + (ed.hint ? 2 : 0) - (ed.en ? 0 : 4) - (ed.vhs ? 3 : 0);
    out.push({img, source: r.url || img, title: clean(r.title, 120), width: r.properties.width || w, height: r.properties.height || h, en: ed.en, vhs: ed.vhs, rank});
  }
  out.sort((a, b) => b.rank - a.rank);
  return out.slice(0, 10).map(({rank, ...r}) => r);
}
const idFor = (kind, v) => kind === 'movie' ? (/^\d{1,9}$/.test(v || '') ? v : '') : (/^OL\d{1,10}W$/.test(v || '') ? v : '');
// a title's found scans are kept under its id and its title together, so a wrong id can only name a key nobody reads
const foundKey = (kind, id, title, year) => `f:${kind}:${id}:${words(title).join(' ')}:${kind === 'movie' ? year : ''}`;
// where a /scans answer is kept at the edge (this data centre's cache)
const scansEdge = (kind, title, year, creator, round, cacheOnly, id) => new Request(`https://scans.cache/${kind}/${encodeURIComponent(words(title).join(' '))}/${year}/${encodeURIComponent(words(creator).join(' '))}/${roundKey(kind, round)}/${cacheOnly ? 'c' : 's'}/${id}`);
async function scans(p, env, cors, ctx) {
  const title = clean(p.get('title'), 120), year = clean(p.get('year'), 4).replace(/\D/g, ''), creator = clean(p.get('creator'), 80);
  const kind = p.get('kind') === 'book' ? 'book' : 'movie', rounds = roundsFor(kind), round = Math.max(0, Math.min(rounds - 1, parseInt(p.get('round'), 10) || 0));
  if (!title) return json({error: 'A title is needed.'}, 400, cors);
  // cacheonly=1: never search, answer from what's stored. The page asks this for the later rounds while the first is
  // searching, so a round kept from before costs nothing and comes at once; cached says whether there was one
  const cacheOnly = p.get('cacheonly') === '1', id = idFor(kind, p.get('id'));
  // the same ask, answered here a moment ago: no KV, no Durable Object, nothing upstream
  const ekey = scansEdge(kind, title, year, creator, round, cacheOnly, id), held = await caches.default.match(ekey);
  if (held) return json(await held.json(), 200, cors, {'X-Cache': 'EDGE'});
  // round 0: approved archive spines and the scans this title's spines were cut from before, in one ask
  const kept = round === 0 ? await titleSpines(env, kind, title, year, creator, id) : {archived: [], found: []};
  const {list: found, from} = await rawScans(env, ctx, kind, title, year, creator, round, cacheOnly);
  // capped: nothing usable was found and a provider was at its cap or out for the day; pending: a search is under way.
  // Either way the page makes a spine from the cover, and asks again for a pending one in a moment
  const body = {results: [...kept.archived, ...pick(found, kind, title, year, creator)], round, more: round < rounds - 1, ...(kept.found.length ? {found: kept.found} : {}),
    ...(from === 'capped' ? {capped: true} : {}), ...(from === 'pending' ? {pending: true} : {}), ...(cacheOnly ? {cached: from !== 'miss'} : {})};
  // at the edge: a round 0 five minutes (its found scans grow), a later round a day; capped five minutes, a round
  // nobody has kept yet a minute, one under way not at all
  const ttl = from === 'pending' ? 0 : from === 'capped' ? 300 : from === 'miss' ? 60 : round === 0 ? 300 : DAY;
  if (ttl) ctx.waitUntil(edgeKeep(ekey, body, ttl).catch(() => {}));
  return json(body, 200, cors, {'X-Cache': from});
}
/* round 0's spines that need no search: approved archive spines (a title's own, the same year, a book by the same
   author) and found, the scans whose spine a page cut cleanly before, best first */
async function titleSpines(env, kind, title, year, creator, id) {
  if (!env.ARCHIVE) return {archived: [], found: []};
  try {
    const got = await store(env).titleSpines(titleKey(kind, title), foundKey(kind, id, title, year));
    return {archived: archivedOf(got.archived, kind, year, creator), found: got.found};
  } catch { return {archived: [], found: []}; }
}
/* POST /found: the scans a page cut clean spines from, for the next visitor to load first. Only a scan /scans gave
   for that title and round is kept (so a page can't put any picture it likes here), with the place and size /scans
   gave it; the page says only which, from which round, and how well it cut (0-100). The cut itself is always made
   again by each page, from the scan. */
const FOUND_MAX = 6;
async function foundPost(req, env, cors) {
  if (!env.ARCHIVE) return json({ok: true, kept: 0}, 200, cors);
  const text = req.body ? new TextDecoder().decode(await readCapped(req.body, 8192) || new Uint8Array()) : '';
  let b; try { b = JSON.parse(text); } catch { return json({error: 'That isn’t a list of cuts.'}, 400, cors); }
  const kind = b && b.kind === 'book' ? 'book' : 'movie', title = clean(b && b.title, 120), year = clean(b && b.year, 4).replace(/\D/g, ''), creator = clean(b && b.creator, 80), id = idFor(kind, String((b && b.id) || ''));
  const cuts = Array.isArray(b && b.cuts) ? b.cuts.slice(0, 12) : [];
  if (!title || !cuts.length) return json({error: 'Which title, and which cuts?'}, 400, cors);
  const keepIt = [], lists = new Map();
  for (const c of cuts) {
    const round = Number.isInteger(c && c.round) && c.round >= 0 && c.round < roundsFor(kind) ? c.round : -1, score = Math.round(+(c && c.score));
    if (round < 0 || !(score >= 0 && score <= 100) || typeof c.img !== 'string') continue;
    if (!lists.has(round)) {
      const raw = await env.SPINE_CACHE.get(`raw1:${kind}:${words(title).join(' ')}:${kind === 'book' ? '' : year}:${roundKey(kind, round)}`, 'json').catch(() => null);
      lists.set(round, raw ? pick(raw, kind, title, year, creator) : []);
    }
    const s = lists.get(round).find(x => x.img === c.img);
    if (s && !keepIt.some(x => x.img === s.img)) keepIt.push({...s, round, score});
  }
  if (keepIt.length) await store(env).addFound(foundKey(kind, id, title, year), keepIt, Date.now());
  // this data centre's kept round 0 has no found yet: let the next ask read it
  if (keepIt.length) await Promise.all(['c', 's'].map(m => caches.default.delete(scansEdge(kind, title, year, creator, 0, m === 'c', id)).catch(() => {})));
  return json({ok: true, kept: keepIt.length}, 200, cors);
}
/* ---------- admin: today's searches, and one provider's raw answer ---------- */
async function usage(env) {
  const day = today(), u = env.ARCHIVE ? await store(env).searchUsage(day) : {today: [], credits: []};
  return {day, providers: PROVIDERS.map(pv => {
    const t = u.today.find(x => x.name === pv.name) || {}, c = u.credits.find(x => x.name === pv.name);
    // key: whether there is one, never what it is
    return {name: pv.name, key: pv.name === 'archiveorg' ? 'not needed' : !!pv.key(env), today: t.n || 0, cap: pv.cap(env), out: !!t.blocked, ...(pv.total ? {credits: c ? c.n : 0, creditCap: pv.total(env)} : {})};
  })};
}
async function rawFrom(name, q, env, cors) {
  const pv = PROVIDERS.find(x => x.name === name), key = pv && pv.key(env);
  if (!pv) return json({error: 'Which provider? One of: ' + PROVIDERS.map(x => x.name).join(', ') + '.'}, 400, cors);
  if (!q) return json({error: 'A search is needed (q).'}, 400, cors);
  if (!key) return json({error: `${pv.name} has no key set.`}, 400, cors);
  const spent = await spendOn(env, pv);
  if (!spent.ok) return json({error: `${pv.name} has had today’s searches, or is out for the day (${spent.why}).`}, 429, cors);
  let got;
  try { got = await pv.search(q, key, {kind: 'movie', title: q, year: '', creator: '', round: 0, raw: true}); }
  catch (e) {
    if (OUT_FOR_TODAY.includes(e && e.status)) await blockFor(env, pv.name);
    return json({error: e instanceof ProviderError ? e.message : `${pv.name} didn’t answer.`}, 502, cors);
  }
  if (pv.total && Number.isFinite(got.credits) && got.credits !== pv.cost) await store(env).addCredits(pv.name, got.credits - pv.cost).catch(() => {});
  return json({provider: pv.name, results: slim(got.list || []).map(r => ({title: r.title, url: r.url, img: r.properties.url, w: r.properties.width || (r.thumbnail && r.thumbnail.width) || 0, h: r.properties.height || (r.thumbnail && r.thumbnail.height) || 0}))}, 200, cors, {'Cache-Control': 'no-store'});
}

/* ---------- /img: CORS image proxy ---------- */
function publicHost(u) {
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
  if (u.port && !['80', '443'].includes(u.port)) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return false;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [+v4[1], +v4[2]];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127) return false;
  }
  if (h.includes(':') && (h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:'))) return false;
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return false;   // 2130706433, 0x7f000001
  return true;
}
async function readCapped(body, max) {
  const reader = body.getReader(), parts = []; let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { reader.cancel(); return null; }
    parts.push(value);
  }
  const buf = new Uint8Array(size); let o = 0; for (const part of parts) { buf.set(part, o); o += part.byteLength; }
  return buf;
}
async function image(raw, cors, ctx) {
  let u;
  try { u = new URL(raw); } catch { return json({error: 'That is not a valid image address.'}, 400, cors); }
  if (!publicHost(u)) return json({error: 'That image address is not allowed.'}, 400, cors);

  const cache = caches.default, ckey = new Request('https://img.cache/' + encodeURIComponent(u.href));
  let res = await cache.match(ckey);
  if (!res) {
    let r, hops = 0;
    for (;;) {
      r = await fetch(u.href, {redirect: 'manual', headers: {'User-Agent': UA, 'Accept': 'image/*'}, cf: {cacheTtl: MONTH, cacheEverything: true}});
      if (r.status >= 300 && r.status < 400 && r.headers.get('Location')) {
        if (++hops > 3) return json({error: 'That image redirects too many times.'}, 502, cors);
        u = new URL(r.headers.get('Location'), u);
        if (!publicHost(u)) return json({error: 'That image address is not allowed.'}, 400, cors);
        continue;
      }
      break;
    }
    if (!r.ok) return json({error: `The image host answered ${r.status}.`}, 502, cors);
    const type = (r.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/') || type === 'image/svg+xml') return json({error: 'That address is not an image.'}, 415, cors);
    if (+(r.headers.get('Content-Length') || 0) > MAX_IMG) return json({error: 'That image is larger than 8 MB.'}, 413, cors);
    const buf = await readCapped(r.body, MAX_IMG);   // Content-Length can be missing
    if (!buf) return json({error: 'That image is larger than 8 MB.'}, 413, cors);
    if (!buf.byteLength) return json({error: 'The image host sent an empty file.'}, 502, cors);
    res = new Response(buf, {headers: {'Content-Type': type, 'Cache-Control': `public, max-age=${MONTH}, immutable`, 'X-Content-Type-Options': 'nosniff'}});
    ctx.waitUntil(cache.put(ckey, res.clone()));
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}

/* ---------- archive: spines people cut from their own scans, shown only after approval ----------
   The PNGs live in KV (a:png:<id>): written once, never changed. Everything that changes (status,
   reports, the lists, today's upload counts) lives in one small SQLite Durable Object, because KV
   reads can be up to a minute stale, which would let counters and limits slip. */
const UPLOADS_PER_DAY_ALL = 50;   // across everyone: some networks share addresses, so per-address limits alone leak
const titleKey = (kind, title) => `${kind}:${words(title).join(' ')}`;
async function visitor(ip) {
  // IPv6 hands one household a whole /64 and changes the rest often: count the /64
  const v6 = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('spinestack:' + v6));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
const store = env => env.ARCHIVE.get(env.ARCHIVE.idFromName('archive'));
const cleanId = id => String(id || '').replace(/[^a-f0-9]/g, '').slice(0, 32);

export class Archive extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS spines (id TEXT PRIMARY KEY, tkey TEXT, kind TEXT, title TEXT, year TEXT, author TEXT,
      status TEXT, reports INTEGER DEFAULT 0, created INTEGER, approved INTEGER, w INTEGER, h INTEGER, bytes INTEGER)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS spines_title ON spines (tkey, status)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS uploads (who TEXT, day TEXT, n INTEGER, PRIMARY KEY (who, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS reports (id TEXT, who TEXT, PRIMARY KEY (id, who))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS userwrites (who TEXT, day TEXT, n INTEGER, PRIMARY KEY (who, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS mediawrites (who TEXT, day TEXT, n INTEGER, PRIMARY KEY (who, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS bravecalls (day TEXT PRIMARY KEY, n INTEGER)`);
    // searches by each provider, a day at a time (blocked: it answered 401, 402, 403 or 429 and is left alone till tomorrow),
    // and credits spent in all by a provider that has only so many
    this.sql.exec(`CREATE TABLE IF NOT EXISTS searches (name TEXT, day TEXT, n INTEGER DEFAULT 0, blocked INTEGER DEFAULT 0, PRIMARY KEY (name, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS credits (name TEXT PRIMARY KEY, n INTEGER DEFAULT 0)`);
    // one scan search at a time for a title's round (at: when it started, or finished once done is 1)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS claims (key TEXT PRIMARY KEY, at INTEGER, done INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS claims_at ON claims (at)`);
    // the scans a page cut a title's spines from cleanly (POST /found), best first: a JSON list, FOUND_MAX at most
    this.sql.exec(`CREATE TABLE IF NOT EXISTS found (key TEXT PRIMARY KEY, list TEXT, at INTEGER)`);
    // Brave's searches used to be counted on their own (bravecalls): today's count carries over
    this.sql.exec(`INSERT OR IGNORE INTO searches (name, day, n) SELECT 'brave', day, n FROM bravecalls`);
  }
  // one more search by this provider today, if its cap for the day leaves room, it isn't out for the day, and (when it
  // has only so many credits) the credits it costs are still there. One step: two requests can't both take the last one.
  spendSearch(name, day, cap, total, cost) {
    const row = this.one('SELECT n, blocked FROM searches WHERE name = ? AND day = ?', name, day), n = row ? row.n : 0;
    if (row && row.blocked) return {ok: false, why: 'blocked', n};
    if (n >= cap) return {ok: false, why: 'cap', n};
    if (total != null) {
      const used = (this.one('SELECT n FROM credits WHERE name = ?', name) || {}).n || 0;
      if (used + cost > total) return {ok: false, why: 'total', n};
      this.sql.exec('INSERT INTO credits (name, n) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET n = n + ?', name, cost, cost);
    }
    this.sql.exec('INSERT INTO searches (name, day, n) VALUES (?, ?, 1) ON CONFLICT (name, day) DO UPDATE SET n = n + 1', name, day);
    this.sql.exec('DELETE FROM searches WHERE day < ?', day);
    return {ok: true, n: n + 1};
  }
  // this provider is left alone for the rest of the day
  blockSearch(name, day) {
    this.sql.exec('INSERT INTO searches (name, day, n, blocked) VALUES (?, ?, 0, 1) ON CONFLICT (name, day) DO UPDATE SET blocked = 1', name, day);
    return {ok: true};
  }
  // a search cost more or fewer credits than was counted for it
  addCredits(name, extra) {
    this.sql.exec('INSERT INTO credits (name, n) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET n = MAX(0, n + ?)', name, Math.max(0, extra), extra);
    return {ok: true};
  }
  // may this request search for this title's round? Not while another started less than 30 seconds ago, or finished
  // less than 2 minutes ago (KV, where it was kept, can take a minute to say so everywhere)
  claimSearch(key, now) {
    const row = this.one('SELECT at, done FROM claims WHERE key = ?', key);
    if (row && now - row.at < (row.done ? 120e3 : 30e3)) return {go: false};
    this.sql.exec('DELETE FROM claims WHERE at < ?', now - DAY * 1000);
    this.sql.exec('INSERT INTO claims (key, at, done) VALUES (?, ?, 0) ON CONFLICT (key) DO UPDATE SET at = excluded.at, done = 0', key, now);
    return {go: true};
  }
  searchDone(key, now) { this.sql.exec('UPDATE claims SET at = ?, done = 1 WHERE key = ?', now, key); return {ok: true}; }
  // round 0's spines that need no search: approved ones from the archive, and the scans found before
  titleSpines(tkey, fkey) {
    const row = this.one('SELECT list FROM found WHERE key = ?', fkey);
    return {archived: this.approvedFor(tkey), found: row ? JSON.parse(row.list) : []};
  }
  addFound(fkey, cuts, now) {
    const row = this.one('SELECT list FROM found WHERE key = ?', fkey), list = row ? JSON.parse(row.list) : [];
    for (const c of cuts) { const had = list.find(x => x.img === c.img); if (had) had.score = Math.max(had.score, c.score); else list.push(c); }
    list.sort((a, b) => b.score - a.score);
    this.sql.exec('INSERT INTO found (key, list, at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET list = excluded.list, at = excluded.at', fkey, JSON.stringify(list.slice(0, FOUND_MAX)), now);
    return {ok: true};
  }
  searchUsage(day) {
    return {today: this.sql.exec('SELECT name, n, blocked FROM searches WHERE day = ?', day).toArray(), credits: this.sql.exec('SELECT name, n FROM credits').toArray()};
  }
  // one more photo, wall or PNG for this account today, if there's room (per account and in all)
  spendMedia(who, day) {
    const mine = (this.one('SELECT n FROM mediawrites WHERE who = ? AND day = ?', who, day) || {}).n || 0;
    if (mine >= MEDIA_PER_DAY) return {ok: false, error: 'That’s 200 pictures today. Try again tomorrow.'};
    const all = (this.one('SELECT SUM(n) AS n FROM mediawrites WHERE day = ?', day) || {}).n || 0;
    if (all >= MEDIA_PER_DAY_ALL) return {ok: false, error: 'Uploads are full for today. Try again tomorrow.'};
    this.sql.exec('INSERT INTO mediawrites (who, day, n) VALUES (?, ?, 1) ON CONFLICT (who, day) DO UPDATE SET n = n + 1', who, day);
    this.sql.exec('DELETE FROM mediawrites WHERE day < ?', day);
    return {ok: true};
  }
  // one more image written for this account today, if there's room (per account and in all)
  spend(who, day) {
    const mine = (this.one('SELECT n FROM userwrites WHERE who = ? AND day = ?', who, day) || {}).n || 0;
    if (mine >= USER_WRITES_PER_DAY) return {ok: false, error: 'That is a lot of saving for one day. Try again tomorrow.'};
    const all = (this.one('SELECT SUM(n) AS n FROM userwrites WHERE day = ?', day) || {}).n || 0;
    if (all >= USER_WRITES_PER_DAY_ALL) return {ok: false, error: 'Saving is full for today. Your shelf is still here; try again tomorrow.'};
    this.sql.exec('INSERT INTO userwrites (who, day, n) VALUES (?, ?, 1) ON CONFLICT (who, day) DO UPDATE SET n = n + 1', who, day);
    this.sql.exec('DELETE FROM userwrites WHERE day < ?', day);
    return {ok: true};
  }
  one(q, ...a) { return this.sql.exec(q, ...a).toArray()[0] || null; }
  // checks today's limits and, if there's room, records the new pending spine: one step, so two uploads can't both slip in
  add(meta, who, day) {
    const mine = (this.one('SELECT n FROM uploads WHERE who = ? AND day = ?', who, day) || {}).n || 0;
    if (mine >= UPLOADS_PER_DAY) return {ok: false, error: 'That is 10 spines today. Try again tomorrow.'};
    const all = (this.one('SELECT SUM(n) AS n FROM uploads WHERE day = ?', day) || {}).n || 0;
    if (all >= UPLOADS_PER_DAY_ALL) return {ok: false, error: 'The archive is full for today. Try again tomorrow.'};
    this.sql.exec('INSERT INTO uploads (who, day, n) VALUES (?, ?, 1) ON CONFLICT (who, day) DO UPDATE SET n = n + 1', who, day);
    this.sql.exec('DELETE FROM uploads WHERE day < ?', day);
    this.sql.exec(`INSERT INTO spines (id, tkey, kind, title, year, author, status, reports, created, w, h, bytes) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
      meta.id, meta.tkey, meta.kind, meta.title, meta.year, meta.author, meta.created, meta.w, meta.h, meta.bytes);
    return {ok: true};
  }
  get(id) { return this.one('SELECT * FROM spines WHERE id = ?', id); }
  approvedFor(tkey) { return this.sql.exec(`SELECT * FROM spines WHERE tkey = ? AND status = 'approved' ORDER BY approved DESC LIMIT 6`, tkey).toArray(); }
  list(status) { return this.sql.exec('SELECT * FROM spines WHERE status = ? ORDER BY created DESC LIMIT 200', status).toArray(); }
  approve(id) {
    this.sql.exec(`UPDATE spines SET status = 'approved', reports = 0, approved = ? WHERE id = ?`, Date.now(), id);
    this.sql.exec('DELETE FROM reports WHERE id = ?', id);
    return this.get(id);
  }
  remove(id) {
    const m = this.get(id);
    this.sql.exec('DELETE FROM spines WHERE id = ?', id);
    this.sql.exec('DELETE FROM reports WHERE id = ?', id);
    return m;
  }
  // one report per visitor; the third sends an approved spine back to pending
  report(id, who) {
    const m = this.get(id);
    if (!m || m.status !== 'approved') return {counted: false, hidden: false};
    if (this.one('SELECT 1 AS x FROM reports WHERE id = ? AND who = ?', id, who)) return {counted: false, hidden: false};
    this.sql.exec('INSERT INTO reports (id, who) VALUES (?, ?)', id, who);
    const n = m.reports + 1, hide = n >= REPORTS_TO_HIDE;
    this.sql.exec('UPDATE spines SET reports = ?, status = ? WHERE id = ?', n, hide ? 'pending' : 'approved', id);
    return {counted: true, hidden: hide};
  }
}

async function upload(req, p, ip, env, cors) {
  const kind = p.get('kind') === 'book' ? 'book' : p.get('kind') === 'movie' ? 'movie' : '';
  const title = clean(p.get('title'), 120), year = clean(p.get('year'), 4).replace(/\D/g, ''), author = clean(p.get('author'), 80);
  if (!kind || !words(title).length) return json({error: 'A title and whether it is a film or a book are needed.'}, 400, cors);
  if (+(req.headers.get('Content-Length') || 0) > MAX_UPLOAD) return json({error: 'The spine image must be 300 KB or less.'}, 413, cors);
  const buf = await readCapped(req.body, MAX_UPLOAD);
  if (!buf) return json({error: 'The spine image must be 300 KB or less.'}, 413, cors);

  // decode and draw it again as a plain PNG: only pixels survive, nothing else in the file does
  let w, h, rgba;
  try { const img = UPNG.decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); w = img.width; h = img.height; rgba = UPNG.toRGBA8(img)[0]; }
  catch { return json({error: 'That is not a PNG image.'}, 415, cors); }
  if (w < 8 || h < 150 || h > 3000 || h < w * 3) return json({error: 'That does not look like a spine: it must be at least 3 times taller than wide.'}, 422, cors);
  const png = new Uint8Array(UPNG.encode([rgba], w, h, 0));

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16), day = new Date().toISOString().slice(0, 10);
  const meta = {id, tkey: titleKey(kind, title), kind, title, year, author, created: Date.now(), w, h, bytes: png.byteLength};
  const r = await store(env).add(meta, await visitor(ip), day);
  if (!r.ok) return json({error: r.error}, 429, cors);
  try { await env.SPINE_CACHE.put(`a:png:${id}`, png); }
  catch (e) { await store(env).remove(id); throw e; }
  return json({ok: true, id, status: 'pending'}, 200, cors);
}
async function archiveFor(env, kind, title, year, creator) {
  if (!env.ARCHIVE) return [];
  return archivedOf(await store(env).approvedFor(titleKey(kind, title)), kind, year, creator);
}
// a title's approved spines, as /scans gives them: not another film of the same name, not another author's book
function archivedOf(rows, kind, year, creator) {
  const last = words(creator).slice(-1)[0], out = [];
  for (const m of rows) {
    if (year && m.year && m.year !== year) continue;                              // another film with the same name
    if (kind === 'book' && last && m.author && !words(m.author).includes(last)) continue;
    out.push({img: `/archive/img?id=${m.id}`, source: 'archive', title: m.title, width: m.w, height: m.h, archive: true, id: m.id, en: true, vhs: false});
  }
  return out;
}
async function archiveImage(id, req, env, cors) {
  id = cleanId(id);
  const m = id && await store(env).get(id);
  const admin = m && m.status !== 'approved' && await isAdmin(req, env);
  if (!m || (m.status !== 'approved' && !admin)) return json({error: 'Not found.'}, 404, cors);
  const png = await env.SPINE_CACHE.get(`a:png:${id}`, 'arrayBuffer');
  if (!png) return json({error: 'Not found.'}, 404, cors);
  return new Response(png, {headers: {'Content-Type': 'image/png', 'Cache-Control': admin ? 'no-store' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', ...cors}});
}
async function report(id, ip, env, cors) {
  id = cleanId(id);
  if (!id) return json({ok: true}, 200, cors);
  const r = await store(env).report(id, await visitor(ip));
  return json({ok: true, ...r}, 200, cors);
}

/* ---------- admin ---------- */
async function isAdmin(req, env) {
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), want = env.ADMIN_TOKEN || '';
  if (!want || !got) return false;
  const a = new TextEncoder().encode(got), b = new TextEncoder().encode(want);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}
const listMeta = (env, status) => store(env).list(status);
async function approve(id, env, cors) {
  id = cleanId(id);
  const m = id && await store(env).get(id);
  if (!m) return json({error: 'Not found.'}, 404, cors);
  await store(env).approve(id);
  return json({ok: true, id, status: 'approved'}, 200, cors);
}
async function remove(id, env, cors) {
  id = cleanId(id);
  const m = id && await store(env).remove(id);
  if (!m) return json({error: 'Not found.'}, 404, cors);
  await env.SPINE_CACHE.delete(`a:png:${id}`);
  return json({ok: true, id, deleted: true}, 200, cors);
}

/* ---------- accounts: images saved shelves need ----------
   Who: the Supabase access token, checked by asking Supabase who it belongs to (with the public key only;
   no secret key anywhere). Where: KV for now; bind an R2 bucket as USER_R2 and the same keys move there. */
const USER_WRITES_PER_DAY = 150, USER_WRITES_PER_DAY_ALL = 600, MAX_BLOB = 200 * 1024, MAX_PREVIEW = 120 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WHO = new Map();   // token -> user id, for a minute, so one save (up to ~14 requests) asks Supabase once
async function userOf(req, env) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  const memo = WHO.get(token);
  if (memo && memo.until > Date.now()) return memo.id;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {headers: {apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + token}});
  if (!r.ok) return null;
  const u = await r.json().catch(() => null), id = u && UUID.test(u.id || '') ? u.id : null;
  if (id) { if (WHO.size > 500) WHO.clear(); WHO.set(token, {id, until: Date.now() + 60000}); }
  return id;
}
function userStore(env) {
  if (env.USER_R2) return {
    head: async k => !!(await env.USER_R2.head(k)),
    get: async k => { const o = await env.USER_R2.get(k); return o && {body: await o.arrayBuffer(), type: (o.httpMetadata || {}).contentType || 'application/octet-stream'}; },
    put: (k, body, type) => env.USER_R2.put(k, body, {httpMetadata: {contentType: type}}),
    del: k => env.USER_R2.delete(k),
  };
  const kv = env.SPINE_CACHE;
  return {
    head: async k => { const v = await kv.get('ub:' + k, 'stream'); if (v) await v.cancel(); return !!v; },
    get: async k => { const r = await kv.getWithMetadata('ub:' + k, 'arrayBuffer'); return r.value && {body: r.value, type: (r.metadata || {}).t || 'application/octet-stream'}; },
    put: (k, body, type) => kv.put('ub:' + k, body, {metadata: {t: type}}),
    del: k => kv.delete('ub:' + k),
  };
}
// only real PNG, JPEG or WebP files (by their first bytes, not by what the request says)
function imageType(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function putUserImage(req, env, cors, user, what, shelf) {
  const max = what === 'blob' ? MAX_BLOB : MAX_PREVIEW, tooBig = `That image is larger than ${max / 1024} KB.`;
  if (what === 'preview' && !UUID.test(shelf || '')) return json({error: 'Which shelf?'}, 400, cors);
  if (+(req.headers.get('Content-Length') || 0) > max) return json({error: tooBig}, 413, cors);
  const buf = await readCapped(req.body, max);
  if (!buf) return json({error: tooBig}, 413, cors);
  const type = imageType(buf);
  if (!type) return json({error: 'That is not a PNG, JPEG or WebP image.'}, 415, cors);
  const key = what === 'blob' ? `${user}/${hex(await crypto.subtle.digest('SHA-256', buf))}` : `${user}/p/${shelf}`, st = userStore(env);
  if (what === 'blob' && await st.head(key)) return json({ok: true, key, stored: false}, 200, cors);   // already there
  const r = await store(env).spend(user, new Date().toISOString().slice(0, 10));
  if (!r.ok) return json({error: r.error}, 429, cors);
  await st.put(key, buf, type);
  return json({ok: true, key, stored: true}, 200, cors);
}
async function userImage(path, p, env, cors, ctx) {
  const k = String(p.get('k') || ''), [user, a, b] = k.split('/');
  const ok = UUID.test(user || '') && (path === '/u/blob' ? /^[0-9a-f]{64}$/.test(a || '') && b === undefined : a === 'p' && UUID.test(b || ''));
  if (!ok) return json({error: 'Not found.'}, 404, cors);
  const cache = caches.default, ckey = new Request(`https://ub.cache/${k}?v=${encodeURIComponent(p.get('v') || '')}`);
  let res = await cache.match(ckey);
  if (!res) {
    const o = await userStore(env).get(k);
    if (!o) return json({error: 'Not found.'}, 404, cors);
    // a blob never changes; a preview changes when its shelf is saved again, and the page asks with ?v=<updated>
    const long = path === '/u/blob' || p.get('v');
    res = new Response(o.body, {headers: {'Content-Type': o.type, 'Cache-Control': long ? 'public, max-age=31536000, immutable' : 'public, max-age=60', 'X-Content-Type-Options': 'nosniff'}});
    ctx.waitUntil(cache.put(ckey, res.clone()));
  }
  const out = new Response(res.body, res);
  for (const [h, v] of Object.entries(cors)) out.headers.set(h, v);
  return out;
}
async function forgetPreview(env, cors, user, shelf) {
  if (!UUID.test(shelf || '')) return json({error: 'Which shelf?'}, 400, cors);
  await userStore(env).del(`${user}/p/${shelf}`);
  return json({ok: true}, 200, cors);
}

/* ---------- accounts: profile photos, walls and wall PNGs, in R2 ----------
   Keys are <user id>/<avatar|wall|png>/<32 random hex>, never the file's name. The page shrinks and re-encodes every
   picture before sending it (which also drops EXIF and location); here each one is checked again: PNG, JPEG or WebP by
   its first bytes, 2 MB at most, 20 a minute and 200 a day per account, 20,000 a day in all, and walls and PNGs only
   for Pro accounts (the database decides who is Pro). */
const MAX_MEDIA = 2 * 1024 * 1024, MEDIA_PER_DAY = 200, MEDIA_PER_DAY_ALL = 20000, MEDIA_KINDS = ['avatar', 'wall', 'png'];
const MEDIA_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(avatar|wall|png)\/[0-9a-f]{32}$/;
// a database function, called as the signed-in person (so Row Level Security applies)
async function asUser(req, env, fn, args) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {method: 'POST', body: JSON.stringify(args || {}),
    headers: {apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}});
  if (!r.ok) throw new Error(`${fn} answered ${r.status}`);
  return r.json();
}
async function putMedia(req, p, env, cors, user) {
  if (!env.MEDIA) return json({error: 'Picture uploads aren’t set up yet.'}, 503, cors);
  const kind = p.get('kind');
  if (!MEDIA_KINDS.includes(kind)) return json({error: 'What kind of picture is it?'}, 400, cors);
  if (!(await allowed(env.UPLOAD_LIMITER, user))) return json({error: 'That’s a lot of pictures at once. Wait a minute and try again.'}, 429, cors);
  const tooBig = 'That picture is larger than 2 MB.';
  if (+(req.headers.get('Content-Length') || 0) > MAX_MEDIA) return json({error: tooBig}, 413, cors);
  const buf = req.body && await readCapped(req.body, MAX_MEDIA);
  if (!buf) return json({error: tooBig}, 413, cors);
  const type = imageType(buf);
  if (!type) return json({error: 'That is not a PNG, JPEG or WebP image.'}, 415, cors);
  if (kind !== 'avatar' && (await asUser(req, env, 'am_i_pro')) !== true) return json({error: 'Your own wall and PNGs come with Pro.', pro: true}, 403, cors);
  const r = await store(env).spendMedia(user, new Date().toISOString().slice(0, 10));
  if (!r.ok) return json({error: r.error}, 429, cors);
  const key = `${user}/${kind}/${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
  await env.MEDIA.put(key, buf, {httpMetadata: {contentType: type}});
  return json({ok: true, key}, 200, cors);
}
async function mediaImage(p, env, cors, ctx) {
  const k = String(p.get('k') || '');
  if (!MEDIA_KEY.test(k) || !env.MEDIA) return json({error: 'Not found.'}, 404, cors);
  const cache = caches.default, ckey = new Request(`https://media.cache/${k}`);
  let res = await cache.match(ckey);
  if (!res) {
    const o = await env.MEDIA.get(k);
    if (!o) return json({error: 'Not found.'}, 404, cors);
    // a day, not forever: a deleted picture shouldn't linger in caches
    res = new Response(o.body, {headers: {'Content-Type': (o.httpMetadata || {}).contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff'}});
    ctx.waitUntil(cache.put(ckey, res.clone()));
  }
  const out = new Response(res.body, res);
  for (const [h, v] of Object.entries(cors)) out.headers.set(h, v);
  return out;
}
async function deleteMedia(req, p, env, cors, user) {
  if (!env.MEDIA) return json({error: 'Picture uploads aren’t set up yet.'}, 503, cors);
  const k = String(p.get('k') || '');
  if (!MEDIA_KEY.test(k) || !k.startsWith(user + '/')) return json({error: 'That picture isn’t yours.'}, 403, cors);
  // "Save as a new shelf" shares pictures between shelves: only delete what nothing of yours uses any more
  if ((await asUser(req, env, 'media_in_use', {k})) !== false) return json({ok: true, deleted: false}, 200, cors);
  await env.MEDIA.delete(k);
  await caches.default.delete(new Request(`https://media.cache/${k}`));
  return json({ok: true, deleted: true}, 200, cors);
}
