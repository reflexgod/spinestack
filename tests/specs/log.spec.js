// + ADD's three choices: Put on shelf (as before), Log it (the cover as the feed will show it, a caption, Post) and
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

test('three choices, Put on shelf first; the dialog\'s title says which', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await expect(choices(page)).toHaveCount(3);
  for (const [i, name] of ['Put on shelf', 'Log it', 'Watchlist'].entries()) await expect(choices(page).nth(i)).toHaveAccessibleName(name);
  await expect(choices(page).first()).toBeChecked();
  await expect(dialog(page)).toHaveAccessibleName('Add to your shelf');   // no ellipsis on a title: it reads as cut off
  await expect(dialog(page).getByRole('combobox', { name: 'Film or book name' })).toBeFocused();
  for (const [choice, title] of [['Log it', 'Log a film or book'], ['Watchlist', 'Add to your watchlist'], ['Put on shelf', 'Add to your shelf']]) {
    await dialog(page).getByRole('radio', { name: choice }).check();
    await expect(dialog(page)).toHaveAccessibleName(title);
  }
  // ← → move between them, as radio buttons do
  await choices(page).first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog(page).getByRole('radio', { name: 'Log it' })).toBeChecked();
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
  await pick(page, 'Watchlist');
  const d = dialog(page);
  await expect(d.locator('#addCov img')).toHaveAttribute('alt', 'The cover of Gummo');
  await expect(d.getByRole('textbox', { name: /Caption/ })).toBeHidden();
  await expect(d.locator('#addFeedLine')).toHaveText('It shows on your profile, under Watchlist, which holds 6.');
  const req = sent(page, 'watchlist');
  await d.getByRole('button', { name: 'Add to watchlist' }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg' });
  await expect(d).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Gummo is on your watchlist.');
  // full: the database says so, and the dialog stays open with it
  await refuse(page, 'watchlist', 400, { code: 'P0001', message: 'Your watchlist holds 6. Log one or remove one first.' });
  await pick(page, 'Watchlist');
  await d.getByRole('button', { name: 'Add to watchlist' }).click();
  await expect(d.locator('#addStatus')).toHaveText('Your watchlist is full (6). Remove one to add another.');
  await expect(d).toBeVisible();
  await expect(d.getByRole('button', { name: 'Add to watchlist' })).toBeEnabled();
  // already on it
  await refuse(page, 'watchlist', 409, { code: '23505', message: 'duplicate key value violates unique constraint "watchlist_one_each"' });
  await d.getByRole('button', { name: 'Add to watchlist' }).click();
  await expect(d.locator('#addStatus')).toHaveText('It’s already on your watchlist.');
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
  await d.getByRole('radio', { name: 'Watchlist' }).check();
  await expect(d.getByRole('button', { name: 'Add to watchlist' })).toBeVisible();
  await expect(d.locator('#addPostTitle')).toHaveText('Gummo (1997)');
  // Change: back to the results
  await d.getByRole('button', { name: 'Change' }).click();
  await expect(d.getByRole('option')).toHaveCount(1);
  await expect(d.getByRole('button', { name: 'Add to watchlist' })).toBeHidden();
});

// Signed out the site is read only: + ADD is the sign-in sheet, not the Add dialog, and nothing is searched for
test('signed out, + ADD opens the sign-in sheet ("Sign in to start your shelf."), not the Add dialog', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page);
  for (const path of ['/', '/feed/?everyone', '/shelves/', '/members/', '/u/?mira', '/u/?mira&shelf']) {
    await open(page, path);
    await page.locator('header.top .add').click();
    await expect(page.locator('#signSheet'), path).toBeVisible();
    await expect(page.locator('#signSheet .sheetbox p:not(.note)').first()).toHaveText('Sign in to start your shelf.');
    await expect(page.locator('#signSheet').getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.locator('#addDialog')).toHaveCount(0);   // add.js isn't even loaded
    await page.keyboard.press('Escape');
  }
  // the bar's own Sign in keeps the sheet's usual line
  await page.locator('#signInBtn').click();
  await expect(page.locator('#signSheet .sheetbox p:not(.note)').first()).toHaveText('Keep your shelf and everything you log on any device.');
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
  await dialog(page).getByRole('radio', { name: 'Watchlist' }).check();
  await dialog(page).getByRole('button', { name: 'Add to watchlist' }).click();
  await expect(dialog(page).locator('#addStatus')).toHaveText('The watchlist isn’t open yet. Try again soon.');
});
