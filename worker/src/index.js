/* Spinestack Worker: film/book lookup, DVD/book scan search, a CORS image proxy, and a small
   moderated archive of spines people cut from their own scans. Keys live in Worker secrets
   (TMDB_TOKEN, BRAVE_API_KEY, ADMIN_TOKEN), never in the page.

   GET  /identify?q=&want=all|movie|book  -> {results:[{kind,title,year,creator,cover}]}
   GET  /scans?title=&year=&kind=movie|book&creator=&round=0-3
        -> {results:[{img,source,title,width,height, archive?,id?}], round, more}
        One Brave query per round, so the page asks for the next round only when it still needs spines.
        Round 0 starts with approved spines from the archive.
   GET  /img?url=  -> the image, with CORS
   POST /archive?kind=&title=&year=&author=  (body: PNG of one spine) -> {ok, id, status:'pending'}
   GET  /archive/img?id=  -> an approved spine (pending ones only with the admin token)
        Limits: 10 uploads a day per visitor and 50 a day in all; see the Archive class below.
   POST /report?id=  -> three reports send an approved spine back to pending
   GET  /admin/list?status=pending|approved, POST /admin/approve?id=, POST /admin/delete?id=
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
   POST /m/delete?k=<key>  -> deletes one of your own pictures once no shelf of yours and not your profile uses it
   Every day at 03:00 UTC (cron) the Worker makes one tiny read from Supabase, so the free project isn't
   paused for being inactive.
*/
import UPNG from 'upng-js';
import {DurableObject} from 'cloudflare:workers';

const ORIGINS = ['https://reflexgod.github.io', 'https://shelfstackd.com', 'http://localhost:8080'];
const DAY = 86400, MONTH = 30 * DAY;
const MAX_IMG = 8 * 1024 * 1024, MAX_UPLOAD = 300 * 1024, UPLOADS_PER_DAY = 10, REPORTS_TO_HIDE = 3, ROUNDS = 4;
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
        // what Brave returns before any filtering, to tune the filters (costs one search)
        if (!post && path === '/admin/brave') return json({results: (await brave(clean(p.get('q'), 200), env.BRAVE_API_KEY)).map(r => ({title: r.title, url: r.url, img: r.properties && r.properties.url,
          w: (r.properties && r.properties.width) || (r.thumbnail && r.thumbnail.width), h: (r.properties && r.properties.height) || (r.thumbnail && r.thumbnail.height)}))}, 200, cors, {'Cache-Control': 'no-store'});
        return json({error: 'Not found.'}, 404, cors);
      }
      if (!(await allowed(env.LIMITER, ip))) return json({error: 'Too many requests. Wait a minute and try again.'}, 429, cors);
      if (!post && path === '/identify') return await identify(p, env, cors, ctx);
      if (!post && path === '/scans') return await scans(p, env, cors, ctx);
      if (post && path === '/archive') return await upload(req, p, ip, env, cors);
      if (post && path === '/report') return await report(p.get('id'), ip, env, cors);
      if (!post && (path === '/' || path === '/health')) return json({ok: true, tmdb: !!env.TMDB_TOKEN, brave: !!env.BRAVE_API_KEY, archive: !!(env.ADMIN_TOKEN && env.ARCHIVE), accounts: !!(env.SUPABASE_URL && env.SUPABASE_KEY), userStore: env.USER_R2 ? 'r2' : 'kv'}, 200, cors);
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
async function allowed(limiter, ip) {
  if (!limiter) return true;   // binding not configured: no limit
  try { return (await limiter.limit({key: ip})).success; } catch { return true; }
}
const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
const words = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
const decode = u => { try { return decodeURIComponent(u.replace(/\+/g, ' ')); } catch { return u; } };

/* KV cache: each title costs one upstream lookup, then it's served from here for 30 days. */
async function cached(env, ctx, key, ttl, make) {
  if (env.SPINE_CACHE) {
    const hit = await env.SPINE_CACHE.get(key, 'json');
    if (hit) return {body: hit, hit: true};
  }
  const body = await make();
  if (env.SPINE_CACHE && body) ctx.waitUntil(env.SPINE_CACHE.put(key, JSON.stringify(body), {expirationTtl: body.results && body.results.length ? ttl : DAY}));
  return {body, hit: false};
}

