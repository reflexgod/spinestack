// + ADD's three choices: Log it, the one it opens on (the cover as the feed will show it, a caption, Post), Put on shelf, and
// Watchlist (Add to watchlist). Log it and Watchlist never search for spines, and need an account with a username.
const { test, expect } = require('@playwright/test');
const { SB_URL, CORS, mockNetwork, watchErrors, open } = require('../site');

const dialog = page => page.locator('#addDialog');   // the Add dialog (a page's sign-in sheet is a dialog too)
const choices = page => dialog(page).getByRole('radiogroup', { name: 'What to do with it' }).getByRole('radio');
async function pick(page, choice, q = 'gummo', title = /Gummo/){
  await page.locator('header.top .add').click();
  if (choice) await dialog(page).getByRole('radio', { name: choice }).check();
  await dialog(page).getByRole('combobox', { name: 'Film or book name' }).fill(q);
  await dialog(page).getByRole('option', { name: title }).click();
}
const sent = (page, table) => page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/' + table);
// the database answering a write with an error, as PostgREST does
const refuse = (page, table, status, body) => page.route(u => u.origin === SB_URL && u.pathname === '/rest/v1/' + table, route => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  return route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
});

test('three choices, Log it first and picked (logging is posting); the dialog\'s title says which', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await expect(choices(page)).toHaveCount(3);
  for (const [i, name] of ['Log it', 'Put on shelf', 'Add to Up next'].entries()) await expect(choices(page).nth(i)).toHaveAccessibleName(name);
  await expect(choices(page).first()).toBeChecked();
  await expect(dialog(page)).toHaveAccessibleName('What did you watch or read?');   // no ellipsis on a title: it reads as cut off
  await expect(dialog(page).getByRole('combobox', { name: 'Film or book name' })).toBeFocused();
  for (const [choice, title] of [['Put on shelf', 'Add to your shelf'], ['Add to Up next', 'Add to Up next'], ['Log it', 'What did you watch or read?']]) {
    await dialog(page).getByRole('radio', { name: choice }).check();
    await expect(dialog(page)).toHaveAccessibleName(title);
  }
  // ← → move between them, as radio buttons do
  await choices(page).first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog(page).getByRole('radio', { name: 'Put on shelf' })).toBeChecked();
  expect(errors).toEqual([]);
});

test('Log it: the cover as the feed shows it, an optional caption, and Post; no spine is searched for', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page, { signedIn: true });
  let scans = 0; page.on('request', r => { if (r.url().includes('/scans?')) scans++; });
  await open(page, '/u/?mira');
  await pick(page, 'Log it');
  const d = dialog(page);
  await expect(d.locator('#addPostTitle')).toHaveText('Gummo (1997)');
  await expect(d.locator('#addPostBy')).toHaveText('· Harmony Korine');
  await expect(d.locator('#addFeedLine')).toHaveText('On the feed: @tester watched Gummo · today');
  // the cover: worn as it is on the day, dog-eared, nothing written on it
  const cover = d.locator('#addCov canvas');
  await expect(cover).toHaveAttribute('aria-label', 'The cover of Gummo, as the feed shows it');
  expect(+(await cover.getAttribute('data-fade'))).toBeLessThan(.06);
  const say = d.getByRole('textbox', { name: /Caption/ });
  await expect(say).toHaveAttribute('maxlength', '280');
  await expect(d.getByRole('button', { name: 'Add to shelf' })).toBeHidden();
  await expect(d.getByRole('radiogroup', { name: 'Which spine' })).toBeHidden();
  // with a caption
  await say.fill('  Saw it at the Prince Charles.  ');
  const req = sent(page, 'logs');
  await d.getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg', caption: 'Saw it at the Prince Charles.' });
  await expect(d).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Logged Gummo. It’s on the feed.');
  // a book is "read", and the caption can be left out
  await pick(page, 'Log it', 'just kids', /Just Kids/);
  await expect(d.locator('#addFeedLine')).toHaveText('On the feed: @tester read Just Kids · today');
  await expect(say).toHaveValue('');   // a new log starts with no caption
  const req2 = sent(page, 'logs');
  await d.getByRole('button', { name: 'Post' }).click();
  expect((await req2).postDataJSON()).toMatchObject({ kind: 'book', title: 'Just Kids', year: 2010, caption: '' });
  expect(scans).toBe(0);
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

