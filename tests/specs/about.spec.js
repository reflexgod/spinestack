// The About page (/about/): what shelfstackd is in five short lines, who made it, and the credits; every page's
// footer's About goes there.
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const { ROOT, PAGES, OTHER_PAGES, mockNetwork, watchErrors, open } = require('../site');

test('About: five short lines, who made it, the credits', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, {});
  await open(page, '/about/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About shelfstackd');
  const lines = page.locator('.what li');
  await expect(lines).toHaveCount(5);
  for (const t of await lines.allTextContents()) {
    expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(16);   // short
    expect(t, t).not.toMatch(/[—–!]/);
  }
  await expect(page.getByRole('heading', { name: 'Who made it' })).toBeVisible();
  await expect(page.getByRole('link', { name: '@viraaj' })).toHaveAttribute('href', '../u/?viraaj');
  await expect(page.locator('#credits')).toHaveText('Credits');
  await expect(page.locator('img.tmdb')).toBeVisible();
  await expect(page.getByText('This product uses the TMDB API but is not endorsed or certified by TMDB.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('every page\'s footer: About goes to the About page', async ({ page }) => {
  await mockNetwork(page, {});
  for (const pg of [...PAGES, ...OTHER_PAGES.filter(p => p.name !== 'admin')]) {
    await open(page, pg.path);
    const about = page.locator('footer').getByRole('link', { name: 'About' });
    expect(new URL(await about.evaluate(a => a.href)).pathname, pg.name).toBe('/about/');
  }
  // and in the source of every page, none points at the old Credits on privacy.html
  for (const f of ['index.html', '404.html', 'privacy.html', ...['build', 'feed', 'people', 'settings', 'shelves', 'u', 'p', 't', 'notifications'].map(d => d + '/index.html')])
    expect(fs.readFileSync(path.join(ROOT, f), 'utf8'), f).not.toContain('privacy.html#credits');
});
