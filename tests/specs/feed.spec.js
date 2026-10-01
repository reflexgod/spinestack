// The feed (/feed/): Following · You · Everyone, a line for each shelf saved ("@abc shelved my films · 2h") with its card.
const { test, expect } = require('@playwright/test');
const { SHELVES, mockNetwork, watchErrors, open } = require('../site');

// the made-up shelves were saved at noon on 30 Sep 2026 and on each day before it: two hours later, the newest says 2h
const NOW = new Date('2026-09-30T14:00:00Z');
const lines = page => page.locator('#items .line');
const tabs = page => page.getByRole('tablist', { name: 'Feed' }).getByRole('tab');

test('the tabs are Following · You · Everyone; signed in it opens on Following', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/');
  await expect(tabs(page)).toHaveText(['Following', 'You', 'Everyone']);
  await expect(page.getByRole('tab', { name: 'Following' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/feed\/\?following$/);
  await expect(lines(page)).toHaveCount(6);   // only @mira is followed
  for (const t of await lines(page).allTextContents()) expect(t).toMatch(/^@mira (shelved|updated) /);
  expect(errors).toEqual([]);
});

test('a line says who shelved what and how long ago, and the shelf\'s card is under it', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await expect(lines(page)).toHaveCount(18);
  const text = (await lines(page).allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
  expect(text[0]).toBe('@tester shelved a much longer shelf name that has to be cut short · 2h');
  expect(text[1]).toBe('@mira shelved shelf number 1 · 1d');
  expect(text[3]).toBe('@tester shelved shelf number 3 · 3d');
  expect(text[4]).toBe('@mira updated untitled shelf · 4d');   // saved again later than it was made
  expect(text[7]).toBe('@mira shelved shelf number 7 · 1w');
  expect(text[17]).toBe('@longusername_twenty1 shelved shelf number 17 · 2w');
  // the name is a link to the person, the shelf's a link to the shelf, and so is its card
  const first = page.locator('#items .item').first();
  await expect(first.locator('.line a').first()).toHaveAttribute('href', '../u/?tester');
  await expect(first.locator('.line a').nth(1)).toHaveAttribute('href', `../u/?tester&shelf=${SHELVES[0].id}`);
  await expect(first.locator('.pic')).toHaveAttribute('href', `../u/?tester&shelf=${SHELVES[0].id}`);
  await expect(first.locator('time')).toHaveAttribute('datetime', SHELVES[0].saved_at);
});

test('You: your own shelves, said as "You shelved…", kept on reload', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/');
  await page.getByRole('tab', { name: 'You' }).click();
  await expect(page.getByRole('tab', { name: 'You' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/feed\/\?you$/);
  await expect(lines(page)).toHaveCount(6);
  for (const t of await lines(page).allTextContents()) expect(t).toMatch(/^You (shelved|updated) /);   // updated: saved again later than it was made
  await expect(page.locator('#items .pic').first()).toHaveAttribute('href', /\/u\/\?tester&shelf=/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'You' })).toHaveAttribute('aria-selected', 'true');
  await expect(lines(page)).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('signed out: Everyone shows; Following and You ask you to sign in', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/feed/');
  await expect(page.getByRole('tab', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true');
  await expect(lines(page)).toHaveCount(18);
  for (const [tab, says] of [['You', /to see your own shelves here/], ['Following', /to see shelves from people you follow/]]) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(lines(page)).toHaveCount(0);
    await expect(page.locator('#none')).toHaveText(says);
  }
  await page.locator('#none').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
});

test('← and → move between the tabs', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?following');
  await page.getByRole('tab', { name: 'Following' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'You' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'You' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true');
});
