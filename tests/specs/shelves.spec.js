// Shelves (/shelves/): Make a shelf (Your shelf, signed in), then every public shelf as a card, 24 at a time, Load more.
const { test, expect } = require('@playwright/test');
const { SHELVES, SB_URL, CORS, feedRow, mockNetwork, watchErrors, open } = require('../site');

test('Shelves, signed out: the title, Make a shelf, and every public shelf as a card cut round its books', async ({ page }) => {
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
  await expect.poll(() => first.locator('.pic img').evaluate(im => im.style.width)).not.toBe('');   // cards.js has cut it
  const box = await first.locator('.pic').boundingBox();
  expect(box.height / box.width).toBeCloseTo(1.5, 1);
  await start.click();
  await expect(page).toHaveURL(/\/build\/$/);   // the builder: a new shelf
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

// Signed out, nothing here says "your": the button is Make a shelf, black as on home, and the bar's + is outlined.
// Signed in, it's Your shelf, outlined, and + ADD is the black one
const bg = el => getComputedStyle(el).backgroundColor;
test('Shelves: signed out, Make a shelf in black, and no "Your shelf"', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/shelves/');
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: 'Make a shelf' })).toBeVisible();
  await expect(main.getByText(/your shelf/i)).toHaveCount(0);
  expect(await main.getByRole('link', { name: 'Make a shelf' }).evaluate(bg)).toBe('rgb(0, 0, 0)');
  expect(await page.locator('header.top .add').evaluate(bg)).toBe('rgb(255, 255, 255)');   // one black button a screen
  expect(await page.locator('.btn:visible').evaluateAll(els => els.filter(e => getComputedStyle(e).backgroundColor === 'rgb(0, 0, 0)').length)).toBe(1);
});
test('Shelves: signed in, Your shelf, outlined, and + ADD is the black button', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/shelves/');
  const mine = page.locator('main').getByRole('link', { name: 'Your shelf' });
  await expect(mine).toHaveAttribute('href', '../build/');
  await expect(page.locator('main').getByRole('link', { name: 'Make a shelf' })).toHaveCount(0);
  expect(await mine.evaluate(bg)).toBe('rgb(255, 255, 255)');
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
