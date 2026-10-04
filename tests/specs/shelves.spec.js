// Shelves (/shelves/): Make a shelf (Edit your shelf, signed in), then every public shelf as its spines on a line, 24 at a
// time, Load more.
const { test, expect } = require('@playwright/test');
const { SHELVES, SB_URL, CORS, feedRow, mockNetwork, watchErrors, open, putAside } = require('../site');

test('Shelves, signed out: the title, Make a shelf, and every public shelf as its spines on a thin line, no card', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page);
  await open(page, '/shelves/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shelves');
  const start = page.locator('main').getByRole('link', { name: 'Make a shelf' });
  await expect(start).toHaveAttribute('href', '../build/');
  await expect(page.locator('header.top .links').getByRole('link', { name: 'Shelves', exact: true })).toHaveAttribute('aria-current', 'page');
  const cards = page.locator('#grid li');
  await expect(cards).toHaveCount(18);
  await expect(page.getByRole('button', { name: 'Load more' })).toBeHidden();   // fewer than 24: that's all of them
  const first = cards.first();
  await expect(first.locator('a')).toHaveAttribute('href', `../u/?tester&shelf=${SHELVES[0].id}`);
  await expect(first.locator('.cap')).toHaveText('a much longer shelf name that has to be cut short');
  await expect(first.locator('.by')).toHaveText('@tester');
  // its spines (bare.js), standing on a 1px black line 96px under their tops; no picture, no panel, no box
  const line = first.locator('.sl');
  await expect(line.locator('canvas').first()).toBeVisible();
  await expect(first.locator('img')).toHaveCount(0);
  expect(await line.evaluate(el => { const s = getComputedStyle(el); return [Math.round(el.getBoundingClientRect().height), s.borderBottomWidth, s.borderBottomColor, s.backgroundColor].join(' '); }))
    .toBe('96 1px rgb(0, 0, 0) rgba(0, 0, 0, 0)');   // the line inside the 96px
  expect(await first.locator('a').evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
  await start.click();
  await expect(page.locator('#signSheet')).toBeVisible();   // signed out: sign in first (the site is read only)
  await expect(page.locator('#signSheet .sheetbox p:not(.note)').first()).toHaveText('Sign in to start your shelf.');
  await expect(page).toHaveURL(/\/shelves\/$/);
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

// Signed out, nothing here says "your": the button is Make a shelf, black as on home, and the bar's + is outlined.
// Signed in, it's Edit your shelf, plain grey text, and + ADD is solid black
const bg = el => getComputedStyle(el).backgroundColor;
test('Shelves: signed out, Make a shelf in black, and no "Edit your shelf"', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/shelves/');
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: 'Make a shelf' })).toBeVisible();
  await expect(main.getByText(/your shelf/i)).toHaveCount(0);
  expect(await main.getByRole('link', { name: 'Make a shelf' }).evaluate(bg)).toBe('rgb(0, 0, 0)');
  expect(await page.locator('header.top .add').evaluate(bg)).toBe('rgb(0, 0, 0)');   // solid black too: two looks, solid or plain text
});
test('Shelves: signed in, Edit your shelf is plain grey text, and + ADD is solid black', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/shelves/');
  const mine = page.locator('main').getByRole('link', { name: 'Edit your shelf' });
  await expect(mine).toHaveAttribute('href', '../build/');
  await expect(page.locator('main').getByRole('link', { name: 'Make a shelf' })).toHaveCount(0);
  expect(await mine.evaluate(bg)).toBe('rgba(0, 0, 0, 0)');
  expect(await mine.evaluate(el => getComputedStyle(el).color)).toBe('rgb(107, 107, 107)');
  expect(await page.locator('header.top .add').evaluate(bg)).toBe('rgb(0, 0, 0)');
});

test('Shelves: 24 at a time; Load more asks for the ones after the last shown', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  // thirty shelves, newest first
  const all = Array.from({ length: 30 }, (_, i) => ({ ...feedRow(SHELVES[i % SHELVES.length]), shelf_id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, '0')}`,
    saved_at: new Date(Date.UTC(2026, 8, 30, 12) - i * 3600e3).toISOString() }));
  const asked = [];
  await page.route(u => u.origin === SB_URL && u.pathname === '/rest/v1/rpc/feed', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON(); asked.push(body);
    const from = body.before_id ? all.findIndex(r => r.shelf_id === body.before_id) + 1 : 0;
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(all.slice(from, from + body.n)) });
  });
  await open(page, '/shelves/');
  const cards = page.locator('#grid li'), more = page.getByRole('button', { name: 'Load more' });
  await expect(cards).toHaveCount(24);
  expect(asked[0]).toEqual({ scope: 'everyone', before: null, before_id: null, n: 24 });
  await expect(more).toBeVisible();
  await more.click();
  await expect(cards).toHaveCount(30);
  expect(asked[1]).toEqual({ scope: 'everyone', before: all[23].saved_at, before_id: all[23].shelf_id, n: 24 });
  await expect(more).toBeHidden();
  await expect(cards.nth(24).locator('a')).toBeFocused();   // the keyboard goes on from the first new card
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
});

test('Shelves, signed out: Make a shelf, then signing in, goes on to the builder', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  const signBack = await putAside(page);
  await open(page, '/shelves/');
  await page.locator('main').getByRole('link', { name: 'Make a shelf' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
  await signBack(); await page.reload();
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf');
});

// New shelf, to build/?new: on the Shelves page signed in, at the top of your own Shelves tab, and in + ADD's ▾
test('New shelf: on Shelves, on your own Shelves tab (not someone else\'s), and in + ADD\'s menu', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/shelves/');
  await expect(page.locator('main').getByRole('link', { name: 'New shelf' })).toHaveAttribute('href', '../build/?new');
  await open(page, '/u/?tester#shelves');
  const mine = page.locator('#panelS').getByRole('link', { name: 'New shelf' });
  await expect(mine).toHaveAttribute('href', '../build/?new');
  const top = await mine.boundingBox(), list = await page.locator('#sList').boundingBox();
  expect(top.y).toBeLessThan(list.y);   // at the top of the list
  await open(page, '/u/?mira#shelves');
  await expect(page.locator('#sList li').first()).toBeVisible();
  await expect(page.locator('#panelS').getByRole('link', { name: 'New shelf' })).toBeHidden();
  await open(page, '/feed/');
  await page.locator('#addMore').click();
  await expect(page.getByRole('menu', { name: 'More ways to add' }).getByRole('menuitem', { name: 'New shelf' })).toHaveAttribute('href', /\/build\/\?new$/);
});
test('signed out, the Shelves page has no New shelf', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/shelves/');
  await expect(page.locator('main').getByRole('link', { name: 'New shelf' })).toBeHidden();
});