test('Watchlist: the cover and Add to watchlist; the database\'s answers when it\'s full or already there', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await pick(page, 'Add to Up next');
  const d = dialog(page);
  await expect(d.locator('#addCov img')).toHaveAttribute('alt', 'The cover of Gummo');
  await expect(d.getByRole('textbox', { name: /Caption/ })).toBeHidden();
  await expect(d.locator('#addCov canvas.worn')).toHaveCount(0);   // clean: wear is only for a log
  await expect(d.locator('#addFeedLine')).toHaveText('It shows on your profile, under Up next, which holds 6.');
  const req = sent(page, 'watchlist');
  await d.getByRole('button', { name: 'Add to Up next' }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg' });
  await expect(d).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Gummo is in Up next.');
  // full: the database says so, and the dialog stays open with it
  await refuse(page, 'watchlist', 400, { code: 'P0001', message: 'Your watchlist holds 6. Log one or remove one first.' });
  await pick(page, 'Add to Up next');
  await d.getByRole('button', { name: 'Add to Up next' }).click();
  await expect(d.locator('#addStatus')).toHaveText('Up next is full (6). Remove one to add another.');
  await expect(d).toBeVisible();
  await expect(d.getByRole('button', { name: 'Add to Up next' })).toBeEnabled();
  // already on it
  await refuse(page, 'watchlist', 409, { code: '23505', message: 'duplicate key value violates unique constraint "watchlist_one_each"' });
  await d.getByRole('button', { name: 'Add to Up next' }).click();
  await expect(d.locator('#addStatus')).toHaveText('It’s already in Up next.');
  expect(errors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);   // the browser logs the 400 and 409 itself
});

test('a title picked keeps its place when the choice changes', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await pick(page, 'Log it');
  const d = dialog(page);
  await expect(d.getByRole('button', { name: 'Post' })).toBeVisible();
  await d.getByRole('radio', { name: 'Put on shelf' }).check();
  await expect(d.getByRole('radiogroup', { name: 'Which spine' }).getByRole('radio')).toHaveCount(2);   // its spines, as before
  await expect(d.getByRole('button', { name: 'Post' })).toBeHidden();
  await d.getByRole('radio', { name: 'Add to Up next' }).check();
  await expect(d.getByRole('button', { name: 'Add to Up next' })).toBeVisible();
  await expect(d.locator('#addPostTitle')).toHaveText('Gummo (1997)');
  // Change: back to the results
  await d.getByRole('button', { name: 'Change' }).click();
  await expect(d.getByRole('option')).toHaveCount(1);
  await expect(d.getByRole('button', { name: 'Add to Up next' })).toBeHidden();
});

// Signed out the site is read only: + ADD is the sign-in sheet, not the Add dialog, and nothing is searched for
test('signed out, + ADD goes to make/ (a shelf with no account), and nothing is searched for on the way', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page);
  for (const path of ['/', '/feed/?everyone', '/shelves/', '/people/', '/u/?mira', '/u/?mira&shelf']) {
    await open(page, path);
    await page.locator('header.top .add').click();
    await expect(page, path).toHaveURL(/\/make\/$/);
    await expect(page.locator('#signSheet, #sheet').filter({ visible: true })).toHaveCount(0);
  }
  expect(net.asked).toEqual([]);
  expect(errors).toEqual([]);
});

test('signed in with no username yet, Log it asks for one first', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, named: false });
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await dialog(page).getByRole('radio', { name: 'Log it' }).check();
  await expect(dialog(page).locator('#addNeed')).toHaveText('Pick a username first. Pick one');
  await dialog(page).getByRole('button', { name: 'Pick one' }).click();
  await expect(page).toHaveURL(/\/build\/$/);   // where a username is picked
});

test('a database without logs (0007 not run on it): Post says logging isn\'t open yet', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, logs: false });
  await open(page, '/feed/?everyone');
  await pick(page, 'Log it');
  await dialog(page).getByRole('button', { name: 'Post' }).click();
  await expect(dialog(page).locator('#addStatus')).toHaveText('Logging isn’t open yet. Try again soon.');
  await dialog(page).getByRole('radio', { name: 'Add to Up next' }).check();
  await dialog(page).getByRole('button', { name: 'Add to Up next' }).click();
  await expect(dialog(page).locator('#addStatus')).toHaveText('Up next isn’t open yet. Try again soon.');
});

test('Watchlist after Log it: the picked title\'s cover turns clean, with no wear and no dog-ear', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await pick(page, 'Log it');
  const d = dialog(page);
  await expect(d.locator('#addCov canvas.worn')).toHaveCount(1);   // a log: as the feed shows it
  await d.getByRole('radio', { name: 'Add to Up next' }).check();
  await expect(d.locator('#addCov img')).toHaveAttribute('alt', 'The cover of Gummo');
  await page.waitForTimeout(300);   // a worn cover still on its way doesn't come back over it
  await expect(d.locator('#addCov canvas')).toHaveCount(0);
});
