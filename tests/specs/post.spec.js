// Logging is posting (post.js). The feed's composer, "What did you watch or read?": search, pick, the fields, Post. The
// same fields in + ADD's Log it, which is now the choice it opens on (but on the builder). And a Log button on every
// title on a shelf's page and on someone's Activity. With migration 0009 (mockNetwork's social) the fields are the
// stars, a review of 2,000, Spoilers, Rewatch and the day; without it, a caption of 280, as before.
const { test, expect } = require('@playwright/test');
const { SHELVES, mockNetwork, watchErrors, open } = require('../site');

const composer = page => page.locator('#compose');
const posted = page => page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/logs');
async function pickIn(box, q = 'gummo', title = /Gummo/){
  await box.getByRole('combobox').fill(q);
  await box.getByRole('option', { name: title }).click();
}

test('the feed, signed in: "What did you watch or read?" at the top; pick a title, write a caption, Post', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const c = composer(page);
  await expect(c).toBeVisible();
  await expect(c.getByText('What did you watch or read?')).toBeVisible();
  const box = c.getByRole('combobox', { name: 'What did you watch or read?' });
  await expect(box).toBeVisible();
  // above the tabs
  expect((await c.boundingBox()).y).toBeLessThan((await page.getByRole('tablist', { name: 'Feed' }).boundingBox()).y);
  await pickIn(c);
  await expect(c.locator('.ct')).toHaveText('Gummo (1997)');
  await expect(c.locator('.ccov canvas')).toHaveAttribute('aria-label', 'The cover of Gummo, as the feed will show it');
  // without 0009: a caption of 280, and nothing else
  const say = c.getByRole('textbox', { name: 'Caption (optional)' });
  await expect(say).toHaveAttribute('maxlength', '280');
  await expect(c.getByRole('slider')).toHaveCount(0);
  await expect(c.getByRole('checkbox')).toHaveCount(0);
  await say.fill('The bathtub scene.');
  const req = posted(page), again = page.waitForRequest(r => r.url().includes('/rpc/activity'));
  await c.getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg', caption: 'The bathtub scene.' });
  expect((await again).postDataJSON()).toMatchObject({ scope: 'everyone', before_id: null });   // the feed from the top, with it there
  await expect(page.locator('#toast')).toHaveText('Logged Gummo. It’s on the feed.');
  await expect(box).toBeVisible();   // ready for the next
  await expect(box).toHaveValue('');
  expect(errors).toEqual([]);
});

test('signed out, or with no username yet, there is no composer', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/feed/?everyone');
  await expect(composer(page)).toBeHidden();
  await mockNetwork(page, { signedIn: true, named: false });
  await open(page, '/feed/?everyone');
  await expect(composer(page)).toBeHidden();
});

test('with 0009: half stars, a review of 2,000, Spoilers, Rewatch and the day; all of it is posted', async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(new Date('2026-10-04T15:00:00'));
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const c = composer(page);
  await pickIn(c);
  const stars = c.getByRole('slider', { name: 'Rating' });
  await expect(stars).toHaveAttribute('aria-valuetext', 'No rating');
  // the keyboard: a half star a press
  await stars.focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  await expect(stars).toHaveAttribute('aria-valuetext', '3.5 stars');
  await expect(stars).toHaveAttribute('aria-valuenow', '7');
  // a press on a star's left half is half a star, on its right half the whole star; the same again clears it
  const fifth = stars.locator('svg').nth(4), b = await fifth.boundingBox();
  await page.mouse.click(b.x + b.width * .8, b.y + b.height / 2);
  await expect(stars).toHaveAttribute('aria-valuetext', '5 stars');
  await page.mouse.click(b.x + b.width * .8, b.y + b.height / 2);
  await expect(stars).toHaveAttribute('aria-valuetext', 'No rating');
  const second = await stars.locator('svg').nth(1).boundingBox();
  await page.mouse.click(second.x + second.width * .2, second.y + second.height / 2);
  await expect(stars).toHaveAttribute('aria-valuetext', '1.5 stars');
  await c.getByRole('button', { name: 'Clear' }).click();
  await expect(stars).toHaveAttribute('aria-valuetext', 'No rating');
  await stars.focus(); await page.keyboard.press('End'); await page.keyboard.press('ArrowLeft');
  await expect(stars).toHaveAttribute('aria-valuetext', '4.5 stars');
  const review = c.getByRole('textbox', { name: 'Review (optional)' });
  await expect(review).toHaveAttribute('maxlength', '2000');
  await review.fill('x'.repeat(300));   // longer than a caption could be
  await c.getByRole('checkbox', { name: 'Spoilers' }).check();
  await c.getByRole('checkbox', { name: 'Rewatch' }).check();
  const day = c.getByLabel('Watched on');
  await expect(day).toHaveValue('2026-10-04');   // today, here
  await expect(day).toHaveAttribute('max', '2026-10-04');
  await day.fill('2026-09-28');
  const req = posted(page);
  await c.getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg',
    review: 'x'.repeat(300), rating: 9, spoiler: true, rewatch: true, watched_on: '2026-09-28' });
  expect(errors).toEqual([]);
});

