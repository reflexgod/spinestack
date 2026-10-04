// The feed (/feed/), a timeline in one 600px column: the composer, Following · Everyone staying under the bar, then a
// line for each shelf saved ("@abc shelved my films · 2h") with its card, and for each film or book logged a post
// (name and @name, "watched Gummo (1997)", the review, its cover small at the right, worn by how long ago that was).
// The next 20 come as the end nears; every minute it says how many newer ones there are; an empty Following has
// People to follow.
const { test, expect } = require('@playwright/test');
const { SHELVES, LOGS, mockNetwork, watchErrors, open } = require('../site');

// the made-up shelves were saved at noon on 30 Sep 2026 and on each day before it: two hours later, the newest says 2h
const NOW = new Date('2026-09-30T14:00:00Z');
const lines = page => page.locator('#items > li');
// what each says: "@name watched Title (year) · when", or for a shelf saved "@name added 2 to their shelf · when"
const said = page => lines(page).evaluateAll(lis => lis.map(li =>
  `${li.querySelector('.pwho span').textContent} ${li.querySelector('.pwhat').textContent} · ${li.querySelector('time').textContent}`.replace(/\s+/g, ' ').trim()));
const tabs = page => page.getByRole('tablist', { name: 'Feed' }).getByRole('tab');
const isPhone = () => test.info().project.name.startsWith('phone');

test('the tabs are Following · Everyone; signed in it opens on Following', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/');
  await expect(tabs(page)).toHaveText(['Following', 'Everyone']);
  await expect(page.getByRole('tab', { name: 'Following' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/feed\/\?following$/);
  await expect(lines(page)).toHaveCount(8);   // only @mira is followed: her six shelves and two logs
  for (const t of await said(page)) expect(t).toMatch(/^@mira (added|updated|started|watched|read) /);
  expect(errors).toEqual([]);
});

test('a line says who shelved what and how long ago; a post who watched or read what; a shelf\'s card or a post\'s cover with it', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await expect(lines(page)).toHaveCount(20);   // 20 at a time
  let text = await said(page);
  expect(text[0]).toBe('@mira watched Gummo (1997) · 1h');
  expect(text[1]).toBe('@tester started their shelf · 2h');
  expect(text[2]).toBe('@mira added 2 to their shelf · 1d');   // the two spines marked as first saved just before it
  expect(text[4]).toBe('@tester read Just Kids (2010) · 3d');
  expect(text[5]).toBe('@tester started their shelf · 3d');
  expect(text[6]).toBe('@mira updated their shelf · 4d');   // saved again later than it was made, nothing marked new
  expect(text[9]).toBe('@mira read The Waves (1931) · 1w');
  expect(text[10]).toBe('@mira started their shelf · 1w');
  // Load more: the rest, from after the last one shown
  const more = page.waitForRequest(r => r.url().includes('/rpc/activity') && r.postDataJSON().before_id);
  await page.getByRole('button', { name: 'Load more' }).click();
  expect((await more).postDataJSON()).toMatchObject({ scope: 'everyone', before_id: SHELVES[16].id });
  await expect(lines(page)).toHaveCount(22);
  text = await said(page);
  expect(text[20]).toBe('@longusername_twenty1 started their shelf · 2w');
  expect(text[21]).toBe('@longusername_twenty1 watched Kids (1995) · 1mo');
  // a post: the photo (40px) at its left; "Mira @mira · 1h"; the title in bold, a link to the post's own page; the
  // review; the cover small (72 x 108px) at its right; no box, a thin rule under it
  const post = page.locator('#items .post:not(.shelfpost)').first(), cover = post.locator('.cover canvas');
  const ava = await post.locator('.pava').boundingBox();
  expect(Math.round(ava.width)).toBe(40);
  await expect(post.locator('.phead .pwho')).toHaveText(/^Mira\s+@mira$/);
  await expect(post.locator('.pwhat').getByRole('link', { name: 'Gummo' })).toHaveAttribute('href', /\/p\/\?bbbbbbbb-bbbb-4bbb-8bbb-000000000000$/);
  expect(await post.locator('.pwhat').evaluate(el => getComputedStyle(el).fontWeight)).toBe('700');
  await expect(post.locator('time')).toHaveAttribute('datetime', LOGS[0].created_at);
  await expect(cover).toHaveAttribute('aria-label', 'Gummo (1997), watched by @mira');
  const c = await cover.boundingBox(), say = await post.locator('.say').boundingBox(), whole = await post.boundingBox();
  expect(Math.round(c.width)).toBe(isPhone() ? 56 : 72);
  expect(Math.round(c.height)).toBe(isPhone() ? 84 : 108);
  expect(c.x).toBeGreaterThan(say.x + say.width);                      // at the right of the review
  expect(Math.abs(c.x + c.width - (whole.x + whole.width))).toBeLessThanOrEqual(1);
  await expect(post.locator('.say')).toHaveText('The bathtub scene. Still thinking about it.');
  expect(say.x).toBeGreaterThan(ava.x + ava.width);
  expect(await post.evaluate(el => [getComputedStyle(el).borderBottomWidth, getComputedStyle(el).borderTopWidth, getComputedStyle(el).backgroundColor])).toEqual(['1px', '0px', 'rgba(0, 0, 0, 0)']);
  // drawn for that size, so it's sharp: the canvas has a pixel for each of the screen's
  expect(await cover.evaluate(el => el.width / (el.getBoundingClientRect().width * Math.min(2, devicePixelRatio)))).toBeCloseTo(isPhone() ? 72 / 56 : 1, 1);
  // older, more worn: today nearly new, a week faded, a month worn
  const worn = async title => page.locator('#items .post:not(.shelfpost)').filter({ has: page.locator('.pwhat a', { hasText: new RegExp(`^${title}$`) }) }).locator('canvas')
    .evaluate(el => ({ fade: +el.dataset.fade, wear: +el.dataset.wear }));
  const today = await worn('Gummo'), week = await worn('The Waves'), month = await worn('Kids');
  expect(today.fade).toBeLessThan(.06);
  expect(today.wear).toBeGreaterThan(.2);
  expect(today.wear).toBeLessThan(.3);
  expect(week.fade).toBeGreaterThan(today.fade + .1);
  expect(month.wear).toBeGreaterThan(week.wear + .25);
  expect(month.fade).toBeGreaterThan(week.fade);
  // a shelf saved: a compact post, the person a link to them, "their shelf" and the strip links to the shelf
  const first = page.locator('#items .shelfpost').first();
  await expect(first.locator('.pwho')).toHaveAttribute('href', /\/u\/\?tester$/);
  await expect(first.locator('.pwhat a')).toHaveAttribute('href', new RegExp(`/u/\\?tester&shelf=${SHELVES[0].id}$`));
  await expect(first.locator('.strip')).toHaveAttribute('href', new RegExp(`/u/\\?tester&shelf=${SHELVES[0].id}$`));
  await expect(first.locator('time')).toHaveAttribute('datetime', SHELVES[0].saved_at);
  await expect(first.locator('.pic')).toHaveCount(0);   // no card
});

