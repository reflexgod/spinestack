// Real ids on titles (the proposed 0011, docs/proposed-0011-ids-edits.sql; mockNetwork's ids): every new log, spine,
// Up next and rec keeps the id the Worker found; the title page matches by id first, then by kind, title and year for
// rows from before (so two spellings of one film are one); and your own rows from before get their id when you open
// them and the Worker knows the title. Without 0011 nothing sends or asks for an id.
const { test, expect } = require('@playwright/test');
const { ME, LOGS, IDS_LOG, SHELVES, ITEMS_BY_SHELF, mockNetwork, watchErrors, open } = require('../site');

const panel = page => page.getByRole('group', { name: 'What to do with it' });
const sent = (page, method, table) => page.waitForRequest(r => r.method() === method && new URL(r.url()).pathname === '/rest/v1/' + table);
const dialog = page => page.locator('#addDialog');

test('the title page matches by id first: two spellings of one film are one, and old rows still count by title and year', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true, ids: true });
  const asked = page.waitForRequest(r => /\/rest\/v1\/logs\?/.test(r.url()) && r.url().includes('or='));
  await open(page, '/t/?film=106&title=Gummo&year=1997');
  // the logs asked for: TMDB's 106, or no id and Gummo (1997)
  const or = new URL((await asked).url()).searchParams.get('or');
  expect(or).toBe('(tmdb_id.eq.106,and(tmdb_id.is.null,title.ilike."gummo",year.eq.1997))');
  // @mira's "Gummo" (1997) and @longusername_twenty1's "gummo." (1998), both 106: watched by 2
  await expect(page.locator('#tWho')).toHaveText('watched by 2 · 1 friend');
  await page.getByRole('tab', { name: 'Recent' }).click();
  await expect(page.locator('#revList .post')).toHaveCount(2);
  await expect(page.locator('#revList .post .pwho span')).toHaveText(['@mira', '@longusername_twenty1']);
  // the spines are from before ids: found by title and year, and the made-up account's own is one of them
  await expect(panel(page).locator('.state').filter({ hasText: 'On your shelf' })).toBeVisible();
  await expect(page.locator('#onSec')).toBeVisible();
  expect(errors).toEqual([]);
});

test('without 0011 the same page asks by title and year only, and the other spelling is another title', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  const asked = page.waitForRequest(r => /\/rest\/v1\/logs\?/.test(r.url()) && r.url().includes('or='));
  await open(page, '/t/?film=106&title=Gummo&year=1997');
  expect(new URL((await asked).url()).searchParams.get('or')).toBe('(and(title.ilike."gummo",year.eq.1997))');
  expect(new URL((await asked).url()).searchParams.get('select')).not.toContain('tmdb_id');
  await expect(page.locator('#tWho')).toHaveText('watched by 1 · 1 friend');
});

test('a new log, Up next and a rec keep the id the Worker found', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, recs: true, ids: true });
  await open(page, '/t/?film=106&title=Gummo&year=1997');
  // Up next, from the panel
  let req = sent(page, 'POST', 'watchlist');
  await panel(page).getByRole('button', { name: 'Add to Up next' }).click();
  expect((await req).postDataJSON()).toMatchObject({ kind: 'movie', title: 'Gummo', year: 1997, tmdb_id: 106 });
  // a rec, from the panel
  await panel(page).getByRole('button', { name: 'Recommend' }).click();
  const s = page.locator('.recsheet');
  await s.getByRole('checkbox', { name: /@mira/ }).check();
  req = sent(page, 'POST', 'recs');
  await s.getByRole('button', { name: 'Send' }).click();
  expect((await req).postDataJSON()).toMatchObject({ kind: 'movie', title: 'Gummo', tmdb_id: 106 });
  await expect(s).toHaveCount(0);   // shut, and the focus back on Recommend
  // a log, from Your review
  const yours = page.locator('#yours'), spines = yours.getByRole('slider', { name: 'Rating' });
  await spines.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  req = sent(page, 'POST', 'logs');
  await yours.getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toMatchObject({ kind: 'movie', title: 'Gummo', rating: 6, tmdb_id: 106 });
  // a book from + ADD's search: its Open Library work id
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await dialog(page).getByRole('combobox', { name: 'Film or book name' }).fill('just kids');
  await dialog(page).getByRole('option', { name: /Just Kids/ }).click();
  req = sent(page, 'POST', 'logs');
  await dialog(page).getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toMatchObject({ kind: 'book', title: 'Just Kids', ol_id: 'OL5W' });
});

