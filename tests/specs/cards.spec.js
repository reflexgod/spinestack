// Shelf cards (cards.js): the card is cut round the books, found in the shelf's picture itself. The tests' previews are
// stories in flat shapes (tests/site.js): a caption bar, a "made with" bar, and a block where the books of that layout are.
const { test, expect } = require('@playwright/test');
const { SHELVES, STORY, CAPTION, MADE_WITH, PICTURE, CORS, storyPicture, mockNetwork, watchErrors, open } = require('../site');

const pile = SHELVES[1], covers = SHELVES[4], row = SHELVES[7];   // @mira's: a pile, covers, and a row on the dark Ink background
const card = (page, root, shelf) => page.locator(`${root} .pic[data-shelf="${shelf.id}"]`).first();
// where the books' block is in the card: the room on each side as a part of the card's width, above and below as a
// part of its height; what's clipped off the picture, top and bottom (as parts of its height); the card's colour
const seen = (loc, block) => loc.evaluate((pic, b) => {
  const im = pic.querySelector('img'), r = im.getBoundingClientRect(), c = pic.getBoundingClientRect(), n = v => +v.toFixed(3);
  const clip = (getComputedStyle(im).clipPath.match(/[\d.]+%/g) || []).map(parseFloat);
  return { left: n((r.left + r.width * b[0] / 360 - c.left) / c.width), right: n((c.right - (r.left + r.width * b[2] / 360)) / c.width),
    top: n((r.top + r.height * b[1] / 640 - c.top) / c.height), bottom: n((c.bottom - (r.top + r.height * b[3] / 640)) / c.height),
    width: n(r.width * (b[2] - b[0]) / 360 / c.width), clipTop: clip[0] / 100, clipBottom: 1 - clip[1] / 100, bg: getComputedStyle(pic).backgroundColor, ratio: n(c.height / c.width) };
}, block);
// the books are in the middle of the card with room round them, as large as that room allows; the caption and the
// "made with" line are clipped off; the card is the story's colour
async function cutRound(loc, layout, dark){
  await expect(loc.locator('img')).toHaveJSProperty('complete', true);
  await expect.poll(async () => (await seen(loc, STORY[layout])).bg).toBe(dark ? 'rgb(14, 15, 18)' : 'rgb(255, 255, 255)');
  const s = await seen(loc, STORY[layout]), near = (a, b) => Math.abs(a - b) <= 0.012;
  expect(s.ratio).toBeCloseTo(1.5, 1);
  expect(near(s.left, s.right), `sideways: ${JSON.stringify(s)}`).toBe(true);
  expect(near(s.top, s.bottom), `up and down: ${JSON.stringify(s)}`).toBe(true);
  expect(s.left).toBeGreaterThanOrEqual(0.04 - 0.012);
  expect(s.top).toBeGreaterThanOrEqual(0.07 - 0.012);
  expect(near(s.left, 0.04) || near(s.top, 0.07), `as large as the room allows: ${JSON.stringify(s)}`).toBe(true);
  expect(s.clipTop).toBeGreaterThanOrEqual(CAPTION[3] / 640);          // below the caption
  expect(s.clipTop).toBeLessThanOrEqual(STORY[layout][1] / 640);
  expect(s.clipBottom).toBeLessThanOrEqual(MADE_WITH[1] / 640);       // above "made with shelfstackd"
  expect(s.clipBottom).toBeGreaterThanOrEqual(STORY[layout][3] / 640);
  return s;
}

for (const [name, path, root] of [['home', '/', '#inGrid'], ['a profile\'s Activity', '/u/?mira#activity', '#acts']]) {   // (the feed has no cards: a shelf saved is a strip of spines)
  test(`${name}: each card is cut round its books, whatever the layout`, async ({ page }) => {
    const errors = watchErrors(page);
    await mockNetwork(page, { signedIn: true });
    await open(page, path);
    const p = await cutRound(card(page, root, pile), 'stack', false);
    expect(p.width).toBeGreaterThan(0.9);                     // a pile lying flat: nearly the card's width, in its middle
    expect(Math.abs(p.top - p.bottom)).toBeLessThan(0.012);   // not a thin line at the foot
    await cutRound(card(page, root, covers), 'covers', false);
    await cutRound(card(page, root, row), 'row', true);
    expect(errors).toEqual([]);
  });
}

test('your own Activity\'s cards are cut the same way', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester#activity');
  await cutRound(card(page, '#acts', SHELVES[3]), 'stack', true);
  await cutRound(card(page, '#acts', SHELVES[0]), 'row', false);
});

test('a picture is looked at once: what was found is kept per preview key, for this visit and the next', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira#activity');
  await cutRound(card(page, '#acts', pile), 'stack', false);
  // each shelf's picture once, however many cards show it
  const keys = await page.locator('.pic img').evaluateAll(els => els.map(im => new URL(im.src).searchParams.get('k')));
  await expect.poll(() => page.evaluate(() => Cards.measured)).toBe(new Set(keys).size);
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('shelfstackd-crops-1') || '{}')))).toContain(pile.preview_key);
  // home, then: the same pictures in Just shelved are not looked at again
  await open(page, '/');
  await cutRound(card(page, '#inGrid', pile), 'stack', false);
  const home = await page.locator('#inGrid .pic img').evaluateAll(els => els.map(im => new URL(im.src).searchParams.get('k')));
  expect(await page.evaluate(() => Cards.measured)).toBe(home.filter(k => !keys.includes(k)).length);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await cutRound(card(page, '#inGrid', pile), 'stack', false);
  expect(await page.evaluate(() => Cards.measured)).toBe(0);
});

test('a picture with no plain background keeps the stylesheet\'s cut', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await page.route(u => u.pathname === '/u/preview', r => r.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PICTURE }));   // a photo, as a wall would be
  await open(page, '/u/?mira#activity');
  const cut = await card(page, '#acts', pile).evaluate(pic => { const im = pic.querySelector('img'), r = im.getBoundingClientRect(), c = pic.getBoundingClientRect();
    return { loaded: im.naturalWidth > 0, w: +(r.width / c.width).toFixed(2), left: +((r.left - c.left) / c.width).toFixed(2), top: +((r.top - c.top) / c.height).toFixed(2), clip: getComputedStyle(im).clipPath, own: im.style.width }; });
  expect(cut).toEqual({ loaded: true, w: 1.2, left: -0.1, top: -0.33, clip: 'none', own: '' });
  expect(errors).toEqual([]);
});

test('a picture that comes without CORS still shows, with the stylesheet\'s cut', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await page.route(u => u.pathname === '/u/preview', r => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': 'https://elsewhere.example' }, contentType: 'image/png', body: storyPicture('stack', false) }));   // CORS for some other site, so not for this one
  await open(page, '/u/?mira#activity');
  const img = card(page, '#acts', pile).locator('img');
  await expect.poll(() => img.evaluate(im => im.complete && im.naturalWidth)).toBe(360);
  expect(await img.evaluate(im => ({ cors: im.hasAttribute('crossorigin'), own: im.style.width }))).toEqual({ cors: false, own: '' });
});
