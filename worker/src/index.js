/* Spinestack Worker: film/book lookup, DVD/book scan search and a CORS image proxy for the
   GitHub Pages site. Keys live in Worker secrets (TMDB_TOKEN, BRAVE_API_KEY), never in the page.

   GET /identify?q=&want=all|movie|book  -> {results:[{kind,title,year,creator,cover}]}
   GET /scans?title=&year=&kind=movie|book&creator=  -> {results:[{img,source,width,height}]}
   GET /img?url=  -> the image, with CORS
*/

const ORIGINS = ['https://reflexgod.github.io', 'http://localhost:8080'];
const DAY = 86400, MONTH = 30 * DAY;
const MAX_IMG = 8 * 1024 * 1024;
const UA = 'Spinestack/1.0 (+https://reflexgod.github.io/spinestack/)';

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const cors = ORIGINS.includes(origin) ? {'Access-Control-Allow-Origin': origin, 'Vary': 'Origin'} : {'Vary': 'Origin'};
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400'}});
    if (req.method !== 'GET') return json({error: 'Only GET is allowed.'}, 405, cors);

    const url = new URL(req.url), p = url.searchParams, ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    try {
      if (url.pathname === '/img') {
        if (!(await allowed(env.IMG_LIMITER, ip))) return json({error: 'Too many images at once. Wait a minute and try again.'}, 429, cors);
        return await image(p.get('url') || '', cors, ctx);
      }
      if (url.pathname === '/identify' || url.pathname === '/scans') {
        if (!(await allowed(env.LIMITER, ip))) return json({error: 'Too many searches. Wait a minute and try again.'}, 429, cors);
        return url.pathname === '/identify' ? await identify(p, env, cors, ctx) : await scans(p, env, cors, ctx);
      }
      if (url.pathname === '/' || url.pathname === '/health') return json({ok: true, tmdb: !!env.TMDB_TOKEN, brave: !!env.BRAVE_API_KEY}, 200, cors);
      return json({error: 'Not found.'}, 404, cors);
    } catch (e) {
      return json({error: 'Something went wrong. Try again in a moment.', detail: String(e && e.message || e).slice(0, 200)}, 502, cors);
    }
  },
};

const json = (body, status, cors, extra = {}) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra}});
async function allowed(limiter, ip) {
  if (!limiter) return true;   // binding not configured: no limit
  try { return (await limiter.limit({key: ip})).success; } catch { return true; }
}
const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

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
  const r = await getJSON('https://openlibrary.org/search.json?limit=5&fields=title,author_name,first_publish_year,cover_i&q=' + encodeURIComponent(q), {headers: {'User-Agent': UA}});
  return (r.docs || []).map(d => ({kind: 'book', title: d.title || '', year: String(d.first_publish_year || ''), creator: (d.author_name || [''])[0], cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : ''}));
}
async function identify(p, env, cors, ctx) {
  const q = clean(p.get('q'), 120), want = ['movie', 'book'].includes(p.get('want')) ? p.get('want') : 'all';
  if (!q) return json({error: 'Type a title to search.'}, 400, cors);
  const {body, hit} = await cached(env, ctx, `id1:${want}:${q.toLowerCase()}`, MONTH, async () => {
    const [f, b] = await Promise.allSettled([want !== 'book' ? tmdbFilms(q, env.TMDB_TOKEN) : [], want !== 'movie' ? olBooks(q) : []]);
    if (f.status === 'rejected' && b.status === 'rejected') throw new Error('TMDB and Open Library did not answer');
    return {results: [...(f.value || []), ...(b.value || [])]};
  });
  return json(body, 200, cors, {'X-Cache': hit ? 'HIT' : 'MISS'});
}

