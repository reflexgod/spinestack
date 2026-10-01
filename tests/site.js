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
    filter: 'clean', intensity: 70, background: 'paper', wood: false, layout: 'row', varied: true, is_public: true, hidden: false,
    preview_key: `${owner.id}/p/${shelfId(i)}`, pro: {}, created_at: day(i + 1), updated_at: day(i), saved_at: day(i), shelf_items: [{ count: 2 }] };
});
const ITEMS = [
  { position: 0, item_id: 'b0', kind: 'book', title: 'The Waves', author: 'Virginia Woolf', year: 1931, spine_src: null, cover_src: null,
    look: { style: 'solid', font: 'oswald', bg: '#161616', fg: '#F1EEE6', accent: '#EDE7D6', wf: 1, hf: 1, jit: 0 } },
  { position: 1, item_id: 'b1', kind: 'book', title: 'Journey by Moonlight', author: 'Antal Szerb', year: 1937, spine_src: null, cover_src: null,
    look: { style: 'solid', font: 'serif', bg: '#1C1B21', fg: '#E8D23C', accent: '#E8D23C', wf: 1, hf: 1, jit: 0 } },
];
const feedRow = s => { const p = PEOPLE.find(x => x.id === s.owner);
  return { shelf_id: s.id, caption: s.caption, name: s.name, preview_key: s.preview_key, saved_at: s.saved_at, created_at: s.created_at, updated_at: s.updated_at,
    owner: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key, updated: false }; };
const card = (p, me) => ({ id: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key, is_private: p.is_private, i_follow: !!me && p.username === 'mira', i_requested: false });

/* ---------- Supabase's REST API, answered from the data above ---------- */
function rest(url, method, body, signedIn){
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
  if (what.startsWith('rpc/')) return [];
  if (what === 'profiles') return PEOPLE.filter(p => (!q.has('id') || p.id === eq('id')) && (!q.has('username') || p.username === eq('username')));
  if (what === 'shelves') return SHELVES.filter(s => (!q.has('owner') || s.owner === eq('owner')) && (!q.has('id') || s.id === eq('id')));
  if (what === 'shelf_items') return ITEMS;
  return method === 'GET' ? [] : null;
}

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

/* Answers everything that isn't the site itself. Returns {unknown}: requests nothing here knew how to answer. */
async function mockNetwork(page, { signedIn = false } = {}){
  const unknown = [];
  if (signedIn){
    const exp = Math.floor(Date.now() / 1000) + 3600, b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME.id, role: 'authenticated', aud: 'authenticated', exp })}.test`;
    const session = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'test-refresh',
      user: { id: ME.id, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com', app_metadata: { provider: 'google' }, user_metadata: { name: 'Test Person' }, created_at: day(60) } };
    await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [SESSION_KEY, JSON.stringify(session)]);
  }
  await page.route(u => !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u.href), async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.origin === SB_URL && url.pathname.startsWith('/rest/v1/')){
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {}
      let data = rest(url, method, body, signedIn);
      if (/vnd\.pgrst\.object/.test(req.headers().accept || '')) data = Array.isArray(data) ? data[0] || null : data;   // .single()
      return route.fulfill({ status: data === null ? 204 : 200, headers: CORS, contentType: 'application/json', body: data === null ? '' : JSON.stringify(data) });
    }
    if (url.origin === SB_URL) return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{}' });   // auth
    if (url.origin === WORKER || url.origin === WORKER_FALLBACK){
      if (/^\/(u\/preview|u\/blob|m\/img|archive\/img|img)$/.test(url.pathname)) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PIXEL });
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
    }
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
  return { unknown };
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

module.exports = { ROOT, PAGES, OTHER_PAGES, ME, PEOPLE, SHELVES, mockNetwork, watchErrors, open };
