// The feed (/feed/): Following · You · Everyone, a line for each shelf saved ("@abc shelved my films · 2h") with its
// card, and for each film or book logged ("@abc watched Gummo · today") with its cover, worn by how long ago that was.
const { test, expect } = require('@playwright/test');
const { SHELVES, LOGS, mockNetwork, watchErrors, open } = require('../site');

// the made-up shelves were saved at noon on 30 Sep 2026 and on each day before it: two hours later, the newest says 2h
const NOW = new Date('2026-09-30T14:00:00Z');
const lines = page => page.locator('#items .line');
const tabs = page => page.getByRole('tablist', { name: 'Feed' }).getByRole('tab');

test('the tabs are Following · You · Everyone; signed in it opens on Following', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/');
  await expect(tabs(page)).toHaveText(['Following', 'You', 'Everyone']);
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
  expect(text[0]).toBe('@mira watched Gummo · today');
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
  // a log: the title isn't a link (there's no page for a film), its cover is small (72 x 108px, not a card's 150 x
  // 225), in line with the text, and the caption is beside it, on a phone too
  const log = page.locator('#items .item.log').first(), cover = log.locator('.cover canvas');
  await expect(log.locator('.line a')).toHaveCount(1);
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
  expect((await log.boundingBox()).height).toBeLessThan(160);   // a log is a line and a small cover (it was about 300px on a phone)
  // drawn for that size, so it's sharp: the canvas has a pixel for each of the screen's
  expect(await cover.evaluate(el => el.width / (el.getBoundingClientRect().width * Math.min(2, devicePixelRatio)))).toBeCloseTo(1, 1);
  // older, more worn: today nearly new, a week faded, a month worn
  const worn = async title => page.locator('#items .item.log').filter({ has: page.locator('.line b', { hasText: new RegExp(`^${title}$`) }) }).locator('canvas')
    .evaluate(el => ({ fade: +el.dataset.fade, wear: +el.dataset.wear }));
  const today = await worn('Gummo'), week = await worn('The Waves'), month = await worn('Kids');
  expect(today.fade).toBeLessThan(.06);
  expect(today.wear).toBeLessThan(.12);
  expect(week.fade).toBeGreaterThan(today.fade + .1);
  expect(month.wear).toBeGreaterThan(week.wear + .3);
  expect(month.fade).toBeGreaterThan(week.fade);
  // a shelf: the name is a link to the person, the shelf's a link to the shelf, and so is its card
  const first = page.locator('#items .item:not(.log)').first();
  await expect(first.locator('.line a').first()).toHaveAttribute('href', '../u/?tester');
  await expect(first.locator('.line a').nth(1)).toHaveAttribute('href', `../u/?tester&shelf=${SHELVES[0].id}`);
  await expect(first.locator('.pic')).toHaveAttribute('href', `../u/?tester&shelf=${SHELVES[0].id}`);
  await expect(first.locator('time')).toHaveAttribute('datetime', SHELVES[0].saved_at);
});

test('You: your own shelves, said as "You shelved…", kept on reload', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/');
  await page.getByRole('tab', { name: 'You' }).click();
  await expect(page.getByRole('tab', { name: 'You' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/feed\/\?you$/);
  await expect(lines(page)).toHaveCount(7);
  for (const t of await lines(page).allTextContents()) expect(t).toMatch(/^You (shelved|updated|read) /);   // updated: saved again later than it was made
  await expect(lines(page).filter({ hasText: 'Just Kids' })).toHaveCount(1);
  await expect(page.locator('#items .pic').first()).toHaveAttribute('href', /\/u\/\?tester&shelf=/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'You' })).toHaveAttribute('aria-selected', 'true');
  await expect(lines(page)).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('signed out: Everyone shows; Following and You ask you to sign in', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/feed/');
  await expect(page.getByRole('tab', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true');
  await expect(lines(page)).toHaveCount(20);
  for (const [tab, says] of [['You', /to see your own shelf and logs here/], ['Following', /to see what people you follow shelve and log/]]) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(lines(page)).toHaveCount(0);
    await expect(page.locator('#none')).toHaveText(says);
  }
  await page.locator('#none').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
});

test('before the database has logs (the proposed 0007 not run yet): shelves only, as before', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, logs: false });
  const asked = [];
  page.on('request', r => { if (r.url().includes('/rest/v1/rpc/')) asked.push(new URL(r.url()).pathname.split('/').pop()); });
  await open(page, '/feed/?everyone');
  await expect(lines(page)).toHaveCount(18);
  await expect(page.locator('#items .item.log')).toHaveCount(0);
  for (const t of await lines(page).allTextContents()) expect(t).toMatch(/ (shelved|updated) /);
  expect(asked).toEqual(['activity', 'feed']);   // asked once, then the feed of 0006
  await page.getByRole('tab', { name: 'You' }).click();
  await expect(lines(page)).toHaveCount(6);
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
  await expect(page.getByRole('tab', { name: 'You' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'You' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true');
});