/* ---------- /identify ---------- */
async function getJSON(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return r.json();
}
async function tmdbFilms(q, token) {
  if (!token) return [];
  const bearer = token.length > 40, init = {headers: bearer ? {Authorization: 'Bearer ' + token, 'User-Agent': UA} : {'User-Agent': UA}};
  const key = bearer ? '' : '&api_key=' + encodeURIComponent(token);
  const find = (s, y) => getJSON('https://api.themoviedb.org/3/search/movie?include_adult=false&query=' + encodeURIComponent(s) + (y ? '&year=' + y : '') + key, init);
  const yq = q.match(/^(.+?)[\s,(]+((?:19|20)\d\d)\)?$/);   // "kids 1995": TMDB finds nothing when the year is in the query
  let r = yq ? await find(yq[1], yq[2]) : await find(q);
  if (yq && !(r.results || []).length) r = await find(yq[1]);
  return Promise.all((r.results || []).slice(0, 5).map(async (m, i) => {
    let creator = '';
    if (i < 3) try { const c = await getJSON(`https://api.themoviedb.org/3/movie/${m.id}/credits?` + key.slice(1), init); creator = ((c.crew || []).find(p => p.job === 'Director') || {}).name || ''; } catch {}
    return {kind: 'movie', title: m.title || '', year: (m.release_date || '').slice(0, 4), creator, cover: m.poster_path ? 'https://image.tmdb.org/t/p/w500' + m.poster_path : ''};
  }));
}
async function olBooks(q) {
  const r = await getJSON('https://openlibrary.org/search.json?limit=5&fields=title,author_name,first_publish_year,publish_year,cover_i&q=' + encodeURIComponent(q), {headers: {'User-Agent': UA}});
  const docs = r.docs || [];
  // Open Library's first year is sometimes a stray record (It Ends With Us: 2012, The Bell Jar: 1948).
  // Wikidata's publication date is right for known books; without it, a lone early year with a gap after it is dropped.
  const years = await Promise.all(docs.map(d => wikidataYear(d.title, (d.author_name || [''])[0]).then(y => y ? String(y) : olYear(d))));
  return docs.map((d, i) => ({kind: 'book', title: d.title || '', year: years[i], creator: (d.author_name || [''])[0], cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : ''}));
}
function olYear(d) {
  const ys = (d.publish_year || []).filter(y => y > 1000).sort((a, b) => a - b), first = d.first_publish_year || ys[0];
  if (!first) return '';
  const next = ys.find(y => y > first);
  return next && next - first > 2 && ys.length > 3 ? '' : String(first);   // unsure: show no year
}
async function wikidataYear(title, author) {
  try {
    const want = words(title).join(' '), last = words(author).slice(-1)[0] || '', init = {headers: {'User-Agent': UA}};
    if (!want || !last) return null;
    const s = await getJSON('https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=' + encodeURIComponent(title), init);
    // same title, and the author's surname in the description ("2016 novel by Colleen Hoover")
    const hit = (s.search || []).find(x => words(x.label).join(' ') === want && words(x.description).includes(last));
    if (!hit) return null;
    const e = (await getJSON(`https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`, init)).entities[hit.id];
    const ys = ((e.claims || {}).P577 || []).map(c => c.mainsnak.datavalue && parseInt(c.mainsnak.datavalue.value.time.slice(1, 5), 10)).filter(y => y > 1000);
    return ys.length ? Math.min(...ys) : null;
  } catch { return null; }
}
async function identify(p, env, cors, ctx) {
  const q = clean(p.get('q'), 120), want = ['movie', 'book'].includes(p.get('want')) ? p.get('want') : 'all';
  if (!q) return json({error: 'Type a title to search.'}, 400, cors);
  const {body, hit} = await cached(env, ctx, `id2:${want}:${q.toLowerCase()}`, MONTH, async () => {
    const [f, b] = await Promise.allSettled([want !== 'book' ? tmdbFilms(q, env.TMDB_TOKEN) : [], want !== 'movie' ? olBooks(q) : []]);
    if (f.status === 'rejected' && b.status === 'rejected') throw new Error('TMDB and Open Library did not answer');
    return {results: [...(f.value || []), ...(b.value || [])]};
  });
  return json(body, 200, cors, {'X-Cache': hit ? 'HIT' : 'MISS'});
}

