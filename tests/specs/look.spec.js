// The look every page shares (site.css): one 950px column that the top bar's contents sit in too, the type scale,
// the buttons, the shelf cards, the profile's numbers and tabs.
const { test, expect } = require('@playwright/test');
const { PAGES, mockNetwork, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const css = (loc, ...props) => loc.evaluate((el, props) => { const s = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, s[p]])); }, props);
const box = async loc => { const b = await loc.boundingBox(); return { left: b.x, right: b.x + b.width, width: b.width, height: b.height }; };

for (const pg of [...PAGES, { name: 'own profile', path: '/u/?tester' }]) {
  test(`${pg.name}: the content and the bar's contents share one column, and only the bar's line is the window's width`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, pg.path);
    const width = page.viewportSize().width;
    const main = await box(page.locator('main')), logo = await box(page.locator('.top .mark')), add = await box(page.locator('.top .addwrap')), bar = await box(page.locator('header.top'));
    expect(main.width).toBeLessThanOrEqual(950);
    if (!isPhone()) expect(main.width).toBe(950);
    else expect(main.width).toBe(width - 32);   // a 16px gutter each side
    expect(Math.abs(logo.left - main.left)).toBeLessThanOrEqual(1);    // the logo's left edge is the content's
    expect(Math.abs(add.right - main.right)).toBeLessThanOrEqual(1);   // the last item's right edge is the content's
    expect(bar.width).toBe(width);                                      // the bar, and the hairline under it, run across
    expect((await css(page.locator('header.top'), 'borderBottomWidth')).borderBottomWidth).toBe('1px');
    const foot = await box(page.locator('footer .fgrid'));
    if (!isPhone()) expect(Math.abs(foot.left - main.left)).toBeLessThanOrEqual(1);
  });

  test(`${pg.name}: the type scale, and one black button`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, pg.path);
    expect(await css(page.locator('body'), 'fontSize')).toEqual({ fontSize: '13px' });
    expect(await css(page.locator('.top .mark'), 'fontSize')).toEqual({ fontSize: isPhone() ? '15px' : '18px' });
    expect(await css(page.locator('.top .links a').nth(1), 'fontSize', 'fontWeight', 'textTransform', 'letterSpacing')).toEqual({ fontSize: '12px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '1px' });
    // page titles: 22 to 24px, weight 400, in their own case
    const h1 = page.locator('main h1:visible').first();
    const t = await css(h1, 'fontSize', 'fontWeight', 'textTransform');
    expect(['22px', '24px']).toContain(t.fontSize);
    expect(t).toMatchObject({ fontWeight: '400', textTransform: 'none' });
    // section headings: 12px uppercase grey, 1px apart, a hairline under them
    const h2 = page.locator('main h2:visible').first();
    if (await h2.count()) expect(await css(h2, 'fontSize', 'textTransform', 'letterSpacing', 'color', 'borderBottomWidth')).toEqual({ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgb(107, 107, 107)', borderBottomWidth: '1px' });
    // buttons: 11px uppercase weight 600, 7px 12px, radius 3px
    const btn = page.locator('.btn:visible').first();
    expect(await css(btn, 'fontSize', 'fontWeight', 'textTransform', 'borderTopLeftRadius')).toEqual({ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', borderTopLeftRadius: '3px' });
    const any = page.locator('main .btn:visible, .mkbar .btn:visible').first();
    if (await any.count()) expect(await css(any, 'paddingTop', 'paddingLeft')).toEqual({ paddingTop: '7px', paddingLeft: '12px' });
    // one black button a screen: + SHELF (its ▾ is part of it), or Save in the builder
    const black = await page.locator('.btn.primary:visible').evaluateAll(els => [...new Set(els.map(e => e.closest('.addwrap') ? '+ SHELF' : e.textContent.trim()))]);
    expect(black).toEqual([pg.name === 'build' ? 'Save' : '+ SHELF']);
  });
}

test('shelf cards: six across the column at 150px with 10px gaps (three on a phone), cut 2:3, name and @username under', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/');
  const cards = page.locator('#inGrid li'), pics = page.locator('#inGrid .pic');
  const boxes = await cards.evaluateAll(els => els.slice(0, 7).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; }));
  const across = boxes.filter(b => Math.abs(b.y - boxes[0].y) < 1).length;
  expect(across).toBe(isPhone() ? 3 : 6);
  expect(Math.round(boxes[1].x - boxes[0].x - boxes[0].w)).toBe(10);
  if (!isPhone()) expect(Math.round(boxes[0].w)).toBe(150);
  const pic = await box(pics.first());
  expect(pic.height / pic.width).toBeCloseTo(1.5, 1);
  expect(await css(pics.first(), 'borderTopLeftRadius', 'borderTopWidth')).toEqual({ borderTopLeftRadius: '3px', borderTopWidth: '0px' });   // no box round it
  expect(await css(page.locator('#inGrid .cap').first(), 'fontSize', 'textTransform')).toEqual({ fontSize: '12px', textTransform: 'none' });
  expect(await css(page.locator('#inGrid .by').first(), 'fontSize', 'color')).toEqual({ fontSize: '11px', color: 'rgb(107, 107, 107)' });
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
});

