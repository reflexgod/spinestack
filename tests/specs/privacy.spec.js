// privacy.html says what the site does now: follows, the feed, private profiles, settings and photo uploads.
const { test, expect } = require('@playwright/test');
const { mockNetwork, watchErrors, open } = require('../site');

test('the privacy page covers follows, the feed, private profiles, settings and photos, in sections', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page);
  await open(page, '/privacy.html');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Short version', 'Who can have an account', 'What we keep', 'Who can see it', 'Private shelves and private profiles',
    'Settings', 'Your photo', 'Where it’s kept', 'On your device', 'Other services', 'Removing it', 'Contact'].map(h => new RegExp('^' + h.replace('’', '[’\']') + '$', 'i')));
  const text = await page.locator('main').innerText();
  for (const says of ['The feed.', '@you shelved my films · 2h', 'Recently active.', 'Being found.', 'Network tab', 'A private shelf.', 'A private profile.', 'Follow requests.',
    'Switch on Private profile in Settings, under Account', '400 by 400', 'removes its location and camera data', 'Signing out signs out this device only', 'within 7 days'])
    expect(text, says).toContain(says);
  expect(text).not.toContain('—');
  expect(text).not.toMatch(/Edit profile|coming soon/i);   // the sheet that Settings replaced, and promises
  await expect(page.locator('main').getByRole('link', { name: 'Settings' }).first()).toHaveAttribute('href', 'settings/#account');
  await expect(page.locator('.ptop').getByRole('link', { name: 'Activity' })).toHaveAttribute('href', 'feed/');
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
