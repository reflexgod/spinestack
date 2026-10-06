// Profile themes (themes.js): @viraaj's profile wears Gummo, layered on the normal card, and nothing else does. The
// banner, the card's flat photocopied yellow, the polaroid photo with its tape and glare, the masking-tape name, the
// marker bio, the pink accent, the pinned titles; the effect (2s of grain and a blinking REC, then nothing, and none
// with reduced motion); its text readable (WCAG AA); 390px wide.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs'), path = require('path');
const { ROOT, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');

test('@viraaj: the Gummo card: banner, flat photocopied yellow, polaroid photo with tape and glare, masking-tape name, the bio in marker, pink links, pinned titles', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const errors = watchErrors(page);
  await open(page, '/u/?viraaj');
  const card = page.locator('#pcard');
  await expect(card).toHaveClass(/\bthemed\b/);
  await expect(card).toHaveClass(/\btheme-gummo\b/);
  const banner = page.locator('#pbanner');
  await expect(banner).toBeVisible();
  expect(Math.round((await banner.boundingBox()).height)).toBe(isPhone() ? 88 : 112);
  // the banner: the owner's banner.jpg when it's there, otherwise a dark strip; the copier's specks over either
  const file = fs.existsSync(path.join(ROOT, 'assets/themes/gummo/banner.jpg'));
  if (file) expect(await banner.evaluate(e => getComputedStyle(e).backgroundImage)).toContain('assets/themes/gummo/banner.jpg');
  else expect(await banner.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(23, 21, 13)');
  expect(await banner.evaluate(e => getComputedStyle(e, '::after').backgroundImage)).toContain('data:image/svg+xml');
  // the card: flat acid yellow under photocopy dirt (drawn noise), and no gradient anywhere on it
  expect(await card.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(233, 214, 58)');
  expect(await card.evaluate(e => getComputedStyle(e).backgroundImage)).toContain('data:image/svg+xml');
  expect(await card.evaluate(e => [e, ...e.querySelectorAll('*')].flatMap(el => [null, '::before', '::after'].map(p => getComputedStyle(el, p).backgroundImage)).filter(b => /gradient\(/.test(b)))).toEqual([]);
  // the text in black
  for (const sel of ['#name', '#handle', '#bio']) expect(await page.locator(sel).evaluate(e => getComputedStyle(e).color), sel).toMatch(/^rgb\((0, 0, 0|30, 28, 18)\)$/);
  // the photo: a polaroid gone yellow, a little crooked, over the banner's foot, with a strip of tape and a flash's glare
  const ava = page.locator('#ava');
  expect(await ava.evaluate(e => getComputedStyle(e).transform)).not.toBe('none');
  expect(await ava.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(243, 236, 210)');
  expect(await ava.evaluate(e => getComputedStyle(e, '::after').content)).toBe('""');
  expect(await ava.evaluate(e => getComputedStyle(e, '::before').filter)).toMatch(/blur/);
  expect((await ava.boundingBox()).y).toBeLessThan((await banner.boundingBox()).y + (await banner.boundingBox()).height);
  // the name in marker on a torn strip of masking tape
  const name = page.locator('#name');
  expect(await name.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(227, 211, 164)');
  expect(await name.evaluate(e => getComputedStyle(e).clipPath)).toMatch(/^polygon/);
  // the one handwritten face (marker), for the name and the bio, the bio a little crooked; Courier Prime for the rest
  for (const sel of ['#name', '#bio']) expect(await page.locator(sel).evaluate(e => getComputedStyle(e).fontFamily), sel).toMatch(/^"Permanent Marker"/);
  expect(await page.locator('#bio').evaluate(e => getComputedStyle(e).transform)).not.toBe('none');
  for (const sel of ['#handle', '#counts', '#since', '#followBtn']) expect(await page.locator(sel).evaluate(e => getComputedStyle(e).fontFamily), sel).toMatch(/^"Courier Prime"/);
  // bunny pink, the one accent: the open tab's line and the links' underline (the links' text stays black)
  expect(await page.locator('#tabP').evaluate(e => getComputedStyle(e).borderBottomColor)).toBe('rgb(231, 166, 180)');
  expect(await page.locator('#cFollowers').evaluate(e => [getComputedStyle(e).textDecorationColor, getComputedStyle(e).color])).toEqual(['rgb(231, 166, 180)', 'rgb(0, 0, 0)']);
  // the pinned shelf's first titles, copied small on crooked cards at the card's right on a wide window; none on a phone
  const pins = page.locator('#ppins');
  if (isPhone()) await expect(pins).toBeHidden();
  else {
    await expect(pins.locator('li a canvas')).toHaveCount(2);
    expect(await pins.locator('a').evaluateAll(as => as.map(a => getComputedStyle(a).transform !== 'none'))).toEqual([true, true]);
    expect(await pins.locator('a').first().getAttribute('href')).toContain('/t/');
    expect((await pins.boundingBox()).x).toBeGreaterThan((await page.locator('#bio').boundingBox()).x + 400);
  }
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

test('Gummo\'s text is readable: WCAG AA (4.5:1) for the ink and the soft ink on the paper, the tape and the polaroid; axe finds nothing serious', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?viraaj');
  const ratio = await page.evaluate(() => {
    const t = Themes.THEMES.gummo.vars, lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
    const r = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
    return Math.min(...[t['--th-ink'], t['--th-soft']].flatMap(f => [t['--th-paper'], t['--th-tape'], t['--th-white']].map(b => r(f, b))));
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
