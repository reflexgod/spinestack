/* What the specs share: the pages, a made-up account and its data, and a network that answers from here.
   Nothing reaches Supabase, the Worker, Google Fonts or jsDelivr, and nothing touches a real account: every request
   to them is answered with the data below (libraries come from tests/node_modules, at the version the page asks for). */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const setting = name => (new RegExp(`window\\.${name}\\s*=\\s*"([^"]*)"`).exec(home) || [])[1] || '';
const SB_URL = setting('SPINESTACK_SUPABASE_URL'), WORKER = setting('SPINESTACK_WORKER'), WORKER_FALLBACK = setting('SPINESTACK_WORKER_FALLBACK');
const SESSION_KEY = `sb-${new URL(SB_URL).hostname.split('.')[0]}-auth-token`;   // where supabase-js keeps the session

/* the pages with the site's top bar */
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'build', path: '/build/' },
  { name: 'feed', path: '/feed/?everyone' },
  { name: 'profile', path: '/u/?mira' },
  { name: 'settings', path: '/settings/' },
  { name: 'shelves', path: '/shelves/' },
  { name: 'people', path: '/people/' },
  { name: 'post', path: '/p/?bbbbbbbb-bbbb-4bbb-8bbb-000000000000' },   // @mira's Gummo
  { name: 'notifications', path: '/notifications/' },
  { name: 'title', path: '/t/?film=106&title=Gummo&year=1997' },   // Gummo, at the address it takes
];
/* pages without it */
const OTHER_PAGES = [
  { name: 'privacy', path: '/privacy.html' },
  { name: 'admin', path: '/admin.html' },
  { name: 'not found', path: '/404.html' },
];

