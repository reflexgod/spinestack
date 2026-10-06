// Profile themes (themes.js): @viraaj's profile wears Gummo, layered on the normal card, and nothing else does. The
// banner, the card's gradient, the polaroid photo with its tape, the VHS label, the handwritten bio; the effect (2s of
// grain and a blinking REC, then nothing, and none with reduced motion); its text readable (WCAG AA); 390px wide.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs'), path = require('path');
const { ROOT, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');

test('@viraaj: the Gummo card: banner, two-colour gradient, polaroid photo with tape, VHS name label, the bio in a hand', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const errors = watchErrors(page);
  await open(page, '/u/?viraaj');
  const card = page.locator('#pcard');
  await expect(card).toHaveClass(/\bthemed\b/);
  await expect(card).toHaveClass(/\btheme-gummo\b/);
  const banner = page.locator('#pbanner');
  await expect(banner).toBeVisible();
  expect(Math.round((await banner.boundingBox()).height)).toBe(isPhone() ? 88 : 112);
  // the banner: lime-green siding drawn in CSS (no picture file), with a grain over it
  expect(await banner.evaluate(e => getComputedStyle(e).backgroundImage)).toMatch(/repeating-linear-gradient\((180deg, )?rgb\(207, 226, 154\)/);
  expect(await card.evaluate(e => getComputedStyle(e).backgroundImage)).toBe('linear-gradient(160deg, rgb(231, 166, 180) 0%, rgb(217, 178, 60) 100%)');
  // the photo: a polaroid, a little crooked, over the banner's foot, with a strip of tape
  const ava = page.locator('#ava');
  expect(await ava.evaluate(e => getComputedStyle(e).transform)).not.toBe('none');
  expect(await ava.evaluate(e => getComputedStyle(e, '::after').content)).toBe('""');
  expect((await ava.boundingBox()).y).toBeLessThan((await banner.boundingBox()).y + (await banner.boundingBox()).height);
  // the name on a label: tile white, a green edge
  const name = page.locator('#name');
  expect(await name.evaluate(e => getComputedStyle(e).borderLeftColor)).toBe('rgb(110, 154, 58)');
  // one handwritten face, for the bio only; Courier Prime for the rest
  expect(await page.locator('#bio').evaluate(e => getComputedStyle(e).fontFamily)).toMatch(/^"Gochi Hand"/);
  for (const sel of ['#name', '#handle', '#counts', '#since', '#followBtn']) expect(await page.locator(sel).evaluate(e => getComputedStyle(e).fontFamily), sel).toMatch(/^"Courier Prime"/);
  // nothing from the film: no picture in the card but the photo and the badges
  expect(await card.locator('img').evaluateAll(els => els.map(e => e.closest('#ava') ? 'photo' : e.closest('.badge') ? 'badge' : e.src))).toEqual(['photo', 'badge', 'badge']);
  // the rest of the page is the site's own
  for (const sel of ['main .tabs', 'header.top', 'footer']) expect(await page.locator(sel).first().evaluate(e => getComputedStyle(e).backgroundColor), sel).toMatch(/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('@viraaj: the profile effect: grain and a blinking REC as it opens, gone after 2 seconds; no sound', async ({ page }) => {
  await mockNetwork(page, {});
  await page.goto('/u/?viraaj');
  await expect(page.locator('#pcard .threc')).toBeVisible();
  await expect(page.locator('#pcard .threc')).toHaveText('REC');
  await expect(page.locator('#pcard .thfx')).toHaveCount(1);
  await expect(page.locator('#pcard .threc, #pcard .thfx')).toHaveCount(0, { timeout: 4000 });
  expect(await page.locator('audio, video').count()).toBe(0);
});

test('@viraaj with reduced motion: no grain, no REC', async ({ browser }) => {
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: isPhone() ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
  await mockNetwork(page, {});
  await page.goto('/u/?viraaj');
  await expect(page.locator('#pcard')).toHaveClass(/theme-gummo/);
  await page.waitForTimeout(300);
  await expect(page.locator('#pcard .threc, #pcard .thfx')).toHaveCount(0);
  await page.close();
});

test('every other profile, and every other page, is unchanged', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  for (const p of ['/u/?mira', '/u/?tester']) {
    await open(page, p);
    await expect(page.locator('#pcard')).not.toHaveClass(/themed/);
    await expect(page.locator('#pbanner')).toBeHidden();
    expect(await page.locator('#pcard').evaluate(e => getComputedStyle(e).backgroundImage)).toBe('none');
  }
  await open(page, '/feed/?everyone');
  expect(await page.locator('.themed, .pbanner').count()).toBe(0);
});

test('Gummo\'s text is readable: WCAG AA (4.5:1) for the ink and the soft ink on both ends of the gradient; axe finds nothing serious', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?viraaj');
  const ratio = await page.evaluate(() => {
    const t = Themes.THEMES.gummo.vars, lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
    const r = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
    return Math.min(...[t['--th-ink'], t['--th-soft']].flatMap(f => [t['--th-a'], t['--th-b'], t['--th-tile']].map(b => r(f, b))));
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.waitForTimeout(2200);   // after the effect
  const res = await new AxeBuilder({ page }).include('#pcard').analyze();
  expect(res.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id)).toEqual([]);
});

test('the theme is data: viraaj is Gummo, nobody else is; its banner is a picture only when assets/themes/gummo/banner.jpg is there', async ({ page }) => {
  await mockNetwork(page, {});
  await open(page, '/u/?mira');
  const data = await page.evaluate(() => ({ by: Themes.BY_USER, banner: Themes.THEMES.gummo.banner, mira: Themes.of('mira'), viraaj: (Themes.of('VIRAAJ') || {}).id }));
  expect(data.by).toEqual({ viraaj: 'gummo' });
  expect(data.mira).toBe(null);
  expect(data.viraaj).toBe('gummo');
  const file = fs.existsSync(path.join(ROOT, 'assets/themes/gummo/banner.jpg'));
  expect(data.banner, 'drop the file in, and name it in themes.js').toBe(file ? 'banner.jpg' : '');
});