test('a timeline: one 600px column in the middle, no heading on screen, the tabs staying under the bar, and a post a press through to its page', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const tl = await page.locator('.tl').boundingBox(), main = await page.locator('main').boundingBox();
  if (!isPhone()){ expect(Math.round(tl.width)).toBe(600); expect(Math.abs((tl.x + tl.width / 2) - (main.x + main.width / 2))).toBeLessThanOrEqual(1); }
  else expect(Math.round(tl.width)).toBe(Math.round(main.width));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Feed');   // for screen readers; nothing on screen says Activity
  expect(await page.locator('main h1').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  // scrolled down, the tabs are just under the bar
  await page.mouse.wheel(0, 1500); await page.waitForTimeout(300);
  const bar = await page.locator('header.top').boundingBox(), tabsBox = await page.getByRole('tablist', { name: 'Feed' }).boundingBox();
  expect(Math.abs(tabsBox.y - (bar.y + bar.height))).toBeLessThanOrEqual(14);
  // a press anywhere on a post that isn't a link or a button opens it
  const post = page.locator('#items .post').first();
  await post.scrollIntoViewIfNeeded();
  const say = await post.locator('.say').boundingBox();
  await page.mouse.click(say.x + 4, say.y + say.height / 2);
  await expect(page).toHaveURL(new RegExp(`/p/\\?${LOGS[0].id}$`));
});

test('the composer is a box like a tweet\'s: your photo at its left, and it grows when it has the focus', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const c = page.locator('#compose'), box = c.getByRole('combobox', { name: 'What did you watch or read?' });
  await expect(c.locator('.cava')).toHaveText('T');   // the made-up account has no photo: its first letter
  await expect(box).toHaveAttribute('placeholder', 'What did you watch or read?');
  await expect(c.getByRole('button', { name: 'Post' })).toBeHidden();
  const before = (await box.boundingBox()).height;
  await box.focus();
  await expect(c).toHaveClass(/open/);
  expect((await box.boundingBox()).height).toBeGreaterThan(before + 10);
  await expect(c.getByRole('button', { name: 'Post' })).toBeDisabled();   // nothing picked yet
  await page.locator('main .tabs').click();   // the focus goes: it shuts again
  await expect(c).not.toHaveClass(/open/);
});

test('a shelf saved is a compact post: "@mira added 2 to their shelf" and a strip of just those spines, 80px tall', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const mira = page.locator('#items .shelfpost').filter({ hasText: 'added 2 to their shelf' });
  await expect(mira).toHaveCount(1);
  const strip = mira.locator('.strip canvas');
  await expect(strip).toHaveCount(2);   // Kids and Delta of Venus, not Orlando, which was there before
  for (const c of await strip.all()) expect(Math.round((await c.boundingBox()).height)).toBeLessThanOrEqual(80);
  expect(Math.max(...await strip.evaluateAll(cs => cs.map(c => Math.round(c.getBoundingClientRect().height))))).toBe(80);
  // a save with nothing marked as new: its last five spines (this one has eight)
  const older = page.locator('#items .shelfpost').filter({ hasText: '@longusername_twenty1' }).first();
  await expect(older.locator('.pwhat')).toHaveText('started their shelf');
  await expect(older.locator('.strip canvas')).toHaveCount(5);
  // the whole post goes to the shelf
  const b = await mira.locator('.phead').boundingBox();
  await page.mouse.click(b.x + b.width - 2, b.y + b.height / 2);
  await expect(page).toHaveURL(new RegExp(`/u/\\?mira&shelf=${SHELVES[1].id}$`));
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
  await expect(page.locator('#items .post:not(.shelfpost)')).toHaveCount(0);
  for (const t of await said(page)) expect(t).toMatch(/ (added|started|updated) /);
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
  await d.getByRole('button', { name: 'Post' }).click();
  expect((await posted).postDataJSON()).toMatchObject({ kind: 'movie', title: 'Gummo', caption: '' });
  const top = page.locator('#items > li').first();   // on top at once
  await expect(top.locator('.pwho')).toContainText('@tester');
  await expect(top.locator('.pwhat')).toHaveText('watched Gummo (1997)');
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