/* ---------- made-up data ---------- */
const ME = { id: '11111111-1111-4111-8111-111111111111', username: 'tester' };
const day = n => new Date(Date.UTC(2026, 8, 30 - n, 12)).toISOString();
const PEOPLE = [
  // its main shelf is pinned to its newest (SHELVES[0]): with none pinned it would be its oldest
  { id: ME.id, username: 'tester', display_name: 'Test Person', bio: 'A made-up account for the tests.', avatar_key: null, pinned_shelf_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000000', is_private: false, created_at: day(60) },
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
/* what's on each shelf, for a page that reads several shelves' spines at once (home's cards: shelf_items with
   shelf_id=in.(…)). Drawn spines, no pictures, from 1 to 8 a shelf, so a shelf draws with nothing to load. A shelf's
   own page (shelf_id=eq.…) gets ITEMS, as before */
const TITLES = [['movie', 'Gummo', 'Harmony Korine', 1997], ['book', 'The Waves', 'Virginia Woolf', 1931], ['movie', 'Paris, Texas', 'Wim Wenders', 1984], ['book', 'Just Kids', 'Patti Smith', 2010],
  ['movie', 'Stalker', 'Andrei Tarkovsky', 1979], ['book', 'Orlando', 'Virginia Woolf', 1928], ['movie', 'Kids', 'Larry Clark', 1995], ['book', 'Delta of Venus', 'Anaïs Nin', 1977],
  ['movie', 'Chungking Express', 'Wong Kar-wai', 1994], ['book', 'Journey by Moonlight', 'Antal Szerb', 1937], ['movie', 'Beau Travail', 'Claire Denis', 1999], ['book', 'Bluets', 'Maggie Nelson', 2009],
  ['movie', 'Mulholland Drive', 'David Lynch', 2001], ['book', 'Giovanni’s Room', 'James Baldwin', 1956]];
const LOOKS = [['solid', 'oswald', '#161616', '#F1EEE6'], ['classic', 'serif', '#EFE7D6', '#3B2E25'], ['dvd', 'oswald', '#1C1B21', '#E8D23C'], ['solid', 'black', '#24456B', '#F3E9D2'],
  ['classic', 'oswald', '#7A1F1F', '#F5E6C8'], ['solid', 'serif', '#F2B6C5', '#1F2E26'], ['dvd', 'mono', '#E8E4DA', '#202020'], ['classic', 'mono', '#2F4A3A', '#EDE3C8']];
const COUNTS = [5, 3, 8, 2, 6, 4, 1, 7, 3, 5, 6, 2];
const itemsOf = (id, n, at) => Array.from({ length: n }, (_, i) => { const [kind, title, author, year] = TITLES[(at * 5 + i) % TITLES.length], [style, font, bg, fg] = LOOKS[(at * 3 + i) % LOOKS.length];
  return { shelf_id: id, position: i, item_id: `i${at}x${i}`, kind, title, author, year, spine_src: null, cover_src: null,
    look: { style, font, bg, fg, accent: fg, studio: kind === 'movie' ? 'Criterion' : '', wf: .86 + ((i * 37 + at * 11) % 32) / 100, hf: .9 + ((i * 53 + at * 7) % 12) / 100, jit: 0 } }; });
const feedRow = s => { const p = [...PEOPLE, ...FRIENDS].find(x => x.id === s.owner);
  return { shelf_id: s.id, caption: s.caption, name: s.name, preview_key: s.preview_key, saved_at: s.saved_at, created_at: s.created_at, updated_at: s.updated_at,
    owner: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key, updated: new Date(s.saved_at) - new Date(s.created_at) > 60000 }; };
const card = (p, me) => ({ id: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key, is_private: p.is_private, i_follow: !!me && p.username === 'mira', i_requested: false });

/* logs, the watchlist and From friends: the tables supabase/migrations/0007_logs_watchlist.sql makes. Mira's logs are what
   the people the made-up account follows logged lately; the made-up account has one of its own. Times are from the
   newest shelf's (day(0), 30 September at noon UTC). */
const at = (days, hours = 0) => new Date(Date.UTC(2026, 8, 30, 12) - days * 864e5 + hours * 36e5).toISOString();
const logId = i => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, '0')}`, watchId = i => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`;
const LOGS = [
  { id: logId(0), owner: PEOPLE[1].id, kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg', caption: 'The bathtub scene. Still thinking about it.', created_at: at(0, 1) },
  { id: logId(1), owner: ME.id, kind: 'book', title: 'Just Kids', author: 'Patti Smith', year: 2010, cover_src: 'url:https://covers.openlibrary.org/b/id/2-L.jpg', caption: 'For the train.', created_at: at(3, 1) },
  { id: logId(2), owner: PEOPLE[1].id, kind: 'book', title: 'The Waves', author: 'Virginia Woolf', year: 1931, cover_src: 'url:https://covers.openlibrary.org/b/id/1-L.jpg', caption: '', created_at: at(7, 1) },
  { id: logId(3), owner: PEOPLE[2].id, kind: 'movie', title: 'Kids', author: 'Larry Clark', year: 1995, cover_src: null, caption: '', created_at: at(30, 1) },
];
const WATCHLIST = [
  { id: watchId(0), owner: ME.id, kind: 'movie', title: 'Paris, Texas', author: 'Wim Wenders', year: 1984, cover_src: 'url:https://image.tmdb.org/t/p/w500/paris.jpg', from_user: null, created_at: at(2) },
  { id: watchId(1), owner: ME.id, kind: 'book', title: 'Orlando', author: 'Virginia Woolf', year: 1928, cover_src: null, from_user: PEOPLE[1].id, created_at: at(5) },
  { id: watchId(2), owner: PEOPLE[1].id, kind: 'movie', title: 'Stalker', author: 'Andrei Tarkovsky', year: 1979, cover_src: 'url:https://image.tmdb.org/t/p/w500/stalker.jpg', from_user: null, created_at: at(4) },
];
/* five more people the made-up account follows (mockNetwork's friends: true), for home's row of cards: each has done
   something lately, a shelf saved or a film or book logged, and Kit an older log too. Only activity() and feed() for
   the people you follow, and the shelves and their spines read by id, know them */
const friendId = i => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
const FRIENDS = [['ola', 'Ola'], ['june_reads', 'June'], ['tomasz', 'Tomasz'], ['bea', ''], ['kit', 'Kit']].map(([username, display_name], i) =>
  ({ id: friendId(i), username, display_name, bio: '', avatar_key: i % 2 ? `avatars/${username}` : null, pinned_shelf_id: null, is_private: false, created_at: day(90) }));
const FRIEND_SHELVES = [[1, 'stack', 2], [3, 'covers', 6], [4, 'row', 9]].map(([who, layout, days], i) => { const id = `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, '0')}`, o = FRIENDS[who];
  return { id, owner: o.id, caption: ['june’s pile', 'faces out', 'a row of films'][i], name: null, filter: 'clean', intensity: 70, background: 'paper', wood: false, layout, varied: true, is_public: true, hidden: false,
    preview_key: `${o.id}/p/${id}`, pro: {}, created_at: at(days, -2), updated_at: at(days, -2), saved_at: at(days, -2), shelf_items: [{ count: 4 }] }; });
const FRIEND_LOGS = [[0, 'book', 'Orlando', 'Virginia Woolf', 1928, 'url:https://covers.openlibrary.org/b/id/4-L.jpg', 1], [2, 'movie', 'Stalker', 'Andrei Tarkovsky', 1979, 'url:https://image.tmdb.org/t/p/w500/stalker.jpg', 5],
  [4, 'movie', 'Paris, Texas', 'Wim Wenders', 1984, null, 20]].map(([who, kind, title, author, year, cover_src, days], i) =>
  ({ id: `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, '0')}`, owner: FRIENDS[who].id, kind, title, author, year, cover_src, caption: 'A caption that home doesn’t show.', created_at: at(days, -1) }));
const ITEMS_BY_SHELF = new Map([...SHELVES.map((s, i) => [s.id, itemsOf(s.id, COUNTS[i % COUNTS.length], i)]), ...FRIEND_SHELVES.map((s, i) => [s.id, itemsOf(s.id, [4, 6, 5][i], 20 + i)])]);
// @mira's newest shelf (SHELVES[1]) had its last two spines added ten minutes before it was saved (look.at, seconds,
// as the builder marks a spine when it's first saved): the feed says "@mira added 2 to their shelf"
for (const r of ITEMS_BY_SHELF.get(SHELVES[1].id).slice(-2)) r.look = { ...r.look, at: Math.floor(new Date(SHELVES[1].saved_at).getTime() / 1000) - 600 };
const keyOf = l => `${l.kind}:${l.title.toLowerCase()}:${l.year || ''}`;
const FROM_FRIENDS = LOGS.filter(l => l.owner === PEOPLE[1].id).map(l => ({ item_key: keyOf(l), kind: l.kind, title: l.title, author: l.author, year: l.year, cover_src: l.cover_src,
  log_id: l.id, logged_at: l.created_at, from_id: PEOPLE[1].id, from_username: 'mira', from_display_name: 'Mira' }));
// the feed's rows as activity() gives them: shelves saved and logs, newest first
const shelfRow = s => { const f = feedRow(s); return { what: 'shelf', id: s.id, at: s.saved_at, owner: f.owner, username: f.username, display_name: f.display_name, avatar_key: f.avatar_key,
  caption: s.caption, name: s.name, preview_key: s.preview_key, created_at: s.created_at, updated_at: s.updated_at, updated: f.updated, is_public: s.is_public }; };
const logRow = l => { const p = [...PEOPLE, ...FRIENDS].find(x => x.id === l.owner);
  return { what: 'log', id: l.id, at: l.created_at, owner: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key, caption: l.caption,
    name: null, preview_key: null, created_at: l.created_at, updated_at: l.created_at, updated: false, is_public: true, kind: l.kind, title: l.title, author: l.author, year: l.year, cover_src: l.cover_src }; };
// what PostgREST says for a table or a function that isn't in the database (one without 0007)
const NOT_THERE = { __status: 404, body: { code: 'PGRST202', message: 'Could not find the function in the schema cache', details: null, hint: null } };
const NO_TABLE = { __status: 404, body: { code: 'PGRST205', message: 'Could not find the table in the schema cache', details: null, hint: null } };

/* migration 0009 (supabase/migrations/0009_social.sql), with mockNetwork's social: true: likes, replies, notifications, and
   what post_stats() says for each log. Mira's Gummo has likes, replies and a me-too; the made-up account liked it */
const NEW_LOG = 'ffffffff-ffff-4fff-8fff-000000000001';   // the id a log posted here gets
const STATS = { [logId(0)]: { rating: 9, review: 'The bathtub scene. Still thinking about it.', spoiler: false, rewatch: true, watched_on: '2026-09-30', metoo_of: null, likes: 3, replies: 2, metoos: 1, liked: true, logged: false },
  [logId(1)]: { rating: null, review: 'For the train.', spoiler: false, rewatch: false, watched_on: '2026-09-27', metoo_of: null, likes: 0, replies: 0, metoos: 0, liked: false, logged: false },
  [logId(2)]: { rating: 7, review: 'The last page. Don’t read this before you get there.', spoiler: true, rewatch: false, watched_on: '2026-09-23', metoo_of: null, likes: 1, replies: 0, metoos: 0, liked: false, logged: true },
  [logId(3)]: { rating: null, review: '', spoiler: false, rewatch: false, watched_on: '2026-08-31', metoo_of: null, likes: 0, replies: 0, metoos: 0, liked: false, logged: false } };
const REPLIES = [
  { id: 'abababab-abab-4bab-8bab-000000000001', log: logId(0), created_at: at(0, 2), text: 'The rabbit boy on the roof.', owner: PEOPLE[2].id },
  { id: 'abababab-abab-4bab-8bab-000000000002', log: logId(0), created_at: at(0, 3), text: 'Seen it twice.', owner: ME.id },
];
const replyRow = r => { const p = PEOPLE.find(x => x.id === r.owner); return { id: r.id, created_at: r.created_at, text: r.text, owner: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key }; };
const NOTES = [
  { id: 'acacacac-acac-4cac-8cac-000000000001', kind: 'like', created_at: at(0, -1), read: false, actor: PEOPLE[1].id, log: logId(1) },
  { id: 'acacacac-acac-4cac-8cac-000000000002', kind: 'like', created_at: at(0, -2), read: false, actor: PEOPLE[2].id, log: logId(1) },
  { id: 'acacacac-acac-4cac-8cac-000000000003', kind: 'reply', created_at: at(0, -3), read: false, actor: PEOPLE[1].id, log: logId(1), reply_text: 'Which train?' },
  { id: 'acacacac-acac-4cac-8cac-000000000004', kind: 'follow', created_at: at(1), read: true, actor: PEOPLE[2].id, log: null },
  { id: 'acacacac-acac-4cac-8cac-000000000005', kind: 'metoo', created_at: at(2), read: true, actor: PEOPLE[1].id, log: logId(1) },
];
/* migration 0010 (supabase/migrations/0010_recs.sql), with mockNetwork's recs: true: who you can recommend to (@mira, and
   @longusername_twenty1 with 6 waiting), two recs for you from @mira (Paris, Texas with a note and a thread; Orlando,
   kept), four you sent, the counts, a rec in the feed, and its notifications */
const recId = i => `cdcdcdcd-cdcd-4dcd-8dcd-${String(i).padStart(12, '0')}`;
const MUTUALS = [{ id: PEOPLE[1].id, username: 'mira', display_name: 'Mira', avatar_key: 'avatars/mira', waiting: 0 },
  { id: PEOPLE[2].id, username: 'longusername_twenty1', display_name: '', avatar_key: null, waiting: 6 }];
const recRow = (i, other, x) => ({ id: recId(i), created_at: at(i), note: '', in_feed: true, author: '', year: null, cover_src: null, log: null, replies: 0,
  other: other.id, username: other.username, display_name: other.display_name, avatar_key: other.avatar_key, ...x });
const RECS_FOR = [
  recRow(1, PEOPLE[1], { status: 'open', note: 'Watch it on a big screen.', kind: 'movie', title: 'Paris, Texas', author: 'Wim Wenders', year: 1984, cover_src: 'url:https://image.tmdb.org/t/p/w500/paris.jpg', replies: 1 }),
  recRow(2, PEOPLE[1], { status: 'kept', kind: 'book', title: 'Orlando', author: 'Virginia Woolf', year: 1928 }),
];
const RECS_SENT = [
  recRow(3, PEOPLE[1], { status: 'open', note: 'Slow, but worth it.', kind: 'movie', title: 'Stalker', year: 1979 }),
  recRow(4, PEOPLE[1], { status: 'watched', kind: 'book', title: 'The Waves', year: 1931 }),
  recRow(5, PEOPLE[2], { status: 'kept', kind: 'movie', title: 'Kids', year: 1995 }),
  recRow(6, PEOPLE[2], { status: 'dismissed', kind: 'movie', title: 'Julien Donkey-Boy', year: 1999 }),
];
const REC_THREAD = { [recId(1)]: [{ id: 'cececece-cece-4ece-8ece-000000000001', created_at: at(0, -5), text: 'Saving it for Sunday.', owner: ME.id, username: 'tester', display_name: 'Test Person', avatar_key: null }] };
const REC_STATS = id => id === ME.id ? { sent: 4, watched: 1 } : { sent: 12, watched: 7 };
// in the feed: "@mira recommended Paris, Texas to @longusername_twenty1", an hour old
const FEED_REC = { what: 'rec', id: recId(7), at: at(0, -1), owner: PEOPLE[1].id, username: 'mira', display_name: 'Mira', avatar_key: 'avatars/mira', caption: '', name: null, preview_key: null,
  created_at: at(0, -1), updated_at: at(0, -1), updated: false, is_public: true, kind: 'movie', title: 'Paris, Texas', author: 'Wim Wenders', year: 1984,
  cover_src: 'url:https://image.tmdb.org/t/p/w500/paris.jpg', to_username: 'longusername_twenty1', to_display_name: '' };
const REC_NOTES = [
  { id: 'acacacac-acac-4cac-8cac-000000000011', kind: 'rec', created_at: at(0, -4), read: false, actor: PEOPLE[1].id, log: null, rec: recId(1), rec_kind: 'movie', rec_title: 'Paris, Texas' },
  { id: 'acacacac-acac-4cac-8cac-000000000012', kind: 'rec_watched', created_at: at(0, -6), read: false, actor: PEOPLE[1].id, log: null, rec: recId(4), rec_kind: 'book', rec_title: 'The Waves' },
  { id: 'acacacac-acac-4cac-8cac-000000000013', kind: 'rec_reply', created_at: at(0, -7), read: true, actor: PEOPLE[1].id, log: null, rec: recId(3), rec_kind: 'movie', rec_title: 'Stalker', reply_text: 'Starting it tonight.' },
];
/* the Worker's /title (a title's page, /t/): Gummo by its TMDB id, The Waves (with a spine in the archive) and Just Kids
   by their Open Library work ids; each also found by its kind, title and year */
const TITLE_INFO = [
  { kind: 'movie', id: '106', title: 'Gummo', year: '1997', creator: 'Harmony Korine', runtime: 89, pages: null, genres: ['Drama'],
    overview: 'Xenia, Ohio, some years after a tornado. Two boys kill time.', cover: 'https://image.tmdb.org/t/p/w500/gummo.jpg', spine: '' },
  { kind: 'book', id: 'OL99W', title: 'The Waves', year: '1931', creator: 'Virginia Woolf', runtime: null, pages: 297, genres: ['English fiction', 'Modernism'],
    overview: 'Six friends, from childhood on, in soliloquies.', cover: 'https://covers.openlibrary.org/b/id/1-L.jpg', spine: '/archive/img?id=0123456789abcdef0123456789abcdef' },
  { kind: 'book', id: 'OL5W', title: 'Just Kids', year: '2010', creator: 'Patti Smith', runtime: null, pages: 304, genres: ['Memoir'],
    overview: 'New York, 1967.', cover: 'https://covers.openlibrary.org/b/id/2-L.jpg', spine: '' },
];
const titleFor = q => TITLE_INFO.find(t => q.get('film') ? t.kind === 'movie' && t.id === q.get('film') : q.get('book') ? t.kind === 'book' && t.id === q.get('book')
  : t.kind === q.get('kind') && t.title.toLowerCase() === String(q.get('title') || '').toLowerCase() && (!q.get('year') || t.year === q.get('year')));
/* PostgREST's filters, as the database reads them, for the rows asked for by title: col=op.value for each column
   (eq, neq, ilike, is, in), and or=(...) / and=(...) with and(...) and or(...) inside, a value in double quotes when it
   has a comma or a bracket in it. ilike: % (or *) is anything, _ one character, \ takes the next as itself. */
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const splitTop = s => { const out = []; let d = 0, inQ = false, cur = '';
  for (let i = 0; i < s.length; i++){ const c = s[i];
    if (inQ){ cur += c; if (c === '\\'){ cur += s[++i]; continue; } if (c === '"') inQ = false; continue; }
    if (c === '"'){ inQ = true; cur += c; continue; }
    if (c === '(') d++; else if (c === ')') d--;
    if (c === ',' && d === 0){ out.push(cur); cur = ''; continue; }
    cur += c; }
  if (cur) out.push(cur); return out; };
const unq = v => v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v;
const reEsc = c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const likeRe = v => { let re = ''; for (let i = 0; i < v.length; i++){ const c = v[i];
  if (c === '\\'){ re += reEsc(v[++i] || ''); continue; }
  re += c === '%' || c === '*' ? '.*' : c === '_' ? '.' : reEsc(c); }
  return new RegExp('^' + re + '$', 'is'); };
function opOf(col, op, v){
  const val = r => r[col] == null ? null : String(r[col]);
  if (op === 'eq') return r => val(r) === unq(v);
  if (op === 'neq') return r => val(r) !== unq(v);
  if (op === 'is') return r => v === 'null' ? r[col] == null : String(r[col]) === v;
  if (op === 'in') { const set = splitTop(v.replace(/^\(|\)$/g, '')).map(unq); return r => set.includes(val(r)); }
  if (op === 'ilike'){ const re = likeRe(unq(v)); return r => re.test(val(r) || ''); }
  throw new Error('a filter the mock doesn\'t know: ' + op);
}
function cond(expr){
  const g = /^(and|or)\((.*)\)$/s.exec(expr);
  if (g){ const parts = splitTop(g[2]).map(cond); return g[1] === 'and' ? r => parts.every(f => f(r)) : r => parts.some(f => f(r)); }
  const m = /^([a-z_]+)\.(not\.)?([a-z]+)\.(.*)$/s.exec(expr), f = opOf(m[1], m[3], m[4]);
  return m[2] ? r => !f(r) : f;
}
// every filter in the address, for rows of one table (cols: the columns it has; one it hasn't is 42703, as PostgREST says)
function pgWhere(q, cols){
  const fs = [];
  for (const [k, v] of q){
    if (RESERVED.has(k)) continue;
    if (k === 'or' || k === 'and'){ fs.push(cond(k + v)); continue; }
    if (cols && !cols.includes(k)) throw Object.assign(new Error('column ' + k + ' does not exist'), { code: '42703' });
    const m = /^(not\.)?([a-z]+)\.(.*)$/s.exec(v), f = opOf(k, m[2], m[3]); fs.push(m[1] ? r => !f(r) : f);
  }
  return r => fs.every(f => f(r));
}
// what PostgREST says to an embedded profiles() that two foreign keys could mean (logs: its owner, or through likes;
// shelves: its owner, or a profile's main shelf). The page has to name one: profiles!logs_owner_fkey(...)
const AMBIGUOUS = { __status: 300, body: { code: 'PGRST201', message: 'Could not embed because more than one relationship was found for \'logs\' and \'profiles\'', details: [], hint: 'Try changing \'profiles\' to one of the following: \'profiles!logs_owner_fkey\', \'profiles!likes\'.' } };
const someone = id => { const p = [...PEOPLE, ...FRIENDS].find(x => x.id === id); return p ? { username: p.username, display_name: p.display_name, avatar_key: p.avatar_key } : null; };
const noteRow = n => { const p = PEOPLE.find(x => x.id === n.actor), l = LOGS.find(x => x.id === n.log);
  return { id: n.id, kind: n.kind, created_at: n.created_at, read: n.read, actor: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key,
    log: n.log, log_kind: l ? l.kind : null, log_title: l ? l.title : null, reply_text: n.reply_text || null, rec: n.rec || null, rec_kind: n.rec_kind || null, rec_title: n.rec_title || null }; };

/* ---------- Supabase's REST API, answered from the data above ---------- */
/* migration 0011 (docs/proposed-0011-ids-edits.sql), with mockNetwork's ids: true: titles keep their ids. @mira's
   Gummo has TMDB's 106, and @longusername_twenty1 logged it as "gummo." in 1998 with the same id (two spellings, one
   film, merged by the id); the spines and the made-up account's own logs are from before ids were kept (none). A log
   edited answers with edited_at. */
const IDS_OF = { [logId(0)]: { tmdb_id: 106 } };
const IDS_LOG = { id: logId(8), owner: PEOPLE[2].id, kind: 'movie', title: 'gummo.', author: 'Harmony Korine', year: 1998, cover_src: null, caption: 'Odd.', created_at: at(2, 1), tmdb_id: 106 };
const withIds = l => ({ tmdb_id: null, ol_id: null, edited_at: null, ...l, ...(IDS_OF[l.id] || {}) });
function rest(url, method, body, signedIn, named, empty, logs, ownShelf, fresh, friends, social, recs, ids){
  const LOGS_NOW = ids ? [...LOGS.map(withIds), IDS_LOG] : LOGS;
  // 0011: logs.tmdb_id answers once it's there, 42703 (400) before
  if (url.pathname.endsWith('/rest/v1/logs') && url.searchParams.get('select') === 'tmdb_id,edited_at') return ids ? [] : { __status: 400, body: { code: '42703', message: 'column logs.tmdb_id does not exist', details: null, hint: null } };
  if (fresh) ownShelf = false;
  const me = signedIn && !fresh;   // the made-up account as it is (follows @mira); fresh: nothing yet
  const what = url.pathname.replace(/^\/rest\/v1\//, ''), q = url.searchParams, eq = k => (q.get(k) || '').replace(/^eq\./, '');
  // 0010: with recs, its tables and functions; without, they aren't there
  if (/^(recs|rec_replies)$/.test(what)){
    if (!recs) return NO_TABLE;
    if (method === 'POST' && what === 'rec_replies') return [{ id: 'cececece-cece-4ece-8ece-000000000099', created_at: new Date().toISOString(), owner: ME.id, ...body }];
    if (method === 'POST') return [{ id: recId(99), created_at: new Date().toISOString(), sender: ME.id, status: 'open', ...body }];
    // recs by id (the notifications page reads the ones it names): the two of them can
    if (method === 'GET' && what === 'recs' && (q.get('id') || '').startsWith('in.(')){ const want = q.get('id').slice(4, -1).split(','); return [...RECS_FOR, ...RECS_SENT].filter(r => want.includes(r.id)); }
    return method === 'GET' ? [] : null;
  }
  if (/^rpc\/(rec_stats|mutuals|recs_list|rec_keep|rec_thread|feed_recs|timeline)$/.test(what)){
    if (!recs) return NOT_THERE;
    if (what === 'rpc/rec_stats') return [REC_STATS(body.uid || q.get('uid'))];
    if (what === 'rpc/mutuals') return signedIn ? MUTUALS : [];
    if (what === 'rpc/recs_list') return !signedIn ? [] : body.box === 'sent' ? RECS_SENT : RECS_FOR;
    if (what === 'rpc/rec_keep') return 'kept';
    if (what === 'rpc/rec_thread') return REC_THREAD[body.rid] || [];
    if (what === 'rpc/timeline'){
      const rows = rest(new URL(url.href.replace('/rpc/timeline', '/rpc/activity')), method, body, signedIn, named, empty, logs, ownShelf, fresh, friends, social, recs, ids);
      if (!Array.isArray(rows)) return rows;
      const all = [...rows.map(r => ({ ...r, to_username: null, to_display_name: null })), ...(body.scope === 'everyone' && !body.before_id ? [FEED_REC] : [])];
      return all.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, body.n || 20);
    }
    return [];
  }
  // 0009: with social, its tables and functions; without, they aren't there
  if (/^(likes|replies|notifications|act_counts)$/.test(what)){
    if (!social) return NO_TABLE;
    if (method === 'GET' && what === 'notifications') return signedIn ? NOTES.filter(n => !n.read).slice(0, +(q.get('limit') || 30)).map(n => ({ id: n.id })) : [];
    if (method === 'POST' && what === 'replies') return [{ id: 'abababab-abab-4bab-8bab-000000000099', created_at: new Date().toISOString(), owner: ME.id, ...body }];
    return method === 'GET' ? [] : method === 'DELETE' ? [] : null;
  }
  if (/^rpc\/(post_stats|replies_of|notifications_list|notifications_read)$/.test(what)){
    if (!social) return NOT_THERE;
    if (what === 'rpc/post_stats') return (body.ids || []).filter(id => STATS[id] || id === NEW_LOG || (ids && id === IDS_LOG.id)).map(id => ({ id, ...(STATS[id] || STATS[logId(3)]), ...(signedIn ? {} : { liked: false, logged: false }), ...(recs ? { rec_by: id === logId(2) ? 'tester' : null } : {}),
      ...(ids ? { edited_at: null, tmdb_id: (IDS_OF[id] || {}).tmdb_id || (id === IDS_LOG.id ? 106 : null), ol_id: null } : {}) }));
    if (what === 'rpc/replies_of') return REPLIES.filter(r => r.log === body.lid).map(replyRow);
    if (what === 'rpc/notifications_list') return signedIn ? [...NOTES, ...(recs ? REC_NOTES : [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(noteRow) : [];
    if (what === 'rpc/notifications_read') return NOTES.filter(n => !n.read).length;
  }
  // a log posted: the database's answer is the new row
  if (what === 'logs' && method === 'POST') return logs ? [{ id: NEW_LOG, created_at: new Date().toISOString(), owner: ME.id, ...body }] : NOT_THERE;
  // a log edited (0011): only yours, and the row as it is then (an id filled in isn't an edit)
  if (what === 'logs' && method === 'PATCH'){
    if (!ids) return { __status: 403, body: { code: '42501', message: 'permission denied for table logs' } };
    const l = LOGS_NOW.find(x => x.id === eq('id') && x.owner === ME.id) || (eq('id') === NEW_LOG ? { id: NEW_LOG, owner: ME.id } : null);
    const edit = Object.keys(body).some(k => !/^(tmdb_id|ol_id)$/.test(k));
    return l ? [{ ...withIds(l), ...(STATS[l.id] || {}), ...body, ...(edit ? { edited_at: new Date().toISOString() } : {}) }] : [];
  }
  if (what === 'shelf_items' && method === 'PATCH') return ids ? [] : { __status: 403, body: { code: '42501', message: 'permission denied for table shelf_items' } };
  if (what === 'logs' && method === 'GET' && (q.get('id') || '').startsWith('in.(')){ const want = q.get('id').slice(4, -1).split(','); return LOGS_NOW.filter(l => want.includes(l.id)); }   // logs by id (the notifications page)
  if (what === 'logs' && method === 'GET' && q.get('id')){   // one log by its id (a post's own page)
    const l = LOGS_NOW.find(x => x.id === eq('id'));
    if (l) return [l];
  }
  if (/^(rpc\/(activity|from_friends)|logs|watchlist|friend_hides)$/.test(what)){
    if (!logs) return NOT_THERE;
    if (what === 'rpc/activity'){
      if (empty) return [];
      const mine = r => r.owner === ME.id && (ownShelf || !r.preview_key), mira = r => r.owner === PEOPLE[1].id;
      const keep = body.scope === 'you' ? (fresh ? () => false : mine) : body.scope === 'following' ? (me ? mira : () => false) : () => true;
      const more = me && friends && body.scope === 'following';   // and the five more people, for home's cards
      const rows = [...SHELVES.filter(keep).map(shelfRow), ...LOGS.filter(keep).map(logRow), ...(more ? [...FRIEND_SHELVES.map(shelfRow), ...FRIEND_LOGS.map(logRow)] : [])]
        .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
      const from = body.before_id ? rows.findIndex(r => r.id === body.before_id) + 1 : 0;
      return rows.slice(from, from + (body.n || 20));
    }
    if (what === 'rpc/from_friends') return me ? FROM_FRIENDS : [];
    if (method === 'DELETE') return [{ id: eq('id') }];
    if (method !== 'GET') return null;   // a log posted, a title kept, one removed: nothing is kept here
    if (what === 'logs' && (q.get('title') || q.get('or'))){   // the title page: that title's logs, with whose they are
      if (/(^|[,(])profiles\(/.test(q.get('select') || '')) return AMBIGUOUS;
      const where = pgWhere(q);
      return [...LOGS_NOW, ...(friends ? FRIEND_LOGS : [])].filter(l => where(l) && !(fresh && l.owner === ME.id)).map(l => ({ ...l, profiles: someone(l.owner) }));
    }
    if (what === 'logs'){ const from = +(q.get('offset') || 0), n = +(q.get('limit') || 20); return LOGS_NOW.filter(l => l.owner === eq('owner') && !(fresh && l.owner === ME.id)).slice(from, from + n); }
    if (what === 'watchlist') return WATCHLIST.filter(w => w.owner === eq('owner') && !(fresh && w.owner === ME.id));
    return [];
  }
  if (what === 'rpc/feed'){
    if (empty) return [];
    const rows = [...SHELVES.filter(s => body.scope !== 'following' || (me && PEOPLE.find(p => p.id === s.owner).username === 'mira')), ...(me && friends && body.scope === 'following' ? FRIEND_SHELVES : [])]
      .sort((a, b) => b.saved_at.localeCompare(a.saved_at)).map(feedRow);
    const from = body.before_id ? rows.findIndex(r => r.shelf_id === body.before_id) + 1 : 0;
    return rows.slice(from, from + (body.n || 20));
  }
  if (what === 'rpc/profile_stats') return [{ shelf_count: SHELVES.filter(s => s.owner === body.uid).length, spine_count: 12 }];
  if (what === 'rpc/follow_stats') return [fresh && body.uid === ME.id ? { following: 0, followers: 0 } : { following: 1, followers: 2 }];
  if (what === 'rpc/profile_card') return PEOPLE.filter(p => p.username === body.p_username).map(p => card(p, me));
  if (what === 'rpc/find_people'){   // by the start of a username or a display name, an @ in front or not
    const w = String(body.q || '').trim().replace(/^@+/, '').toLowerCase();
    return w ? PEOPLE.filter(p => p.username.startsWith(w) || p.display_name.toLowerCase().startsWith(w)).map(p => card(p, me)) : [];
  }
  if (what === 'rpc/follow_list') return fresh && body.uid === ME.id ? [] : PEOPLE.filter(p => p.id !== body.uid).map(p => card(p, me));
  if (what === 'rpc/follow') return 'following';
  if (what === 'rpc/unfollow') return 'none';
  if (what === 'rpc/username_available') return true;
  if (what === 'rpc/am_i_pro') return false;
  if (what === 'rpc/save_shelf') return body.shelf.id;
  if (what.startsWith('rpc/')) return [];
  // a change to a profile answers with the row as it would be then (nothing here is kept)
  if (what === 'profiles' && method === 'PATCH') return PEOPLE.filter(p => p.id === eq('id')).map(p => ({ ...p, ...body }));
  if (what === 'profiles') return PEOPLE.filter(p => (named || p.id !== ME.id) && (!q.has('id') || p.id === eq('id')) && (!q.has('username') || p.username === eq('username')))
    .map(p => fresh && p.id === ME.id ? { ...p, display_name: '', bio: '', created_at: new Date().toISOString() } : p);   // a new account: no name or bio yet
  if (what === 'shelves'){
    const ids = (q.get('id') || '').startsWith('in.(') ? q.get('id').slice(4, -1).split(',') : q.has('id') ? [eq('id')] : null;   // id=eq.x or id=in.(x,y)
    return [...SHELVES, ...(ids ? FRIEND_SHELVES : [])].filter(s => (!q.has('owner') || s.owner === eq('owner')) && (!ids || ids.includes(s.id)) && (ownShelf || s.owner !== ME.id));
  }
  // who the made-up account follows (the title page asks): @mira, and the five more with friends
  if (what === 'follows' && eq('follower') === ME.id && !q.get('followee')) return me ? [{ followee: PEOPLE[1].id }, ...(friends ? FRIENDS.map(f => ({ followee: f.id })) : [])] : [];
  // follows, read from the table: @mira follows the made-up account, and that's the only one it's asked about
  if (what === 'follows') return me && eq('follower') === PEOPLE[1].id && eq('followee') === ME.id ? [{ follower: PEOPLE[1].id }] : [];
  // one shelf's spine of a title (+ ADD asking whether it's there already): that shelf's spines as its own page has them
  const titled = !!(q.get('title') || q.get('or'));
  if (what === 'shelf_items' && titled && eq('shelf_id')){ const where = pgWhere(new URLSearchParams([...q].filter(([k]) => k !== 'shelf_id'))); return ITEMS.filter(where).map(r => ({ item_id: r.item_id })); }
  if (what === 'shelf_items' && titled){   // the title page: every spine of that title, with its shelf and whose it is
    if (/shelves\([^)]*(^|[,(])profiles\(/.test(q.get('select') || '')) return { ...AMBIGUOUS, body: { ...AMBIGUOUS.body, message: 'Could not embed because more than one relationship was found for \'shelves\' and \'profiles\'' } };
    const all = [...SHELVES, ...FRIEND_SHELVES].filter(x => !(fresh && x.owner === ME.id)), where = pgWhere(q);
    return [...ITEMS_BY_SHELF].flatMap(([id, rows]) => rows.filter(where).map(r => { const sh = all.find(x => x.id === id);
      return sh ? { ...r, shelf_id: id, shelves: { id, owner: sh.owner, name: sh.name, caption: sh.caption, profiles: someone(sh.owner) } } : null; })).filter(Boolean);
  }
  if (what === 'shelf_items'){   // shelf_id=in.(x,y): each shelf's own spines; shelf_id=eq.x: ITEMS
    const ids = (q.get('shelf_id') || '').startsWith('in.(') ? q.get('shelf_id').slice(4, -1).split(',') : null;
    return ids ? ids.flatMap(id => ITEMS_BY_SHELF.get(id) || []) : ITEMS;
  }
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
// and then books, each in this order (so the page's own ordering, closest title first, has something to do), each with
// its id as the Worker gives it (tmdb: TMDB's, ol: Open Library's work)
const MATCHES = [
  { kind: 'movie', tmdb: '106', title: 'Gummo', year: '1997', creator: 'Harmony Korine', cover: 'https://image.tmdb.org/t/p/w500/gummo.jpg' },
  { kind: 'movie', title: 'Waves', year: '2019', creator: 'Trey Edward Shults', cover: 'https://image.tmdb.org/t/p/w500/waves.jpg' },
  { kind: 'movie', title: 'Spy Kids', year: '2001', creator: 'Robert Rodriguez', cover: 'https://image.tmdb.org/t/p/w500/spykids.jpg' },
  { kind: 'movie', title: 'Kids in America', year: '2005', creator: 'Josh Stolberg', cover: 'https://image.tmdb.org/t/p/w500/kia.jpg' },
  { kind: 'movie', tmdb: '9344', title: 'Kids', year: '1995', creator: 'Larry Clark', cover: 'https://image.tmdb.org/t/p/w500/kids.jpg' },
  { kind: 'movie', title: 'The Kids Are All Right', year: '2010', creator: 'Lisa Cholodenko', cover: 'https://image.tmdb.org/t/p/w500/tkaar.jpg' },
  { kind: 'movie', title: 'Honey, I Shrunk the Kids', year: '1989', creator: 'Joe Johnston', cover: 'https://image.tmdb.org/t/p/w500/hisk.jpg' },
  { kind: 'book', ol: 'OL99W', title: 'The Waves', year: '1931', creator: 'Virginia Woolf', cover: 'https://covers.openlibrary.org/b/id/1-L.jpg' },
  { kind: 'book', ol: 'OL5W', title: 'Just Kids', year: '2010', creator: 'Patti Smith', cover: 'https://covers.openlibrary.org/b/id/2-L.jpg' },
  { kind: 'book', title: 'Kids', year: '2021', creator: 'Michael Chabon', cover: 'https://covers.openlibrary.org/b/id/3-L.jpg' },
];
const plain = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

/* Answers everything that isn't the site itself. Returns {unknown}: requests nothing here knew how to answer. */
/* signedIn: a session for the made-up account; named: false leaves that account without a username yet;
   slow: how long /identify takes to answer, in ms; capped: the Worker's Brave searches for today are used up;
   realFonts: the fonts come from Google Fonts as they do on the site (for screenshots; the tests go without);
   empty: no one has shelved anything yet, so the feed has nothing in it; logs: false answers as a database does
   without migration 0007 (no logs, watchlist or From friends, and no activity()); ownShelf: false is the
   made-up account before it has saved its shelf; fresh: it has just picked its username, with nothing yet (no name,
   bio, shelf, log, watchlist or follow); friends: it follows five more people (FRIENDS), for home's row of cards;
   social: the database has migration 0009 (likes, replies, notifications; supabase/migrations/0009_social.sql).
   recs: it has migration 0010 too (recs, their threads; supabase/migrations/0010_recs.sql). ids: and the proposed 0011
   (ids on titles, editing a log; docs/proposed-0011-ids-edits.sql).
   Returns {unknown, asked}: requests nothing here could answer, and every search /identify was asked for. */
async function mockNetwork(page, { signedIn = false, named = true, slow = 0, capped = false, realFonts = false, empty = false, logs = true, ownShelf = true, fresh = false, friends = false, social = false, recs = false, ids = false } = {}){
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
      let data = rest(url, method, body, signedIn, named, empty, logs, ownShelf, fresh, friends, social, recs, ids);
      if (data && data.__status) return route.fulfill({ status: data.__status, headers: CORS, contentType: 'application/json', body: JSON.stringify(data.body) });
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
      if (url.pathname === '/title'){ const t = titleFor(url.searchParams); return t ? json(t) : route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: '{"error":"Not found."}' }); }
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
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/\/rest\/v1\/likes\?select=log&limit=1$/.test((m.location() || {}).url || '')) return;   // post.js asking whether 0009 is there: 404 until it is
    if (/\/rest\/v1\/rpc\/rec_stats\?uid=0{8}-/.test((m.location() || {}).url || '')) return;   // recs.js asking whether 0010 is there: the same
    if (/\/rest\/v1\/logs\?select=tmdb_id,edited_at&limit=1$/.test((m.location() || {}).url || '')) return;   // nav.js asking whether 0011 is there: 400 until it is
    errors.push(m.text());
  });
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  return errors;
}

/* signed out for now (after mockNetwork with signedIn): the made-up session is put aside, and the function this gives
   puts it back, as when someone comes back from signing in with Google */
async function putAside(page){
  await open(page, '/privacy.html');
  const kv = await page.evaluate(() => { const k = Object.keys(localStorage).find(x => /^sb-.+-auth-token$/.test(x)); const v = [k, localStorage.getItem(k)]; localStorage.removeItem(k); return v; });
  return () => page.evaluate(([k, v]) => localStorage.setItem(k, v), kv);
}

/* open a page and wait until it has finished asking for things */
async function open(page, pathname){
  await page.goto(pathname);
  await page.waitForLoadState('networkidle');
}

module.exports = { IDS_LOG, TITLE_INFO, NEW_LOG, STATS, REPLIES, NOTES, MUTUALS, RECS_FOR, RECS_SENT, REC_THREAD, FEED_REC, REC_NOTES, recId, ROOT, PAGES, OTHER_PAGES, ME, PEOPLE, SHELVES, LOGS, FRIENDS, FRIEND_SHELVES, FRIEND_LOGS, ITEMS_BY_SHELF, WATCHLIST, FROM_FRIENDS, PICTURE, STORY, CAPTION, MADE_WITH, CORS, WORKER, SB_URL, feedRow, storyPicture, mockNetwork, watchErrors, open, putAside };