test('a book says Reread and Read on', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  await pickIn(composer(page), 'the waves', /The Waves.*Book/);
  await expect(composer(page).getByRole('checkbox', { name: 'Reread' })).toBeVisible();
  await expect(composer(page).getByLabel('Read on')).toBeVisible();
});

test('+ ADD opens on Log it, with the same fields as the feed\'s composer', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/shelves/');
  await page.locator('header.top .add').click();
  const d = page.getByRole('dialog', { name: 'What did you watch or read?' });
  await expect(d.getByRole('radio', { name: 'Log it' })).toBeChecked();
  await pickIn(d);
  await expect(d.getByRole('slider', { name: 'Rating' })).toBeVisible();
  await d.getByRole('slider', { name: 'Rating' }).focus();
  await page.keyboard.press('End');
  await d.getByRole('textbox', { name: 'Review (optional)' }).fill('Again.');
  await d.getByRole('checkbox', { name: 'Rewatch' }).check();
  const req = posted(page);
  await d.getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toMatchObject({ title: 'Gummo', review: 'Again.', rating: 10, rewatch: true, spoiler: false });
  await expect(d).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Logged Gummo. It’s on the feed.');
});

test('on the builder + ADD still opens on Put on shelf', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  await expect(page.getByRole('dialog', { name: 'Add to your shelf' }).getByRole('radio', { name: 'Put on shelf' })).toBeChecked();
});

test('a Log button on every title: on a shelf\'s page, and on someone\'s Activity; it opens Log it on that title', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?mira&shelf=${SHELVES.find(s => s.owner === '22222222-2222-4222-8222-222222222222').id}`);
  const rows = page.locator('#oneItems li');
  await expect(rows.first().getByRole('button', { name: 'Log' })).toBeVisible();
  await rows.first().getByRole('button', { name: 'Log' }).click();
  const d = page.getByRole('dialog', { name: 'What did you watch or read?' });
  await expect(d.locator('#addPostTitle')).toHaveText('The Waves (1931)');
  await expect(d.getByRole('textbox', { name: 'Caption (optional)' })).toBeFocused();
  await page.keyboard.press('Escape');
  await open(page, '/u/?mira#activity');
  const log = page.locator('#acts .item.log').first();
  await expect(log.getByRole('link', { name: 'Gummo' })).toHaveAttribute('href', /\/p\/\?bbbbbbbb-bbbb-4bbb-8bbb-000000000000$/);
  await log.getByRole('button', { name: 'Log' }).click();
  await expect(d.locator('#addPostTitle')).toHaveText('Gummo (1997)');
});

test('signed out, Log is the sign-in sheet', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/u/?mira#activity');
  await page.locator('#acts .item.log').first().getByRole('button', { name: 'Log' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
});
