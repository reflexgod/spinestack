// Spines on a shelf's picture (spinetip.js): hovering one shows "Title (year) · creator"; pressing it goes to its row in
// the list and marks it. On a shelf's page, and on the builder's preview.
const { test, expect } = require('@playwright/test');
const { SHELVES, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
// the middle of the nth spine on a shelf page's picture, on the screen (the picture says where it drew each book)
const spineOnPage = (page, n) => page.locator('#oneShelf canvas').evaluate((c, n) => { const r = c.getBoundingClientRect(), k = r.width / c.width, s = c.spots.find(x => x.i === n);
  return { x: r.left + (s.x + s.w / 2) * k, y: r.top + (s.y + s.h / 2) * k }; }, n);
// a point on the builder's preview, as parts of its width and height (the sample's four spines stand across the middle)
const onPreview = async (page, fx, fy) => { const b = await page.locator('#story').boundingBox(); return { x: b.x + b.width * fx, y: b.y + b.height * fy }; };

test('a shelf\'s page: hovering a spine says what it is, and pressing it goes to its row', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?mira&shelf=${SHELVES[7].id}`);   // a row of two spines
  await expect(page.locator('#oneItems li')).toHaveCount(2);
  const tip = page.locator('#oneShelf .spinetip'), rows = page.locator('#oneItems li');
  await page.locator('#oneShelf canvas').scrollIntoViewIfNeeded();
  const first = await spineOnPage(page, 0), second = await spineOnPage(page, 1);
  if (!isPhone()) {
    await page.mouse.move(first.x, first.y);
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('The Waves (1931) · Virginia Woolf');
    await expect(tip).toHaveAttribute('role', 'tooltip');
    // the tooltip is over the spine, inside the picture
    const t = await tip.boundingBox(), pic = await page.locator('#oneShelf canvas').boundingBox();
    expect(t.x).toBeGreaterThanOrEqual(pic.x);
    expect(t.x + t.width).toBeLessThanOrEqual(pic.x + pic.width + 1);
    expect(t.y + t.height).toBeLessThanOrEqual(first.y);
    await page.mouse.move(second.x, second.y);
    await expect(tip).toHaveText('Journey by Moonlight (1937) · Antal Szerb');
    const pic2 = await page.locator('#oneShelf canvas').boundingBox();
    await page.mouse.move(pic2.x + 6, pic2.y + 6);   // off the spines
    await expect(tip).toBeHidden();
  }
  // a press (a tap on a phone): its row comes into view, marked
  const again = await spineOnPage(page, 1);
  if (isPhone()) await page.touchscreen.tap(again.x, again.y); else await page.mouse.click(again.x, again.y);
  await expect(rows.nth(1)).toHaveClass(/spine-flash/);
  await expect(rows.nth(0)).not.toHaveClass(/spine-flash/);
  await expect(rows.nth(1)).toBeInViewport();
  await expect(rows.nth(1)).not.toHaveClass(/spine-flash/, { timeout: 4000 });   // for a moment only
  expect(errors).toEqual([]);
});

test('the builder\'s preview: the tooltip, a press going to the spine\'s row, and a drag not counting as a press', async ({ page }) => {
  test.skip(isPhone(), 'hovering and dragging with a mouse');
  const errors = watchErrors(page);
  await mockNetwork(page);
  await open(page, '/build/?sample');
  await page.waitForTimeout(300);
  const tip = page.locator('#stage .spinetip'), rows = page.locator('#books .book');
  const first = await onPreview(page, 0.27, 0.6), last = await onPreview(page, 0.73, 0.6);
  await page.mouse.move(first.x, first.y);
  await expect(tip).toHaveText('The Waves · Virginia Woolf');   // the sample has no years
  await page.mouse.move(last.x, last.y);
  await expect(tip).toHaveText('Kuasa Rahim · Barbara Watson Andaya');
  // a press: the fourth row is marked
  await page.mouse.click(last.x, last.y);
  await expect(rows.nth(3)).toHaveClass(/spine-flash/);
  await expect(rows.nth(3)).toBeInViewport();
  await expect(rows.nth(3)).not.toHaveClass(/spine-flash/, { timeout: 4000 });
  // a drag moves the spine and marks nothing
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(first.x + 30, first.y, { steps: 4 });
  await page.mouse.move(last.x + 20, last.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => page.locator('#books .book .bt').allTextContents()).toEqual(['delta of venus', 'Journey by Moonlight', 'Kuasa Rahim', 'The Waves']);
  await page.waitForTimeout(150);
  await expect(page.locator('#books .spine-flash')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('with a finger on the builder\'s preview, a tap on a spine goes to its row', async ({ page }) => {
  test.skip(!isPhone(), 'a tap');
  await mockNetwork(page);
  await open(page, '/build/?sample');
  await page.waitForTimeout(300);
  await page.locator('#story').scrollIntoViewIfNeeded();
  const at = await onPreview(page, 0.27, 0.6);
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator('#books .book').first()).toHaveClass(/spine-flash/);
  await expect(page.locator('#books .book').first()).toBeInViewport();
});
