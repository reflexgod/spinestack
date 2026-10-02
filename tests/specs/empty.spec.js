// A site with nothing on it yet: no public shelves. Home shows one sample shelf, and shelves, members and the feed each
// say so in a line.
const { test, expect } = require('@playwright/test');
const { mockNetwork, watchErrors, open } = require('../site');

test('signed-out home with no shelves: one sample shelf under the hero, "a shelf, for example"', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { empty: true });
  await open(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf, but the real spines.');
  const sample = page.locator('#sample');
  await expect(sample).toBeVisible();
  await expect(sample.locator('figcaption')).toHaveText('a shelf, for example');
  const img = sample.locator('img');
  await expect(img).toHaveAttribute('src', 'sample-shelf.jpg');
  await expect(img).toHaveAttribute('alt', /The Waves/);
  await expect.poll(() => img.evaluate(im => im.complete && im.naturalWidth)).toBe(440);   // the picture is in the repo, and loads
  // under the hero's button, in the middle of the page
  const make = await page.locator('#start').boundingBox(), pic = await img.boundingBox(), main = await page.locator('main').boundingBox();
  expect(pic.y).toBeGreaterThan(make.y + make.height);
  expect(Math.abs(pic.x + pic.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(1);
  await expect(page.locator('#heroRow li')).toHaveCount(0);
  await expect(page.locator('#outJust')).toBeHidden();
  await expect(page.locator('#stackersSec')).toBeHidden();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('with shelves on the site, home has no sample shelf', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/');
  await expect(page.locator('#heroRow li')).toHaveCount(6);
  await expect(page.locator('#sample')).toBeHidden();
});

test('shelves, members and the feed each say it in one line when there is nothing yet', async ({ page }) => {
  await mockNetwork(page, { empty: true });
  await open(page, '/shelves/');
  await expect(page.locator('#none')).toHaveText('Nothing shelved yet. The first shelf here could be yours.');
  await expect(page.locator('#grid li')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load more' })).toBeHidden();
  await expect(page.locator('main').getByRole('link', { name: 'Your shelf' })).toBeVisible();   // the way to be the first
  await open(page, '/members/');
  await expect(page.locator('#activeState')).toHaveText('It’s quiet in here. Shelve something and yours is the first face on this page.');
  await expect(page.locator('#active li')).toHaveCount(0);
  await open(page, '/feed/?everyone');
  await expect(page.locator('#none')).toHaveText('Nothing shelved yet. The first shelf here could be yours.');
});