test('without 0011 nothing sends an id', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?film=106&title=Gummo&year=1997');
  const req = sent(page, 'POST', 'watchlist');
  await panel(page).getByRole('button', { name: 'Add to Up next' }).click();
  const body = (await req).postDataJSON();
  expect(body).not.toHaveProperty('tmdb_id');
  expect(body).not.toHaveProperty('ol_id');
});

test('a spine put on your shelf keeps its id when the shelf is saved', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false, ids: true });
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  const d = dialog(page);
  await d.getByRole('radio', { name: 'Put on shelf' }).check();
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  await expect(d.getByRole('radiogroup', { name: 'Which spine' }).getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');
  await d.getByRole('button', { name: 'Add to shelf' }).click();
  const saved = page.waitForRequest(r => r.url().includes('/rpc/save_shelf'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const { items } = (await saved).postDataJSON();
  expect(items.map(i => [i.title, i.tmdb_id])).toEqual([['Gummo', '106']]);
});

test('your own rows from before ids: the title page and your log\'s page fill the id in, once the Worker knows the title', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, ids: true });
  const patched = [];
  page.on('request', r => { if (r.method() === 'PATCH') patched.push({ url: decodeURIComponent(r.url()), body: r.postDataJSON() }); });
  // Just Kids: the made-up account logged it, and it's on two of its shelves, all with no id
  await open(page, '/t/?book=OL5W');
  await expect.poll(() => patched.length).toBeGreaterThan(0);
  const log = LOGS.find(l => l.owner === ME.id && l.title === 'Just Kids');
  const toLog = patched.find(p => p.url.includes('/rest/v1/logs?'));
  expect(toLog.body).toEqual({ ol_id: 'OL5W' });
  expect(toLog.url).toContain(`id=eq.${log.id}`);
  expect(toLog.url).toContain('ol_id=is.null');
  const mineWithIt = SHELVES.filter(s => s.owner === ME.id && ITEMS_BY_SHELF.get(s.id).some(r => r.title === 'Just Kids'));
  await expect.poll(() => patched.filter(p => p.url.includes('/rest/v1/shelf_items?')).length).toBe(mineWithIt.length);
  // nobody else's: @mira's and the rest are left
  expect(patched.every(p => !p.url.includes(IDS_LOG.id))).toBe(true);
  // your log's own page: its id from the Worker's /title (by its kind, title and year)
  patched.length = 0;
  await open(page, `/p/?${log.id}`);
  await expect.poll(() => patched.length).toBe(1);
  expect(patched[0].body).toEqual({ ol_id: 'OL5W' });
  // someone else's log: nothing
  patched.length = 0;
  await open(page, `/p/?${LOGS[0].id}`);
  expect(patched).toEqual([]);
  // your own shelf's page (its spines: The Waves, then Journey by Moonlight): the one the Worker knows gets its id
  const shelf = SHELVES[0];
  patched.length = 0;
  await open(page, `/u/?tester&shelf=${shelf.id}`);
  await expect.poll(() => patched.length).toBe(1);
  expect(patched[0].url).toContain(`shelf_id=eq.${shelf.id}`);
  expect(patched[0].url).toContain('position=eq.0');
  expect(patched[0].body).toEqual({ ol_id: 'OL99W' });
  // someone else's shelf: nothing
  patched.length = 0;
  await open(page, `/u/?mira&shelf=${SHELVES[1].id}`);
  expect(patched).toEqual([]);
});

test('a link\'s id that isn\'t the title the rows have fills nothing in', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, ids: true });
  const patched = [];
  page.on('request', r => { if (r.method() === 'PATCH') patched.push(r.url()); });
  // the Worker says 106 is Gummo, but the link says Just Kids
  await open(page, '/t/?film=106&title=Just%20Kids&year=2010');
  await page.waitForTimeout(300);
  expect(patched).toEqual([]);
});
