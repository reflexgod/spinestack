// Badges (badges.js), as Discord shows them: a row of 22px square icons, 6px apart, right under the display name on
// every profile, themed or not; the most important one, small, beside the name on a post; a tooltip with its name and
// one line, on hover or a tap. The pictures are the files in assets/badges/.
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const { ROOT, VIRAAJ, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');

test('the badge picture is a file the owner can swap: assets/badges/early-100.svg (no Founder any more)', async () => {
  expect(fs.existsSync(path.join(ROOT, 'assets/badges/founder.svg'))).toBe(false);
  for (const f of ['early-100.svg']) {
    const svg = fs.readFileSync(path.join(ROOT, 'assets/badges', f), 'utf8');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    for (const c of svg.match(/#[0-9A-F]{6}/gi)) expect(['#14181C', '#FFD000', '#FF2E93', '#6A4BFF', '#00D5E6', '#FFFFFF'], `${f}: ${c}`).toContain(c.toUpperCase());   // the logo's colours
  }
});

test('@viraaj: only Early 100 (the database\'s founder is ignored), a 22px square right under the name and over @username', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const errors = watchErrors(page), got = [];
  page.on('response', r => { if (/\/assets\/badges\//.test(r.url())) got.push(r.status()); });
  await open(page, '/u/?viraaj');
  const row = page.locator('#badges');
  await expect(row).toBeVisible();
  const items = row.locator('.badge');
  await expect(items).toHaveCount(1);
  expect(await items.evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual(['Early 100: one of the first 100 on shelfstackd']);
  expect(await page.evaluate(() => Badges.list('viraaj').map(b => b.id))).toEqual(['early-100']);
  const a = await items.nth(0).boundingBox();
  expect([Math.round(a.width), Math.round(a.height)]).toEqual([22, 22]);
  const name = await page.locator('#name').boundingBox(), handle = await page.locator('#handle').boundingBox();
  expect(a.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  expect(a.y + a.height).toBeLessThanOrEqual(handle.y + 1);
  expect(got).toEqual([200]);   // whatever file is there
  expect(errors).toEqual([]);
});

test('badges on an unthemed profile too; none for someone without one', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  await expect(page.locator('#badges')).toBeHidden();
  // an Early 100 person without a theme gets the row under their name all the same
  const early = await page.evaluate(() => Badges.list('div').map(b => b.id));
  expect(early).toEqual(['early-100']);
  expect(await page.evaluate(() => Badges.list('nobody_at_all'))).toEqual([]);
});

test('a badge says what it is: on hover with a mouse, on a tap on a phone; a tap elsewhere or Esc shuts it', async ({ page }) => {
  await mockNetwork(page, {});
  await open(page, '/u/?viraaj');
  const early = page.locator('#badges .badge').first(), tip = page.locator('#badgeTip');
  if (isPhone()) {
    await early.tap();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Early 100one of the first 100 on shelfstackd');
    await page.locator('#name').tap();   // not a link: elsewhere
    await expect(tip).toBeHidden();
  } else {
    await early.hover();
    await expect(tip).toBeVisible();
    await expect(tip.locator('b')).toHaveText('Early 100');
    await expect(tip).toContainText('one of the first 100 on shelfstackd');
    await page.mouse.move(5, 500);
    await expect(tip).toBeHidden();
    await early.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
  }
  // inside the window, and the page doesn't scroll sideways for it
  const box = await tip.boundingBox().catch(() => null);
  if (box) expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
});

test('the feed: one small badge, the most important, beside the name on a post; pressing it doesn\'t open the post', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  // @viraaj's log, at the top of Everyone
  await page.route(u => u.pathname.endsWith('/rest/v1/rpc/activity'), route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify([{ what: 'log', id: 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000ff', at: new Date().toISOString(), owner: VIRAAJ.id, username: 'viraaj', display_name: 'Viraaj', avatar_key: null, caption: 'Again.', name: null, preview_key: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), updated: false, is_public: true, kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: null }]) }));
  await open(page, '/feed/?everyone');
  const post = page.locator('#items .post').first();
  await expect(post.locator('.badge')).toHaveCount(1);
  await expect(post.locator('.badge')).toHaveAttribute('aria-label', /^Early 100/);
  const b = await post.locator('.badge').boundingBox();
  expect([Math.round(b.width), Math.round(b.height)]).toEqual([14, 14]);
  await post.locator('.badge').click();
  await expect(page.locator('#badgeTip')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/feed/');
});
