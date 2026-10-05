// A title's page (/t/): /t/?film=<TMDB id> or /t/?book=<Open Library work id>, or a log's or a spine's kind, title and
// year (the page finds the id). The cover (worn when you've logged it), what it is (the Worker's /title), how people
// rated it (the average in spines, a histogram of the ten halves, watched by N · M friends), the panel (Log, Put on
// shelf, Add to Up next, Recommend, Share, or how each stands), On shelves (people you follow first, 12 faces), and the
// reviews: Friends · Popular · Recent, with Your review at the top until you've logged it.
const { test, expect } = require('@playwright/test');
const { ME, LOGS, SB_URL, CORS, TITLE_INFO, mockNetwork, watchErrors, open } = require('../site');

const panel = page => page.getByRole('group', { name: 'What to do with it' });
const sent = (page, method, table) => page.waitForRequest(r => r.method() === method && new URL(r.url()).pathname === '/rest/v1/' + table);

test('a film by its TMDB id: what it is, how it was rated, who watched it, the panel', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gummo 1997');
  await expect(page).toHaveTitle('Gummo (1997) · shelfstackd');
  await expect(page.locator('#tBy')).toHaveText('Directed by Harmony Korine · 89 min');
  await expect(page.locator('#tGenres')).toHaveText('Drama');
  await expect(page.locator('#tAbout')).toHaveText(TITLE_INFO[0].overview);
  await expect(page.locator('#tSpine')).toBeHidden();   // none in the archive
  // not logged by you: the cover is clean, with the 1px outline
  const cover = page.locator('#tCover img.clean');
  await expect(cover).toHaveAttribute('alt', 'The cover of Gummo (1997)');
  await expect(page.locator('#tCover canvas.worn')).toHaveCount(0);
  // @mira gave it 4.5 spines; the histogram has ten halves, the ninth filled; you follow her
  await expect(page.locator('#tAvg [role=img]')).toHaveAttribute('aria-label', '4.5 of 5');
  await expect(page.locator('#tAvg .grey')).toHaveText('4.5 of 5 · 1 rating');
  await expect(page.locator('#tHist li')).toHaveCount(10);
  expect(await page.locator('#tHist li').evaluateAll(ls => ls.map(l => l.dataset.n))).toEqual(['0', '0', '0', '0', '0', '0', '0', '0', '1', '0']);
  await expect(page.locator('#tWho')).toHaveText('watched by 1 · 1 friend');
  // the panel: Log first and solid; your shelf has it already; Up next; Share
  const p = panel(page);
  await expect(p.locator(':scope > *')).toHaveText(['Log', 'On your shelf', 'Add to Up next', 'Share']);
  expect(await p.getByRole('button', { name: 'Log' }).evaluate(b => getComputedStyle(b).backgroundColor)).toBe('rgb(0, 0, 0)');
  expect(await p.locator('.state').evaluate(s => getComputedStyle(s).color)).toBe('rgb(107, 107, 107)');
  expect(errors).toEqual([]);
});

test('the panel: Log opens + ADD\'s Log it on this title; Add to Up next puts it on; Share has the link and WhatsApp', async ({ page, context }) => {
  test.skip(test.info().project.name.startsWith('phone'), 'the clipboard is tried at the desktop width');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  const p = panel(page);
  await p.getByRole('button', { name: 'Log' }).click();
  await expect(page.locator('#addDialog #addPostTitle')).toHaveText('Gummo (1997)');
  await page.locator('#addClose').click();
  const req = sent(page, 'POST', 'watchlist');
  await p.getByRole('button', { name: 'Add to Up next' }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg' });
  await expect(p.locator('.state').filter({ hasText: 'In Up next' })).toBeVisible();
  await p.getByRole('button', { name: 'Share' }).click();
  await expect(p.getByRole('menuitem')).toHaveText(['Copy link', 'Share to WhatsApp']);
  await p.getByRole('menuitem', { name: 'Copy link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/t\/\?film=106&title=Gummo&year=1997$/);
});

test('a link from a log (kind, title, year) takes the id\'s address; with no Worker it goes on with what the link says', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?kind=movie&title=gummo&year=1997');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gummo 1997');
  await expect(page).toHaveURL(/\/t\/\?film=106&title=gummo&year=1997$/);   // the id, and the link's own title and year to match by
  // a title the Worker doesn't know (or no Worker at all): the link's own words, and what people here did with it
  await open(page, '/t/?kind=book&title=Orlando&year=1928');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orlando 1928');
  await expect(page).toHaveURL(/kind=book&title=Orlando&year=1928$/);
  await expect(page.locator('#tBy')).toBeHidden();
  // no title at all
  await open(page, '/t/');
  await expect(page.locator('#state')).toHaveText('Which film or book? This link doesn’t say.');
});

test('a book: by and pages, its real spine from the archive; a title you logged has its cover worn and says when', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?book=OL99W');
  await expect(page.locator('#tBy')).toHaveText('by Virginia Woolf · 297 pages');
  await expect(page.locator('#tSpine img')).toHaveAttribute('src', /\/archive\/img\?id=0123456789abcdef0123456789abcdef$/);
  await expect(page.locator('#tSpine img')).toHaveAttribute('alt', 'The spine of The Waves (1931)');
  await expect(page.locator('#tWho')).toHaveText('read by 1 · 1 friend');
  // Just Kids: you read it
  await open(page, '/t/?book=OL5W');
  await expect(page.locator('#tCover canvas.worn')).toHaveCount(1);
  const mine = LOGS.find(l => l.owner === ME.id && l.title === 'Just Kids');
  const read = panel(page).locator('.state').first();
  await expect(read).toHaveText(/^Logged (\w+ \d+|\d+ \w+)$/);   // "Logged Sep 27", in the reader's own way of writing a date
  await expect(read.locator('a')).toHaveAttribute('href', `../p/?${mine.id}`);
  await expect(panel(page).getByRole('button', { name: 'Log' })).toHaveCount(0);
  await expect(page.locator('#yours')).toBeHidden();   // you've logged it: no Your review
  expect(errors).toEqual([]);
});