test('profile: the name, the numbers and their labels, and the tabs', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  expect(await css(page.locator('#name'), 'fontSize', 'fontWeight')).toEqual({ fontSize: '22px', fontWeight: '400' });
  expect(await css(page.locator('#nShelves'), 'fontSize', 'fontWeight')).toEqual({ fontSize: '20px', fontWeight: '700' });
  expect(await css(page.locator('.stats dt').first(), 'fontSize', 'textTransform', 'color')).toEqual({ fontSize: '10px', textTransform: 'uppercase', color: 'rgb(107, 107, 107)' });
  expect((await css(page.locator('.stats div').nth(1), 'borderLeftWidth')).borderLeftWidth).toBe('1px');   // a thin line between the numbers
  expect(await css(page.locator('#tabP'), 'fontSize', 'textTransform', 'color', 'borderBottomWidth', 'borderBottomColor')).toEqual({ fontSize: '13px', textTransform: 'none', color: 'rgb(0, 0, 0)', borderBottomWidth: '1px', borderBottomColor: 'rgb(0, 0, 0)' });
  expect((await css(page.locator('#tabS'), 'color')).color).toBe('rgb(107, 107, 107)');
  // its shelves: four cards across beside the bio, six on the Shelves tab
  if (!isPhone()) {
    const row = await page.locator('#recent li').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(row.filter(y => y === row[0]).length).toBe(4);
  }
});

test('the feed shows each shelf as the same 2:3 card as home, under the line about it, not the whole story', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const card = await box(page.locator('.item .pic').first()), line = await box(page.locator('.item .line').first());
  expect(Math.round(card.width)).toBe(150);
  expect(Math.round(card.height)).toBe(225);
  expect(Math.abs(card.left - line.left)).toBeLessThanOrEqual(1);   // in line with the text above it
  expect(card.left - (await box(page.locator('.item .fa').first())).right).toBeGreaterThan(0);   // and clear of the photo
  expect(await css(page.locator('.item .pic').first(), 'borderTopLeftRadius')).toEqual({ borderTopLeftRadius: '3px' });
  // and it's the home card's cut of the picture: drawn 1.2 times the card's width, moved up
  const img = await page.locator('.item .pic img').first().evaluate(el => { const r = el.getBoundingClientRect(), c = el.parentElement.getBoundingClientRect(); return { w: r.width / c.width, top: (r.top - c.top) / c.height }; });
  expect(img.w).toBeCloseTo(1.2, 2);
  expect(img.top).toBeCloseTo(-0.33, 2);
});

test('a card cuts the picture by how the shelf is laid out: a pile from its foot at the card\'s width, covers a little closer', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const { SHELVES } = require('../site');
  const cut = id => page.locator(`[data-shelf="${id}"] img, .pic[data-shelf="${id}"] img`).first().evaluate(el => {
    const r = el.getBoundingClientRect(), c = el.parentElement.getBoundingClientRect();
    return { w: +(r.width / c.width).toFixed(2), left: +((r.left - c.left) / c.width).toFixed(2), top: +((r.top - c.top) / c.height).toFixed(2), bottom: +((r.bottom - c.bottom) / c.height).toFixed(2), cls: el.parentElement.className };
  });
  const row = SHELVES[0], pile = SHELVES[1], covers = SHELVES[2];
  for (const path of ['/', '/feed/?everyone']) {
    await open(page, path);
    await expect(page.locator(`[data-shelf="${pile.id}"]`).first()).toHaveClass(/stack/);
    expect(await cut(row.id)).toMatchObject({ w: 1.2, left: -0.1, top: -0.33 });      // spines in a row: 1.2 times, moved up
    expect(await cut(pile.id)).toMatchObject({ w: 1, left: 0, bottom: 0 });             // a pile: the card's width, from the story's foot
    expect(await cut(covers.id)).toMatchObject({ w: 1.08, left: -0.04, top: -0.22 });   // covers: a little closer
  }
  // a profile's cards know the layout from the shelf itself
  await open(page, '/u/?mira');
  await page.locator('#tabS').click();
  const cls = await page.locator('#all .pic').evaluateAll(els => els.map(e => e.className));
  expect(cls.some(c => /\bstack\b/.test(c))).toBe(true);
  expect(cls.some(c => /\bcovers\b/.test(c))).toBe(true);
});

