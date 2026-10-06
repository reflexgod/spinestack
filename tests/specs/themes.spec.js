// Profile themes (themes.js): kept for Pro's "Theme from a film", but nobody wears one now. @viraaj's profile is like
// everyone else's; the Gummo theme (its data, its CSS, its banner file) is still there and still dresses a card when
// asked to, readable (WCAG AA) and with no effect left behind.
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const { ROOT, mockNetwork, watchErrors, open } = require('../site');

test('@viraaj\'s profile is like everyone else\'s: no theme, no banner, no grain or REC', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const errors = watchErrors(page);
  for (const p of ['/u/?viraaj', '/u/?mira', '/u/?tester']) {
    await open(page, p);
    const card = page.locator('#pcard');
    await expect(card, p).not.toHaveClass(/themed/);
    await expect(page.locator('#pbanner'), p).toBeHidden();
    await expect(page.locator('#ppins'), p).toBeHidden();
    expect(await card.evaluate(e => [getComputedStyle(e).backgroundImage, e.dataset.theme || '']), p).toEqual(['none', '']);
    await expect(page.locator('#pcard .threc, #pcard .thfx'), p).toHaveCount(0);
    expect(await page.locator('#name').evaluate(e => getComputedStyle(e).fontFamily), p).not.toMatch(/Permanent Marker/);
  }
  await open(page, '/feed/?everyone');
  expect(await page.locator('.themed').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('the theme is data, mapped to nobody; Gummo and its banner file are kept for later', async ({ page }) => {
  await mockNetwork(page, {});
  await open(page, '/u/?mira');
  const data = await page.evaluate(() => ({ by: Themes.BY_USER, viraaj: Themes.of('viraaj'), gummo: Object.keys(Themes.THEMES), banner: Themes.THEMES.gummo.banner }));
  expect(data).toEqual({ by: {}, viraaj: null, gummo: ['gummo'], banner: 'banner.jpg' });
  expect(fs.existsSync(path.join(ROOT, 'assets/themes/gummo/banner.jpg'))).toBe(true);
});

test('the kept code still dresses a card when asked (and undresses it), its text readable at AA', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  await page.evaluate(() => Themes.apply(document.querySelector('#pcard'), Themes.THEMES.gummo, { root: '../', quiet: true }));
  const card = page.locator('#pcard');
  await expect(card).toHaveClass(/theme-gummo/);
  expect(await card.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(233, 214, 58)');
  expect(await page.locator('#pbanner').evaluate(e => getComputedStyle(e).backgroundImage)).toContain('assets/themes/gummo/banner.jpg');
  const ratio = await page.evaluate(() => {
    const t = Themes.THEMES.gummo.vars, lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
    const r = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
    return Math.min(...[t['--th-ink'], t['--th-soft']].flatMap(f => [t['--th-paper'], t['--th-tape'], t['--th-white']].map(b => r(f, b))));
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.evaluate(() => Themes.apply(document.querySelector('#pcard'), null));
  await expect(card).not.toHaveClass(/themed/);
  await expect(page.locator('#pbanner')).toBeHidden();
});
