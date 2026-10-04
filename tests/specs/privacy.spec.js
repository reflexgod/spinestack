// privacy.html says what the site does now: follows, the feed, logs and the watchlist, private profiles, settings and
// photo uploads.
const { test, expect } = require('@playwright/test');
const { mockNetwork, watchErrors, open } = require('../site');

test('the privacy page covers follows, the feed, private profiles, settings and photos, in sections', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page);
  await open(page, '/privacy.html');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Short version', 'Who can have an account', 'What we keep', 'Who can see it', 'Private shelves and private profiles',
    'Settings', 'Your photo', 'Where it’s kept', 'On your device', 'Other services', 'Removing it', 'Contact', 'Credits'].map(h => new RegExp('^' + h.replace('’', '[’\']') + '$', 'i')));
  const text = await page.locator('main').innerText();
  for (const says of ['The feed.', '@you shelved my films · 2h', 'Logs.', '@you watched Gummo · today', 'only ever shown to you', 'Your Up next', 'Recently active.', 'Being found.', 'Network tab', 'A private shelf.', 'A private profile.', 'Follow requests.',
    'Switch on Private profile in Settings, under Account', '400 by 400', 'removes its location and camera data', 'Signing out signs out this device only', 'within 7 days'])
    expect(text, says).toContain(says);
  expect(text).not.toContain('—');
  expect(text).toContain('Making a shelf needs an account, and so does sharing it as a story');
  expect(text).not.toMatch(/save a story|use everything on the site without an account/);   // a story comes from a saved shelf now
  expect(text).not.toMatch(/Edit profile|coming soon/i);   // the sheet that Settings replaced, and promises
  await expect(page.locator('main').getByRole('link', { name: 'Settings' }).first()).toHaveAttribute('href', 'settings/#account');
  await expect(page.locator('.ptop').getByRole('link', { name: 'Feed' })).toHaveAttribute('href', 'feed/');
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('Credits, where About in every footer goes: TMDB\'s line and logo, Open Library and Search by Brave', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page);
  await open(page, '/privacy.html#credits');
  const heading = page.getByRole('heading', { level: 2, name: 'Credits' });
  await expect(heading).toHaveAttribute('id', 'credits');
  await expect(heading).toBeInViewport();
  // everything after the heading is the credits
  const credits = await page.evaluate(() => { let el = document.getElementById('credits'), text = ''; while ((el = el.nextElementSibling)) text += ' ' + el.textContent; return text.replace(/\s+/g, ' ').trim(); });
  expect(credits).toBe('Film data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Book data from Open Library. Search by Brave.');
  // TMDB's logo, as their attribution rules ask: their own file, kept in the repo, small, over their sentence
  const logo = page.getByRole('img', { name: 'TMDB' });
  await expect(logo).toHaveAttribute('src', 'tmdb.svg');
  await expect.poll(() => logo.evaluate(im => im.complete && im.naturalWidth > 0)).toBe(true);
  const at = await logo.boundingBox(), line = await page.getByText('This product uses the TMDB API').boundingBox();
  expect(Math.round(at.height)).toBe(14);
  expect(at.width / at.height).toBeCloseTo(273.42 / 35.52, 1);   // not squashed
  expect(at.y + at.height).toBeLessThanOrEqual(line.y);
  const svg = require('fs').readFileSync(require('path').join(require('../site').ROOT, 'tmdb.svg'), 'utf8');
  expect(svg).toContain('#90cea1'); expect(svg).toContain('#00b3e5');   // their colours, unchanged
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: 'Open Library' })).toHaveAttribute('href', 'https://openlibrary.org/');
  await expect(main.getByRole('link', { name: 'Search by Brave' })).toHaveAttribute('href', 'https://search.brave.com/');
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});