test('On shelves: the people whose shelves have it, people you follow first, each to that shelf; not you', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  const faces = page.locator('#onList a');
  await expect(page.locator('#onH')).toHaveText(/^On shelves \(\d+\)$/);
  await expect(faces.first()).toHaveAttribute('aria-label', /^@mira: /);   // you follow @mira
  await expect(faces.first()).toHaveAttribute('href', /^\.\.\/u\/\?mira&shelf=/);
  expect(await faces.evaluateAll(as => as.some(a => a.getAttribute('aria-label').startsWith('@tester')))).toBe(false);
  expect(await faces.count()).toBeLessThanOrEqual(12);
});

test('reviews: Friends · Popular · Recent; each a post, a press to its page', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  const tabs = page.getByRole('tablist', { name: 'Reviews' }).getByRole('tab');
  await expect(tabs).toHaveText(['Friends', 'Popular', 'Recent']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');   // someone you follow reviewed it
  const post = page.locator('#revList .post');
  await expect(post).toHaveCount(1);
  await expect(post.locator('.pwho span')).toHaveText('@mira');
  await expect(post.locator('.say')).toHaveText(/^The bathtub scene/);
  await expect(post.locator('.prating [role=img]')).toHaveAttribute('aria-label', '4.5 of 5');
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(post).toHaveCount(1);
  await post.locator('.say').click();
  await expect(page).toHaveURL(new RegExp(`/p/\\?${LOGS[0].id}$`));
  expect(errors).toEqual([]);
});

test('signed out: no Friends tab, no Your review; the panel signs you in first', async ({ page }) => {
  await mockNetwork(page, { social: true });
  await open(page, '/t/?film=106');
  await expect(page.getByRole('tab', { name: 'Friends' })).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Popular' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#yours')).toBeHidden();
  await expect(page.locator('#tWho')).toHaveText('watched by 1');
  await panel(page).getByRole('button', { name: 'Log' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
});

test('Your review: one press on the spines rates it, then the review and Post show; Post logs it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106');
  const yours = page.locator('#yours');
  await expect(yours).toBeVisible();
  await expect(yours.getByRole('button', { name: 'Post' })).toBeHidden();
  await expect(yours.getByRole('textbox')).toBeHidden();
  const spines = yours.getByRole('slider', { name: 'Rating' });
  await spines.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await expect(spines).toHaveAttribute('aria-valuenow', '8');
  await expect(yours.getByRole('button', { name: 'Post' })).toBeVisible();
  await yours.getByRole('textbox', { name: /Review/ }).fill('Odd and tender.');
  const req = sent(page, 'POST', 'logs');
  await yours.getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toMatchObject({ kind: 'movie', title: 'Gummo', year: 1997, rating: 8, review: 'Odd and tender.' });
});

