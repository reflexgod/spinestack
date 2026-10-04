// The feed (/feed/): Following · Everyone, a line for each shelf saved ("@abc shelved my films · 2h") with its card,
// and for each film or book logged, a post ("@abc watched Gummo · 1h") with its cover, worn by how long ago that was.
// The next 20 come as the end nears; every minute it says how many newer ones there are; an empty Following has
// People to follow.
const { test, expect } = require('@playwright/test');
const { SHELVES, LOGS, mockNetwork, watchErrors, open } = require('../site');

// the made-up shelves were saved at noon on 30 Sep 2026 and on each day before it: two hours later, the newest says 2h
const NOW = new Date('2026-09-30T14:00:00Z');
const lines = page => page.locator('#items .line');
const tabs = page => page.getByRole('tablist', { name: 'Feed' }).getByRole('tab');

test('the tabs are Following · Everyone; signed in it opens on Following', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/');
  await expect(tabs(page)).toHaveText(['Following', 'Everyone']);
  await expect(page.getByRole('tab', { name: 'Following' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/feed\/\?following$/);
  await expect(lines(page)).toHaveCount(8);   // only @mira is followed: her six shelves and two logs
  for (const t of await lines(page).allTextContents()) expect(t).toMatch(/^@mira (shelved|updated|watched|read) /);
  expect(errors).toEqual([]);
});

test('a line says who shelved or logged what and how long ago; a shelf\'s card or a log\'s cover is under it', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await expect(lines(page)).toHaveCount(20);   // 20 at a time
  let text = (await lines(page).allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
  expect(text[0]).toBe('@mira watched Gummo · 1h');   // a post: how long ago, as a shelf has it
  expect(text[1]).toBe('@tester shelved a much longer shelf name that has to be cut short · 2h');
  expect(text[2]).toBe('@mira shelved shelf number 1 · 1d');
  expect(text[4]).toBe('@tester read Just Kids · 3d');
  expect(text[5]).toBe('@tester shelved shelf number 3 · 3d');
  expect(text[6]).toBe('@mira updated untitled shelf · 4d');   // saved again later than it was made
  expect(text[9]).toBe('@mira read The Waves · 1w');
  expect(text[10]).toBe('@mira shelved shelf number 7 · 1w');
  // Load more: the rest, from after the last one shown
  const more = page.waitForRequest(r => r.url().includes('/rpc/activity') && r.postDataJSON().before_id);
  await page.getByRole('button', { name: 'Load more' }).click();
  expect((await more).postDataJSON()).toMatchObject({ scope: 'everyone', before_id: SHELVES[16].id });
  await expect(lines(page)).toHaveCount(22);
  text = (await lines(page).allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
  expect(text[20]).toBe('@longusername_twenty1 shelved shelf number 17 · 2w');
  expect(text[21]).toBe('@longusername_twenty1 watched Kids · 1mo');
  // a log: the title and the time go to the post's own page; its cover is small (72 x 108px, not a card's 150 x
  // 225), in line with the text, and the caption is beside it, on a phone too
  const log = page.locator('#items .item.log').first(), cover = log.locator('.cover canvas');
  await expect(log.locator('.line a')).toHaveCount(3);   // @mira, Gummo, 1h
  await expect(log.locator('.line').getByRole('link', { name: 'Gummo' })).toHaveAttribute('href', /\/p\/\?bbbbbbbb-bbbb-4bbb-8bbb-000000000000$/);
  await expect(log.locator('.line b')).toHaveText('Gummo');
  await expect(log.locator('time')).toHaveAttribute('datetime', LOGS[0].created_at);
  await expect(cover).toHaveAttribute('aria-label', 'Gummo (1997), watched by @mira');
  const c = await cover.boundingBox(), line = await log.locator('.line').boundingBox(), say = await log.locator('.say').boundingBox();
  expect(Math.round(c.width)).toBe(72);
  expect(Math.round(c.height)).toBe(108);
  expect(Math.abs(c.x - line.x)).toBeLessThanOrEqual(1);
  await expect(log.locator('.say')).toHaveText('The bathtub scene. Still thinking about it.');
  expect(say.x).toBeGreaterThan(c.x + c.width);   // beside it
  expect(Math.abs(say.y - c.y)).toBeLessThanOrEqual(1);
  expect(say.width).toBeGreaterThan(200);          // with room to read it, on a phone too
  expect((await log.boundingBox()).height).toBeLessThan(200);   // a log is a line, a small cover and a row of actions (it was about 300px on a phone)
  // drawn for that size, so it's sharp: the canvas has a pixel for each of the screen's
  expect(await cover.evaluate(el => el.width / (el.getBoundingClientRect().width * Math.min(2, devicePixelRatio)))).toBeCloseTo(1, 1);
  // older, more worn: today nearly new, a week faded, a month worn
  const worn = async title => page.locator('#items .item.log').filter({ has: page.locator('.line b', { hasText: new RegExp(`^${title}$`) }) }).locator('canvas')
    .evaluate(el => ({ fade: +el.dataset.fade, wear: +el.dataset.wear }));
  const today = await worn('Gummo'), week = await worn('The Waves'), month = await worn('Kids');
  expect(today.fade).toBeLessThan(.06);
  expect(today.wear).toBeGreaterThan(.2);
  expect(today.wear).toBeLessThan(.3);
  expect(week.fade).toBeGreaterThan(today.fade + .1);
  expect(month.wear).toBeGreaterThan(week.wear + .25);
  expect(month.fade).toBeGreaterThan(week.fade);
  // a shelf: the name is a link to the person, the shelf's a link to the shelf, and so is its card
  const first = page.locator('#items .item:not(.log)').first();
  await expect(first.locator('.line a').first()).toHaveAttribute('href', '../u/?tester');
  await expect(first.locator('.line a').nth(1)).toHaveAttribute('href', `../u/?tester&shelf=${SHELVES[0].id}`);
  await expect(first.locator('.pic')).toHaveAttribute('href', `../u/?tester&shelf=${SHELVES[0].id}`);
  await expect(first.locator('time')).toHaveAttribute('datetime', SHELVES[0].saved_at);
});

test('?you, from when there was a You tab, is Following', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?you');
  await expect(page.getByRole('tab', { name: 'Following' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/feed\/\?following$/);
});

test('signed out: Everyone shows; Following asks you to sign in', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/feed/');
  await expect(page.getByRole('tab', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true');
  await expect(lines(page)).toHaveCount(20);
  for (const [tab, says] of [['Following', /^Sign in to see who you follow\.$/]]) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(lines(page)).toHaveCount(0);
    await expect(page.locator('#none')).toHaveText(says);
  }
  await page.locator('#none').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
});

test('a database without logs (0007 not run on it): shelves only, as before', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, logs: false });
  const asked = [];
  page.on('request', r => { if (r.url().includes('/rest/v1/rpc/')) asked.push(new URL(r.url()).pathname.split('/').pop()); });
  await open(page, '/feed/?everyone');
  await expect(lines(page)).toHaveCount(18);
  await expect(page.locator('#items .item.log')).toHaveCount(0);
  for (const t of await lines(page).allTextContents()) expect(t).toMatch(/ (shelved|updated) /);
  expect(asked).toEqual(['activity', 'feed']);   // asked once, then the feed of 0006
  await page.getByRole('tab', { name: 'Following' }).click();
  await expect(lines(page)).toHaveCount(6);   // @mira's shelves
  expect(asked.filter(a => a === 'activity')).toHaveLength(1);   // not asked again on this page
});

