// Smooth on a phone and a computer: share links that preview, empty places that pull you in, the open tab in view,
// every press answered at once and a slow save saying so, never sent twice, and pages that draw at once.
const { test, expect } = require('@playwright/test');
const { SHELVES, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const W = 'https://api.shelfstackd.com';

test('Copy link gives the share link, whose preview has a picture and a title: a profile, a shelf, a title', async ({ page, context }) => {
  test.skip(isPhone(), 'the clipboard is tried at the desktop width');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockNetwork(page, { signedIn: true, social: true, ids: true });
  const copied = () => page.evaluate(() => navigator.clipboard.readText());
  await open(page, '/u/?mira');
  await page.locator('#moreBtn').click(); await page.getByRole('menuitem', { name: 'Copy link' }).click();
  expect(await copied()).toBe(`${W}/s/u/mira`);
  await open(page, `/u/?mira&shelf=${SHELVES[1].id}`);
  await page.getByRole('button', { name: 'Share', exact: true }).click(); await page.locator('#cardMenu').getByRole('menuitem', { name: 'Copy link' }).click();
  expect(await copied()).toBe(`${W}/s/u/mira/${SHELVES[1].id}`);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const wa = page.waitForEvent('popup'); await page.locator('#cardMenu').getByRole('menuitem', { name: 'Share to WhatsApp' }).click();
  expect(decodeURIComponent((await wa).url())).toContain(`${W}/s/u/mira/${SHELVES[1].id}`);
  await open(page, '/t/?film=106&title=Gummo&year=1997');
  await page.locator('#tPanel [data-t=share]').click(); await page.getByRole('menuitem', { name: 'Copy link' }).click();
  expect(await copied()).toBe(`${W}/s/t/film/106`);
});

test('an empty Friends tab: Log your first film, which opens Log it, and Follow these people', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, fresh: true, social: true });
  await open(page, '/feed/?friends');
  await expect(page.locator('#none > p').first()).toHaveText('Nobody you follow has posted.');
  const first = page.getByRole('button', { name: 'Log your first film' });
  await expect(first).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Follow these people' })).toBeVisible();
  await expect(page.locator('.tofollow .btn.follow').first()).toHaveText('Follow');
  await first.click();
  await expect(page.locator('#addDialog')).toBeVisible();
  await expect(page.locator('#addDialog input[name=addWhat][value=log]')).toBeChecked();
});

test('someone who has logged something isn\'t asked for their first film', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await page.route(u => u.pathname.endsWith('/rest/v1/rpc/activity'), route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }));
  await open(page, '/feed/?friends');
  await expect(page.locator('#none > p').first()).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: 'Log your first film' })).toHaveCount(0);
});

test('an empty Recs tab: Recommend something to a friend, with Recommend, which opens + ADD\'s Recommend', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, recs: true });
  await page.route(u => u.pathname.endsWith('/rest/v1/rpc/recs_list'), route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }));
  await open(page, '/u/?tester#recs');
  await expect(page.locator('#rNone')).toHaveText('Recommend something to a friend.');
  await page.locator('#rGo').click();
  await expect(page.locator('#addDialog')).toBeVisible();
  await expect(page.locator('#addDialog input[name=addWhat][value=rec]')).toBeChecked();
});

test('a profile\'s tabs: the open one is brought into the row\'s view on a phone (People, Shelves at the end)', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, recs: true });
  for (const [hash, tab] of [['#people', '#tabN'], ['#shelves', '#tabS'], ['', '#tabP']]) {
    await open(page, '/u/?tester' + hash);
    await expect(page.locator(tab)).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => {
      const [row, b] = [await page.locator('#viewProfile > .tabs').boundingBox(), await page.locator(tab).boundingBox()];
      return b.x >= row.x - 1 && b.x + b.width <= row.x + row.width + 1;
    }, { message: hash }).toBe(true);
  }
  // and the page itself didn't move to do it
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('a press is answered at once; a slow save turns, and a second press sends nothing more', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  let follows = 0;
  await page.route(u => u.pathname.endsWith('/rest/v1/rpc/follow'), async route => { follows++; await new Promise(r => setTimeout(r, 900)); route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '"following"' }); });
  await open(page, '/u/?longusername_twenty1');
  const btn = page.locator('#followBtn');
  await expect(btn).toHaveText('Follow');
  await btn.click();
  await expect(btn).toBeDisabled();                                // at once
  await expect(btn).toHaveAttribute('aria-busy', 'true');           // and, while it's slow, turning
  expect(await btn.evaluate(e => getComputedStyle(e, '::after').animationName)).toBe('busy');
  await btn.click({ force: true }).catch(() => {});
  await expect(btn).not.toHaveAttribute('aria-busy', 'true', { timeout: 4000 });
  await expect(btn).toHaveText(/Following|Unfollow/);
  expect(follows).toBe(1);
});

test('a profile draws at once: a skeleton the card\'s size while it\'s read, then the card from last time while it\'s read again', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  let hold = null;
  await page.route(u => u.pathname.endsWith('/rest/v1/profiles') && u.searchParams.get('username') === 'eq.mira', async route => { if (hold) await hold; route.fallback(); });
  hold = new Promise(r => setTimeout(r, 1500));
  await page.goto('/u/?mira');
  await expect(page.locator('#skel')).toBeVisible();
  const sk = await page.locator('#skel .ska').boundingBox();
  expect(Math.round(sk.width)).toBe(isPhone() ? 72 : 96);
  await expect(page.locator('#name')).toHaveText('Mira', { timeout: 6000 });
  await expect(page.locator('#skel')).toBeHidden();
  // again: last time's card at once, before the profile is read
  hold = new Promise(r => setTimeout(r, 1500));
  await page.goto('/u/?mira');
  await expect(page.locator('#name')).toHaveText('Mira', { timeout: 1000 });
  await expect(page.locator('#counts')).toContainText('following');
  await expect(page.locator('#skel')).toBeHidden();
});

test('the feed draws three posts\' worth of skeleton while it\'s read', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await page.route(u => u.pathname.endsWith('/rest/v1/rpc/activity'), async route => { await new Promise(r => setTimeout(r, 1200)); route.fallback(); });
  await page.goto('/feed/?everyone');
  await expect(page.locator('#fskel')).toBeVisible();
  await expect(page.locator('#fskel .fsk')).toHaveCount(3);
  await expect(page.locator('#state')).toHaveClass(/\bvh\b/);
  await expect(page.locator('#items > li').first()).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#fskel')).toBeHidden();
});

test('no layout jump from pictures: the profile photo and the title page\'s cover have their size before they load', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  expect(await page.locator('#ava img').evaluate(i => [i.getAttribute('width'), i.getAttribute('height')])).toEqual(['96', '96']);
  await open(page, '/t/?film=106&title=Gummo&year=1997');
  expect(await page.locator('#tCover img').evaluate(i => [i.getAttribute('width'), i.getAttribute('height')])).toEqual(['120', '180']);
});
