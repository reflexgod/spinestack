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
    const foot = await box(page.locator('footer p').first());
    if (!isPhone()) expect(Math.abs(foot.left - main.left)).toBeLessThanOrEqual(1);
  });

  test(`${pg.name}: the type scale, and two button looks: solid black or plain grey text`, async ({ page }) => {
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
    // buttons: 11px weight 600, radius 3px; in the bar in its capitals (+ ADD), in the page in their own case
    const btn = page.locator('.btn:visible').first();
    expect(await css(btn, 'fontSize', 'fontWeight', 'textTransform', 'borderTopLeftRadius')).toEqual({ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', borderTopLeftRadius: '3px' });
    const inPage = page.locator('main .btn:visible, .mkbar .btn:visible').first();
    if (await inPage.count()) expect(await css(inPage, 'textTransform')).toEqual({ textTransform: 'none' });
    const any = page.locator('main .btn.primary:visible, .mkbar .btn.primary:visible').first();
    if (await any.count()) expect(await css(any, 'paddingTop', 'paddingLeft')).toEqual({ paddingTop: '7px', paddingLeft: '12px' });
    // two looks and no third: solid black (what the screen is for, + ADD, Follow), or plain text, grey, with no box
    const looks = await page.locator('.btn:visible, .dash:visible').evaluateAll(els => els.map(e => { const s = getComputedStyle(e);
      return s.backgroundColor === 'rgb(0, 0, 0)' && s.color === 'rgb(255, 255, 255)' ? 'solid'
        : s.backgroundColor === 'rgba(0, 0, 0, 0)' && (s.borderTopWidth === '0px' || s.borderTopColor === 'rgba(0, 0, 0, 0)') && s.color === 'rgb(107, 107, 107)' ? 'text' : 'other: ' + e.textContent.trim(); }));
    expect(looks.filter(l => l.startsWith('other'))).toEqual([]);
    expect(looks).toContain('solid');   // + ADD at least
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
  const counts = page.locator('#counts'), stats = page.locator('.stats');
  if (isPhone()) {
    // a phone: one small line under the name and @username, over the buttons; no band of three big numbers
    await expect(stats).toBeHidden();
    await expect(counts).toHaveText('2 spines · 1 following · 2 followers');
    expect(await css(counts, 'fontSize', 'color', 'borderTopWidth', 'borderBottomWidth')).toEqual({ fontSize: '12px', color: 'rgb(107, 107, 107)', borderTopWidth: '0px', borderBottomWidth: '0px' });
    const line = await box(counts), handle = await page.locator('#handle').boundingBox(), btns = await page.locator('.pbtns').boundingBox();
    expect(line.height).toBeLessThan(24);                                      // one line (the band was 80px)
    expect(Math.abs(line.left - handle.x)).toBeLessThanOrEqual(1);
    expect((await counts.boundingBox()).y).toBeGreaterThanOrEqual(handle.y + handle.height - 1);
    expect(btns.y).toBeGreaterThan((await counts.boundingBox()).y + line.height);
    await expect(page.locator('#statCol')).toBeHidden();                        // nothing left in the band's place
  } else {
    await expect(counts).toBeHidden();
    await expect(stats).toBeVisible();
  }
  expect(await css(page.locator('#nSpines'), 'fontSize', 'fontWeight')).toEqual({ fontSize: '20px', fontWeight: '700' });
  expect(await css(page.locator('.stats dt').first(), 'fontSize', 'textTransform', 'color')).toEqual({ fontSize: '10px', textTransform: 'uppercase', color: 'rgb(107, 107, 107)' });
  expect((await css(page.locator('.stats div').nth(1), 'borderLeftWidth')).borderLeftWidth).toBe('1px');   // a thin line between the numbers (a wide window)
  expect(await css(page.locator('#tabP'), 'fontSize', 'textTransform', 'color', 'borderBottomWidth', 'borderBottomColor')).toEqual({ fontSize: '13px', textTransform: 'none', color: 'rgb(0, 0, 0)', borderBottomWidth: '1px', borderBottomColor: 'rgb(0, 0, 0)' });
  expect((await css(page.locator('#tabA'), 'color')).color).toBe('rgb(107, 107, 107)');
  // its shelf: no panel, standing on a 1px black shelf line across the column (as home's spine wall)
  const line = await box(page.locator('#featWrap')), main = await box(page.locator('main'));
  expect(Math.abs(line.width - main.width)).toBeLessThanOrEqual(1);
  expect(await css(page.locator('#hero'), 'backgroundColor')).toEqual({ backgroundColor: 'rgba(0, 0, 0, 0)' });
  expect(await css(page.locator('#featWrap'), 'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor')).toEqual({ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgb(0, 0, 0)' });
});

test('the feed shows a shelf saved as a strip of spines 80px tall, in line with the post’s text, not a card or the whole story', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const post = page.locator('.shelfpost').first();
  await expect(post.locator('.strip canvas').first()).toBeVisible();
  const strip = await box(post.locator('.strip')), what = await box(post.locator('.pwhat'));
  expect(Math.round(strip.height)).toBe(80);
  expect(Math.abs(strip.left - what.left)).toBeLessThanOrEqual(1);   // in line with the text above it
  expect(strip.left - (await box(post.locator('.pava'))).right).toBeGreaterThan(0);   // and clear of the photo
  await expect(page.locator('#items .pic')).toHaveCount(0);
});

// The type is Courier Prime (400, 700 and italic 400, from Google Fonts with display=swap) on every page, not Geist Mono.
// Pages that draw shelves (home, the builder, profiles) also load Geist Mono, for shelf.js's caption and a plain
// cover's title on the canvas, and the spines' own faces
test('every page sets its type in Courier Prime, loaded from Google Fonts at 400, 700 and italic 400', async () => {
  const fs = require('fs'), path = require('path'), { ROOT } = require('../site');
  const files = ['index.html', '404.html', 'privacy.html', 'admin.html', ...['build', 'feed', 'people', 'settings', 'shelves', 'u'].map(d => d + '/index.html')];
  for (const f of files) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8'), link = (html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/) || [''])[0];
    expect(link, f).toContain('family=Courier+Prime:ital,wght@0,400;0,700;1,400');
    expect(link, f).toContain('display=swap');
    if (!['index.html', 'build/index.html', 'u/index.html', 'feed/index.html'].includes(f)) expect(link, f).not.toContain('Geist');   // pages that draw spines (the feed: People to follow)
  }
  expect(fs.readFileSync(path.join(ROOT, 'site.css'), 'utf8')).toMatch(/--mono:"Courier Prime",/);
});
for (const pg of [...PAGES, { name: 'privacy', path: '/privacy.html' }]) {
  test(`${pg.name}: the text, the bar and the buttons are in Courier Prime`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, pg.path);
    for (const sel of ['body', '.top a', '.btn:visible, button:visible']) {
      const el = page.locator(sel).first();
      if (await el.count()) expect((await css(el, 'fontFamily')).fontFamily, `${pg.name} ${sel}`).toMatch(/^"Courier Prime"/);
    }
  });
}