test('a film logged with + ADD shows at the top of the feed', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  const d = page.getByRole('dialog');
  await d.getByRole('radio', { name: 'Log it' }).check();
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  const posted = page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/logs');
  const again = page.waitForRequest(r => r.url().includes('/rpc/activity'));
  await d.getByRole('button', { name: 'Post' }).click();
  expect((await posted).postDataJSON()).toMatchObject({ kind: 'movie', title: 'Gummo', caption: '' });
  expect((await again).postDataJSON()).toMatchObject({ scope: 'everyone', before_id: null });   // the tab from the top
  await expect(d).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Logged Gummo. It’s on the feed.');
  expect(errors).toEqual([]);
});

test('← and → move between the tabs', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?following');
  await page.getByRole('tab', { name: 'Following' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Everyone' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Following' })).toHaveAttribute('aria-selected', 'true');
});

test('the next 20 come by themselves as the end of the list nears', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await expect(lines(page)).toHaveCount(20);
  const more = page.waitForRequest(r => r.url().includes('/rpc/activity') && r.postDataJSON().before_id);
  await page.locator('#more').scrollIntoViewIfNeeded();   // no press
  expect((await more).postDataJSON()).toMatchObject({ scope: 'everyone', before_id: SHELVES[16].id });
  await expect(lines(page)).toHaveCount(22);
});

test('every minute: "2 new posts" at the top when there are newer ones; it moves nothing until pressed', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await expect(lines(page)).toHaveCount(20);
  const pill = page.locator('#newPill');
  await page.clock.runFor(61000);
  await expect(pill).toBeHidden();   // nothing newer yet
  // two posts arrive
  const fresh = [1, 2].map(i => ({ what: 'log', id: `ffffffff-ffff-4fff-8fff-00000000010${i}`, at: new Date(NOW.getTime() + i * 1000).toISOString(), owner: '22222222-2222-4222-8222-222222222222',
    username: 'mira', display_name: 'Mira', avatar_key: null, caption: '', name: null, preview_key: null, created_at: NOW.toISOString(), updated_at: NOW.toISOString(), updated: false, is_public: true,
    kind: 'movie', title: 'New ' + i, author: '', year: 2026, cover_src: null }));
  // (from now on the top of the feed is just those two)
  await page.route(u => u.pathname === '/rest/v1/rpc/activity', route => route.request().method() !== 'POST' || route.request().postDataJSON().before_id ? route.fallback()
    : route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(fresh.slice().reverse()) }));
  const y = await page.evaluate(() => scrollY);
  await page.clock.runFor(60000);
  await expect(pill).toHaveText('2 new posts');
  await expect(lines(page).first()).toContainText('watched Gummo');   // nothing moved
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await pill.click();
  await expect(pill).toBeHidden();
  await expect(lines(page).first()).toContainText('watched New 2');
});

test('Following with nothing from anyone you follow: People to follow, each with their first five spines and Follow', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, fresh: true });   // follows no one
  await open(page, '/feed/?following');
  const box = page.locator('.tofollow');
  await expect(box.getByRole('heading', { name: 'People to follow' })).toBeVisible();
  const people = box.locator('.person');
  await expect(people).toHaveCount(2);   // the people behind the newest shelves and posts, not you
  await expect(people.locator('.pn span')).toHaveText(['@mira', '@longusername_twenty1']);
  await expect(people.first().locator('.sp canvas')).toHaveCount(3);   // her shelf has three
  await expect(people.nth(1).locator('.sp canvas')).toHaveCount(5);   // five at most: this one has eight
  const follow = people.first().getByRole('button', { name: 'Follow' });
  const req = page.waitForRequest(r => r.url().includes('/rpc/follow'));
  await follow.click();
  expect((await req).postDataJSON()).toEqual({ target: '22222222-2222-4222-8222-222222222222' });
  await expect(people.first().locator('button.follow')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