/* ---------- /scans: DVD / book wraps and single spines from Brave Image Search ---------- */
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
function queryFor(kind, round, title, year, creator) {
  const q = kind === 'movie'
    ? [`"${title}" ${year} dvd cover`, `"${title}" ${year} dvd cover english`, `"${title}" dvd cover scan`, `"${title}" criterion dvd`]
    : [`"${title}" ${creator} book cover spine`, `"${title}" ${creator} book spine`, `"${title}" spine`, `${title} ${creator} full cover wrap`];
  return q[round].replace(/\s+/g, ' ').trim();
}
async function brave(q, key) {
  const r = await fetch('https://api.search.brave.com/res/v1/images/search?count=100&safesearch=strict&q=' + encodeURIComponent(q), {
    headers: {'Accept': 'application/json', 'X-Subscription-Token': key},
  });
  if (!r.ok) throw new Error('Brave answered ' + r.status);
  return (await r.json()).results || [];
}
/* What Brave said for one title and round, kept as it came (trimmed to the fields we use). The key has no
   filter or scoring version in it: when the filters change they run again on this, with no new search. */
const LEGACY = ['sc11', 'sc10', 'sc9', 'sc8', 'sc7', 'sc6'];
const slim = list => list.map(r => ({title: r.title || '', url: r.url || '',
  properties: {url: r.properties && r.properties.url, width: (r.properties && r.properties.width) || 0, height: (r.properties && r.properties.height) || 0},
  thumbnail: r.thumbnail ? {width: r.thumbnail.width || 0, height: r.thumbnail.height || 0} : null}));
async function rawScans(env, ctx, kind, title, year, creator, round, cacheOnly) {
  // book searches don't use the year (and book years get corrected), so a book's key has none
  const key = `raw1:${kind}:${words(title).join(' ')}:${kind === 'book' ? '' : year}:${round}`, keep = n => ({expirationTtl: n ? 365 * DAY : 7 * DAY});
  const hit = await env.SPINE_CACHE.get(key, 'json');
  if (hit) return {list: hit, from: 'raw'};
  // before raw1, only the filtered results were kept (sc6-sc11). They still carry everything the filters read,
  // so they stand in for the raw answer instead of a new search, and are copied to raw1 for next time.
  for (const v of LEGACY) {
    let old = await env.SPINE_CACHE.get(`${v}:${kind}:${title.toLowerCase()}:${year}:${creator.toLowerCase()}:${round}`, 'json');
    if (!old && kind === 'book') {   // stored under whatever year the book had then
      const k = (await env.SPINE_CACHE.list({prefix: `${v}:book:${title.toLowerCase()}:`, limit: 50})).keys.find(x => x.name.endsWith(':' + round));
      if (k) old = await env.SPINE_CACHE.get(k.name, 'json');
    }
    if (!old || !old.results) continue;
    const list = old.results.map(r => ({title: r.title || '', url: r.source || '', properties: {url: r.img, width: r.width || 0, height: r.height || 0}, thumbnail: null}));
    ctx.waitUntil(env.SPINE_CACHE.put(key, JSON.stringify(list), keep(list.length)));
    return {list, from: v};
  }
  if (cacheOnly || !env.BRAVE_API_KEY) return {list: [], from: 'miss'};
  const list = slim(await brave(queryFor(kind, round, title, year, creator), env.BRAVE_API_KEY));
  ctx.waitUntil(env.SPINE_CACHE.put(key, JSON.stringify(list), keep(list.length)));
  return {list, from: 'brave'};
}
async function scans(p, env, cors, ctx) {
  const title = clean(p.get('title'), 120), year = clean(p.get('year'), 4).replace(/\D/g, ''), creator = clean(p.get('creator'), 80);
  const kind = p.get('kind') === 'book' ? 'book' : 'movie', round = Math.max(0, Math.min(ROUNDS - 1, parseInt(p.get('round'), 10) || 0));
  if (!title) return json({error: 'A title is needed.'}, 400, cors);
  const archived = round === 0 ? await archiveFor(env, kind, title, year, creator) : [];
  // cacheonly=1: never search Brave, answer from what's stored (for tests)
  const {list: found, from} = await rawScans(env, ctx, kind, title, year, creator, round, p.get('cacheonly') === '1');
  const body = (() => {
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
      // full-size size when Brave has it, else the thumbnail (same aspect, 500px wide)
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
    return {results: out.slice(0, 10).map(({rank, ...r}) => r)};
  })();
  return json({results: [...archived, ...body.results], round, more: round < ROUNDS - 1}, 200, cors, {'X-Cache': from});
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
  const last = words(creator).slice(-1)[0], out = [];
  for (const m of await store(env).approvedFor(titleKey(kind, title))) {
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