// every title leads here: a post's title and cover, a rec in the feed, the profile's lists, a shelf's spines
test('titles lead to their page: a post\'s title and its cover, From friends, Up next, a shelf\'s spines', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const post = page.locator('#items .post').filter({ hasText: 'watched Gummo' }).first();
  await expect(post.locator('a.cover')).toHaveAttribute('href', /\/t\/\?kind=movie&title=Gummo&year=1997$/);
  await post.locator('.pwhat').getByRole('link', { name: 'Gummo' }).click();
  await expect(page).toHaveURL(/\/t\/\?film=106&title=Gummo&year=1997$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gummo 1997');
  await open(page, '/u/?tester');
  await expect(page.locator('#friends .tt b a').first()).toHaveAttribute('href', /\/t\/\?kind=/);
  await page.getByRole('tab', { name: 'Up next' }).click();
  await expect(page.locator('#wGrid .wcap a').first()).toHaveAttribute('href', /\/t\/\?kind=/);
  await open(page, '/u/?mira&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000001');
  await expect(page.locator('#oneItems .st b a').first()).toHaveAttribute('href', /\/t\/\?kind=/);
});

test('with 0010, the panel has Recommend, which opens the sheet on this title', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, recs: true });
  await open(page, '/t/?film=106');
  await panel(page).getByRole('button', { name: 'Recommend' }).click();
  await expect(page.locator('.recsheet')).toHaveAccessibleName('Recommend Gummo (1997)');
});

// the id's address keeps the link's title and year, and what people did with it is found by them, whatever the
// Worker says (TMDB's year can differ from the one a log kept)
test('matching by the link\'s title and year, even when the Worker\'s differ: your shelf, the shelves, the reviews', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  const { WORKER } = require('../site');
  await page.route(u => u.pathname === '/title', route => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json',
    body: JSON.stringify({ ...TITLE_INFO[0], id: '18415', title: 'Gummo', year: '1998' }) }));
  await open(page, '/t/?film=18415&title=Gummo&year=1997');
  await expect(panel(page).locator('.state').filter({ hasText: 'On your shelf' })).toBeVisible();
  await expect(page.locator('#onSec')).toBeVisible();
  await expect(page.locator('#revList .post')).toHaveCount(1);
  await expect(page).toHaveURL(/\/t\/\?film=18415&title=Gummo&year=1997$/);
});

// The live page at this address showed Put on shelf and no On shelves: its two reads embedded profiles() bare, which
// PostgREST refuses (PGRST201: logs meet profiles through likes too, shelves through a profile's main shelf). The mock
// refuses it the same way now; the Worker doesn't know 18415, as the live one didn't.
test('Gummo at its live address: On your shelf, On shelves and the reviews, from rows shaped as the database gives them', async ({ page }) => {
  const refused = [];   // (the Worker's 404 for 18415 is in the console, as it is live)
  page.on('response', r => { if (/\/rest\/v1\/(logs|shelf_items)\?/.test(r.url()) && r.status() >= 300) refused.push(r.url()); });
  await mockNetwork(page, { signedIn: true, social: true });
  const asked = [];
  page.on('request', r => { const u = new URL(r.url()); if (/^\/rest\/v1\/(logs|shelf_items)$/.test(u.pathname) && u.searchParams.get('or')) asked.push(u.searchParams.get('select')); });
  await open(page, '/t/?film=18415&title=Gummo&year=1997');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gummo 1997');
  await expect(panel(page).locator('.state').filter({ hasText: 'On your shelf' })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Put on shelf' })).toHaveCount(0);
  await expect(page.locator('#onSec')).toBeVisible();
  await expect(page.locator('#onList a').first()).toHaveAttribute('aria-label', /^@mira: /);
  await expect(page.locator('#tWho')).toHaveText('watched by 1 · 1 friend');
  await expect(page.locator('#revList .post')).toHaveCount(1);
  expect(asked.some(s => s.includes('profiles!logs_owner_fkey('))).toBe(true);
  expect(asked.some(s => s.includes('profiles!shelves_owner_fkey('))).toBe(true);
  expect(refused).toEqual([]);
});

// a slow Worker: what the link says is drawn at once (the title, the year, the cover from a log, your status), and
// the director, runtime and overview come in when it answers
test('a slow Worker: the title, cover and your status at once; the details when it answers', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  let answer; const held = new Promise(r => { answer = r; });
  await page.route(u => u.pathname === '/title', async route => { await held; route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(TITLE_INFO[0]) }); });
  await page.goto('/t/?kind=movie&title=Gummo&year=1997');   // (not open(): the network won't go quiet while the Worker is held)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gummo 1997');
  await expect(page.locator('#state')).toBeHidden();
  await expect(panel(page).locator('.state').filter({ hasText: 'On your shelf' })).toBeVisible();
  await expect(page.locator('#tCover img.clean')).toBeVisible();   // the cover from @mira's log
  await expect(page.locator('#tBy')).toBeHidden();
  answer();
  await expect(page.locator('#tBy')).toHaveText('Directed by Harmony Korine · 89 min');
  await expect(page.locator('#tAbout')).toHaveText(TITLE_INFO[0].overview);
});
