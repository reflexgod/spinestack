/* What the specs share: the pages, a made-up account and its data, and a network that answers from here.
   Nothing reaches Supabase, the Worker, Google Fonts or jsDelivr, and nothing touches a real account: every request
   to them is answered with the data below (libraries come from tests/node_modules, at the version the page asks for). */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const setting = name => (new RegExp(`window\\.${name}\\s*=\\s*"([^"]*)"`).exec(home) || [])[1] || '';
const SB_URL = setting('SPINESTACK_SUPABASE_URL'), WORKER = setting('SPINESTACK_WORKER'), WORKER_FALLBACK = setting('SPINESTACK_WORKER_FALLBACK');
const SESSION_KEY = `sb-${new URL(SB_URL).hostname.split('.')[0]}-auth-token`;   // where supabase-js keeps the session

/* the pages with the site's top bar. A later stage adds its pages here. */
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'build', path: '/build/' },
  { name: 'feed', path: '/feed/?everyone' },
  { name: 'profile', path: '/u/?mira' },
  { name: 'settings', path: '/settings/' },
];
/* pages without it */
const OTHER_PAGES = [
  { name: 'privacy', path: '/privacy.html' },
  { name: 'admin', path: '/admin.html' },
];

/* ---------- made-up data ---------- */
const ME = { id: '11111111-1111-4111-8111-111111111111', username: 'tester' };
const day = n => new Date(Date.UTC(2026, 8, 30 - n, 12)).toISOString();
const PEOPLE = [
  { id: ME.id, username: 'tester', display_name: 'Test Person', bio: 'A made-up account for the tests.', avatar_key: null, pinned_shelf_id: null, is_private: false, created_at: day(60) },
  { id: '22222222-2222-4222-8222-222222222222', username: 'mira', display_name: 'Mira', bio: 'Films, mostly.', avatar_key: 'avatars/mira', pinned_shelf_id: null, is_private: false, created_at: day(40) },
  { id: '33333333-3333-4333-8333-333333333333', username: 'longusername_twenty1', display_name: '', bio: '', avatar_key: null, pinned_shelf_id: null, is_private: false, created_at: day(20) },
];
const shelfId = i => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`;
const SHELVES = Array.from({ length: 18 }, (_, i) => {
  const owner = PEOPLE[i % PEOPLE.length];
  return { id: shelfId(i), owner: owner.id, caption: i % 4 ? `shelf number ${i}` : 'my next reads.', name: i % 5 ? null : 'a much longer shelf name that has to be cut short',
    filter: 'clean', intensity: 70, background: i % 4 === 3 ? 'ink' : 'paper', wood: false, layout: ['row', 'stack', 'covers'][(i + Math.floor(i / 3)) % 3], varied: true, is_public: true, hidden: false,
    preview_key: `${owner.id}/p/${shelfId(i)}`, pro: {}, created_at: day(i % 6 === 4 ? i + 1 : i), updated_at: day(i), saved_at: day(i), shelf_items: [{ count: 2 }] };   // every sixth was saved again a day after it was made
});
const ITEMS = [
  { position: 0, item_id: 'b0', kind: 'book', title: 'The Waves', author: 'Virginia Woolf', year: 1931, spine_src: null, cover_src: null,
    look: { style: 'solid', font: 'oswald', bg: '#161616', fg: '#F1EEE6', accent: '#EDE7D6', wf: 1, hf: 1, jit: 0 } },
  { position: 1, item_id: 'b1', kind: 'book', title: 'Journey by Moonlight', author: 'Antal Szerb', year: 1937, spine_src: null, cover_src: null,
    look: { style: 'solid', font: 'serif', bg: '#1C1B21', fg: '#E8D23C', accent: '#E8D23C', wf: 1, hf: 1, jit: 0 } },
];
const feedRow = s => { const p = PEOPLE.find(x => x.id === s.owner);
  return { shelf_id: s.id, caption: s.caption, name: s.name, preview_key: s.preview_key, saved_at: s.saved_at, created_at: s.created_at, updated_at: s.updated_at,
    owner: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key, updated: new Date(s.saved_at) - new Date(s.created_at) > 60000 }; };
const card = (p, me) => ({ id: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key, is_private: p.is_private, i_follow: !!me && p.username === 'mira', i_requested: false });

/* ---------- Supabase's REST API, answered from the data above ---------- */
function rest(url, method, body, signedIn, named){
  const what = url.pathname.replace(/^\/rest\/v1\//, ''), q = url.searchParams, eq = k => (q.get(k) || '').replace(/^eq\./, '');
  if (what === 'rpc/feed'){
    const rows = SHELVES.filter(s => body.scope !== 'following' || (signedIn && PEOPLE.find(p => p.id === s.owner).username === 'mira')).map(feedRow);
    const from = body.before_id ? rows.findIndex(r => r.shelf_id === body.before_id) + 1 : 0;
    return rows.slice(from, from + (body.n || 20));
  }
  if (what === 'rpc/profile_stats') return [{ shelf_count: SHELVES.filter(s => s.owner === body.uid).length, spine_count: 12 }];
  if (what === 'rpc/follow_stats') return [{ following: 1, followers: 2 }];
  if (what === 'rpc/profile_card') return PEOPLE.filter(p => p.username === body.p_username).map(p => card(p, signedIn));
  if (what === 'rpc/find_people') return PEOPLE.filter(p => p.username.startsWith(String(body.q || '').toLowerCase())).map(p => card(p, signedIn));
  if (what === 'rpc/follow_list') return PEOPLE.filter(p => p.id !== body.uid).map(p => card(p, signedIn));
  if (what === 'rpc/follow') return 'following';
  if (what === 'rpc/unfollow') return 'none';
  if (what === 'rpc/username_available') return true;
  if (what === 'rpc/am_i_pro') return false;
  if (what === 'rpc/save_shelf') return body.shelf.id;
  if (what.startsWith('rpc/')) return [];
  // a change to a profile answers with the row as it would be then (nothing here is kept)
  if (what === 'profiles' && method === 'PATCH') return PEOPLE.filter(p => p.id === eq('id')).map(p => ({ ...p, ...body }));
  if (what === 'profiles') return PEOPLE.filter(p => (named || p.id !== ME.id) && (!q.has('id') || p.id === eq('id')) && (!q.has('username') || p.username === eq('username')));
  if (what === 'shelves'){
    const ids = (q.get('id') || '').startsWith('in.(') ? q.get('id').slice(4, -1).split(',') : q.has('id') ? [eq('id')] : null;   // id=eq.x or id=in.(x,y)
    return SHELVES.filter(s => (!q.has('owner') || s.owner === eq('owner')) && (!ids || ids.includes(s.id)));
  }
  if (what === 'shelf_items') return ITEMS;
  return method === 'GET' ? [] : null;
}

// a PNG made here: w x h, each pixel's [r, g, b] from paint(x, y)
function png(w, h, paint){
  const zlib = require('zlib'), row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ const o = y * row + 1 + x * 3, c = paint(x, y); raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; }
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(zlib.crc32(body)); return Buffer.concat([len, body, crc]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// a picture for most images the Worker would send (photos, covers): 200 x 300, no plain background
const PICTURE = png(200, 300, (x, y) => [40 + (y >> 2), 60, 90 + (x >> 2)]);
/* A shelf's preview: its story at 360 x 640, in flat shapes. A plain background (white, or the Ink theme's), a bar
   where the caption is, a bar where "made with shelfstackd" is, and a block where the books are for the shelf's layout
   (STORY: x0, y0, x1, y1 in the picture, as shelf.js places them). cards.js cuts each card round that block. */
const STORY = { row: [30, 180, 330, 567], stack: [47, 500, 313, 567], covers: [30, 133, 330, 593] };
const CAPTION = [30, 83, 150, 100], MADE_WITH = [130, 617, 230, 624];
const stories = new Map();
function storyPicture(layout, dark){
  const key = layout + (dark ? ' dark' : '');
  if (!stories.has(key)){
    const bg = dark ? [14, 15, 18] : [255, 255, 255], ink = dark ? [241, 242, 244] : [15, 20, 25], grey = dark ? [100, 101, 104] : [160, 162, 164], inside = (x, y, b) => x >= b[0] && x < b[2] && y >= b[1] && y < b[3];
    stories.set(key, png(360, 640, (x, y) => inside(x, y, STORY[layout]) ? [36, 69, 107] : inside(x, y, CAPTION) ? ink : inside(x, y, MADE_WITH) ? grey : bg));
  }
  return stories.get(key);
}
// what the Worker's /identify knows: a search finds the ones whose title or maker has what was typed, films first
// and then books, each in this order (so the page's own ordering, closest title first, has something to do)
const MATCHES = [
  { kind: 'movie', title: 'Gummo', year: '1997', creator: 'Harmony Korine', cover: 'https://image.tmdb.org/t/p/w500/gummo.jpg' },
  { kind: 'movie', title: 'Waves', year: '2019', creator: 'Trey Edward Shults', cover: 'https://image.tmdb.org/t/p/w500/waves.jpg' },
  { kind: 'movie', title: 'Spy Kids', year: '2001', creator: 'Robert Rodriguez', cover: 'https://image.tmdb.org/t/p/w500/spykids.jpg' },
  { kind: 'movie', title: 'Kids in America', year: '2005', creator: 'Josh Stolberg', cover: 'https://image.tmdb.org/t/p/w500/kia.jpg' },
  { kind: 'movie', title: 'Kids', year: '1995', creator: 'Larry Clark', cover: 'https://image.tmdb.org/t/p/w500/kids.jpg' },
  { kind: 'movie', title: 'The Kids Are All Right', year: '2010', creator: 'Lisa Cholodenko', cover: 'https://image.tmdb.org/t/p/w500/tkaar.jpg' },
  { kind: 'movie', title: 'Honey, I Shrunk the Kids', year: '1989', creator: 'Joe Johnston', cover: 'https://image.tmdb.org/t/p/w500/hisk.jpg' },
  { kind: 'book', title: 'The Waves', year: '1931', creator: 'Virginia Woolf', cover: 'https://covers.openlibrary.org/b/id/1-L.jpg' },
  { kind: 'book', title: 'Just Kids', year: '2010', creator: 'Patti Smith', cover: 'https://covers.openlibrary.org/b/id/2-L.jpg' },
  { kind: 'book', title: 'Kids', year: '2021', creator: 'Michael Chabon', cover: 'https://covers.openlibrary.org/b/id/3-L.jpg' },
];
const plain = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

/* Answers everything that isn't the site itself. Returns {unknown}: requests nothing here knew how to answer. */
/* signedIn: a session for the made-up account; named: false leaves that account without a username yet;
   slow: how long /identify takes to answer, in ms; capped: the Worker's Brave searches for today are used up;
   realFonts: the fonts come from Google Fonts as they do on the site (for screenshots; the tests go without).
   Returns {unknown, asked}: requests nothing here could answer, and every search /identify was asked for. */
async function mockNetwork(page, { signedIn = false, named = true, slow = 0, capped = false, realFonts = false } = {}){
  const unknown = [], asked = [];
  if (signedIn){
    const exp = Math.floor(Date.now() / 1000) + 3600, b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME.id, role: 'authenticated', aud: 'authenticated', exp })}.test`;
    const session = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'test-refresh',
      user: { id: ME.id, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com', app_metadata: { provider: 'google' }, user_metadata: { name: 'Test Person' }, created_at: day(60) } };
    // once per tab, so a page that signs out stays signed out when it loads again
    await page.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('test-signed-in')){ sessionStorage.setItem('test-signed-in', '1'); localStorage.setItem(k, v); } } catch {} },
      [SESSION_KEY, JSON.stringify(session)]);
  }
  await page.route(u => !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u.href), async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.origin === SB_URL && url.pathname.startsWith('/rest/v1/')){
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {}
      let data = rest(url, method, body, signedIn, named);
      if (/vnd\.pgrst\.object/.test(req.headers().accept || '')) data = Array.isArray(data) ? data[0] || null : data;   // .single()
      return route.fulfill({ status: data === null ? 204 : 200, headers: CORS, contentType: 'application/json', body: data === null ? '' : JSON.stringify(data) });
    }
    if (url.origin === SB_URL) return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{}' });   // auth
    if (url.origin === WORKER || url.origin === WORKER_FALLBACK){
      const json = o => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(o) });
      if (method === 'POST') return json({ key: `${ME.id}/${url.pathname.replace(/\W+/g, '-')}` });   // something saved: the key it's kept under
      if (url.pathname === '/u/preview'){   // a shelf's preview: its story
        const shelf = SHELVES.find(x => x.preview_key === url.searchParams.get('k'));
        return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: storyPicture(shelf ? shelf.layout : 'row', !!shelf && shelf.background === 'ink') });
      }
      if (/^\/(u\/blob|m\/img|archive\/img|img)$/.test(url.pathname)) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PICTURE });
      if (url.pathname === '/identify'){
        const want = url.searchParams.get('want') || 'all', q = plain(url.searchParams.get('q'));
        asked.push(url.searchParams.get('q') + (url.searchParams.get('suggest') ? ' (typed)' : ''));
        if (slow) await new Promise(r => setTimeout(r, slow));
        return json({ results: MATCHES.filter(m => (want === 'all' || m.kind === want) && q && (plain(m.title).includes(q) || plain(m.creator).includes(q))) });
      }
      // /scans: no scans of anything, so a spine is made from the cover; capped says why there are none today
      return json(capped ? { results: [], round: +url.searchParams.get('round') || 0, more: true, capped: true } : { results: [], more: false });
    }
    if (realFonts && /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    // a library from jsDelivr: the same file from tests/node_modules, when that's the version the page asks for
    const lib = /^\/npm\/((?:@[^/]+\/)?[^/@]+)@([^/]+)\/(.+)$/.exec(url.hostname === 'cdn.jsdelivr.net' ? url.pathname : '');
    if (lib){
      const dir = path.join(__dirname, 'node_modules', lib[1]);
      try {
        if (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version === lib[2])
          return route.fulfill({ status: 200, headers: CORS, contentType: lib[3].endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.join(dir, lib[3])) });
      } catch {}
    }
    unknown.push(`${method} ${url.href}`);
    return route.fulfill({ status: 404, headers: CORS, contentType: 'text/plain', body: 'not mocked' });
  });
  return { unknown, asked };
}

/* what a page says is wrong while it runs: console errors and uncaught exceptions */
function watchErrors(page){
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  return errors;
}

/* open a page and wait until it has finished asking for things */
async function open(page, pathname){
  await page.goto(pathname);
  await page.waitForLoadState('networkidle');
}

module.exports = { ROOT, PAGES, OTHER_PAGES, ME, PEOPLE, SHELVES, PICTURE, STORY, CAPTION, MADE_WITH, CORS, WORKER, storyPicture, mockNetwork, watchErrors, open };