/* ---------- /scans: full DVD / book wraps from Brave Image Search ---------- */
const SCAN_SITES = /covercity|dvd-covers|dvdcover|cdcovers|covercentury|freecovers|coverlib|cover-?addict/i;
const words = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
const decode = u => { try { return decodeURIComponent(u.replace(/\+/g, ' ')); } catch { return u; } };
async function brave(q, key) {
  const r = await fetch('https://api.search.brave.com/res/v1/images/search?count=50&safesearch=strict&q=' + encodeURIComponent(q), {
    headers: {'Accept': 'application/json', 'X-Subscription-Token': key},
  });
  if (!r.ok) throw new Error('Brave answered ' + r.status);
  return (await r.json()).results || [];
}
async function scans(p, env, cors, ctx) {
  const title = clean(p.get('title'), 120), year = clean(p.get('year'), 4).replace(/\D/g, ''), creator = clean(p.get('creator'), 80);
  const kind = p.get('kind') === 'book' ? 'book' : 'movie';
  if (!title) return json({error: 'A title is needed.'}, 400, cors);
  if (!env.BRAVE_API_KEY) return json({error: 'Scan search is not set up yet.'}, 503, cors);
  const {body, hit} = await cached(env, ctx, `sc5:${kind}:${title.toLowerCase()}:${year}:${creator.toLowerCase()}`, MONTH, async () => {
    const queries = kind === 'movie'
      ? [`"${title}" ${year} dvd cover`.replace(/\s+/g, ' '), `${title} dvd cover scan`]
      : [`"${title}" ${creator} book cover spine`.replace(/\s+/g, ' '), `${title} ${creator} full cover wrap`.replace(/\s+/g, ' ')];
    const [lo, hi] = kind === 'movie' ? [1.3, 1.8] : [1.2, 2.4];
    const lists = await Promise.allSettled(queries.map(q => brave(q, env.BRAVE_API_KEY)));
    if (lists.every(l => l.status === 'rejected')) throw new Error(lists[0].reason.message);
    // the whole title, words in order, must appear in the result's title or addresses:
    // this drops look-alikes such as "Texas - Paris" for Paris, Texas or other films on the same page
    const phrase = words(title), extra = [year, ...words(creator).slice(-1)].filter(Boolean);
    const seen = new Set(), out = [];
    for (const l of lists) for (const r of (l.value || [])) {
      const img = r.properties && r.properties.url;
      if (!img || !/^https?:/i.test(img)) continue;
      const id = img.replace(/\/s-l\d+\./, '/s-l.');   // eBay serves one photo at many sizes
      if (seen.has(id)) continue;
      seen.add(id);
      // full-size size when Brave has it, else the thumbnail (same aspect, 500px wide)
      const w = r.properties.width || (r.thumbnail && r.thumbnail.width) || 0, h = r.properties.height || (r.thumbnail && r.thumbnail.height) || 0;
      if (!w || !h || w / h < lo || w / h > hi || (r.properties.width && r.properties.width < 400)) continue;
      const text = ' ' + words([r.title, decode(r.url || ''), decode(img)].join(' ')).join(' ') + ' ';
      if (!text.includes(' ' + phrase.join(' ') + ' ')) continue;
      const hits = extra.filter(x => text.includes(' ' + x + ' ')).length;
      if (phrase.length === 1 && extra.length && !hits) continue;   // "Kids" alone also matches "Spy Kids": want the year or director too
      const rank = (SCAN_SITES.test(r.url || img) ? 2 : 0) + hits + (/\bscan|cover/.test(text) ? 1 : 0);
      out.push({img, source: r.url || img, title: clean(r.title, 120), width: r.properties.width || w, height: r.properties.height || h, rank});
    }
    out.sort((a, b) => b.rank - a.rank);
    return {results: out.slice(0, 10).map(({rank, ...r}) => r)};
  });
  return json(body, 200, cors, {'X-Cache': hit ? 'HIT' : 'MISS'});
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
    // read with a hard cap, since Content-Length can be missing
    const reader = r.body.getReader(), parts = []; let size = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMG) { reader.cancel(); return json({error: 'That image is larger than 8 MB.'}, 413, cors); }
      parts.push(value);
    }
    if (!size) return json({error: 'The image host sent an empty file.'}, 502, cors);
    const buf = new Uint8Array(size); let o = 0; for (const part of parts) { buf.set(part, o); o += part.byteLength; }
    res = new Response(buf, {headers: {'Content-Type': type, 'Cache-Control': `public, max-age=${MONTH}, immutable`, 'X-Content-Type-Options': 'nosniff'}});
    ctx.waitUntil(cache.put(ckey, res.clone()));
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}
