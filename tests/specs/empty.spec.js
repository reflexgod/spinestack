// A site with nothing on it yet: no public shelves. Home's spine wall shows the sample shelf, and shelves, people and
// the feed each say so in a line.
const { test, expect } = require('@playwright/test');
const { mockNetwork, watchErrors, open } = require('../site');

test('signed-out home with no shelves: the sample shelf on the wall\'s line, "a shelf, for example"', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { empty: true });
  await open(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shelve the films and books you love, with their real spines.');
  const img = page.locator('#sample');
  await expect(img).toBeVisible();
  await expect(page.locator('#wallCap')).toHaveText('a shelf, for example');
  await expect(img).toHaveAttribute('src', 'sample-shelf.jpg');
  await expect(img).toHaveAttribute('alt', /The Waves/);
  await expect.poll(() => img.evaluate(im => im.complete && im.naturalWidth)).toBe(440);   // the picture is in the repo, and loads
  // whole, in the middle of the strip, standing on its line, above the line of text and the button
  const make = await page.locator('#start').boundingBox(), pic = await img.boundingBox(), strip = await page.locator('#spines').boundingBox();
  expect(pic.y).toBeGreaterThanOrEqual(strip.y); expect(pic.y + pic.height).toBeLessThanOrEqual(strip.y + strip.height);
  expect(Math.abs(pic.y + pic.height - (strip.y + strip.height - 1))).toBeLessThanOrEqual(1);
  expect(pic.width / pic.height).toBeCloseTo(440 / 733, 1);
  expect(Math.abs(pic.x + pic.width / 2 - (strip.x + strip.width / 2))).toBeLessThanOrEqual(1);
  expect(make.y).toBeGreaterThan(strip.y + strip.height);
  await expect(page.locator('#spines a')).toHaveCount(0);
  await expect(page.locator('#outJust')).toBeHidden();
  await expect(page.locator('#stackersSec')).toBeHidden();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('with shelves on the site, home has no sample shelf', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/');
  await expect(page.locator('#spines a').first()).toBeVisible();
  await expect(page.locator('#sample')).toBeHidden();
  await expect(page.locator('#wallCap')).toBeHidden();
});

test('shelves, people and the feed each say it in one line when there is nothing yet', async ({ page }) => {
  await mockNetwork(page, { empty: true });
  await open(page, '/shelves/');
  await expect(page.locator('#none')).toHaveText('No public shelves yet.');
  await expect(page.locator('#grid li')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load more' })).toBeHidden();
  await expect(page.locator('main').getByRole('link', { name: 'Make a shelf' })).toBeVisible();   // the way to be the first
  await open(page, '/people/');
  await expect(page.locator('#activeState')).toHaveText('No one here yet.');
  await expect(page.locator('#active li')).toHaveCount(0);
  await open(page, '/feed/?everyone');
  await expect(page.locator('#none')).toHaveText('Nothing on the feed yet.');
});
