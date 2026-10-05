// The bell and /notifications/ (migration 0009): signed in, the bar has a bell, with a dot while something is unread.
// The page lists likes, replies, me-toos and new followers, newest first; ones in a row about the same thing are one
// line ("@a and 2 others liked your log of Gummo"); opening it marks them read and the dot goes.
const { test, expect } = require('@playwright/test');
const { LOGS, PEOPLE, SB_URL, CORS, mockNetwork, watchErrors, open } = require('../site');

const bell = page => page.locator('header.top #bell');

test('the bell: signed in with 0009, a dot while something is unread; not without 0009, or signed out', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/');
  await expect(bell(page)).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName('Notifications, some unread');
  await expect(bell(page).locator('.dot')).toBeVisible();
  await expect(bell(page)).toHaveAttribute('href', '../notifications/');
  // the last of the places: Feed · Shelves · People · search · the bell
  await expect(page.locator('header.top .links a:not([hidden])')).toHaveCount(5);
  await expect(page.locator('header.top .links a').last()).toHaveId('bell');
  // and the bar's first row still has the logo, you and + ADD on one line, on a phone too
  const mark = await page.locator('header.top .mark').boundingBox(), add = await page.locator('header.top .add').boundingBox();
  expect(Math.abs(add.y + add.height / 2 - (mark.y + mark.height / 2))).toBeLessThan(8);
  await mockNetwork(page, { signedIn: true });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.removeItem('shelfstackd-0009-no'); });
  await open(page, '/feed/');
  await expect(bell(page)).toBeHidden();
  await mockNetwork(page, { social: true });
  await page.evaluate(() => Object.keys(localStorage).filter(k => /^sb-/.test(k)).forEach(k => localStorage.removeItem(k)));
  await open(page, '/shelves/');
  await expect(bell(page)).toBeHidden();
});

test('/notifications/: newest first, ones about the same thing together, a reply with what was said; then all read', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  const read = page.waitForRequest(r => r.url().includes('/rpc/notifications_read'));
  await open(page, '/notifications/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
  const lines = page.locator('#nlist li');
  await expect(lines).toHaveCount(4);
  const text = (await lines.locator('.nl').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim().replace(/ · \S+$/, ''));
  expect(text).toEqual([
    '@mira and @longusername_twenty1 liked your log of Just Kids',
    '@mira replied to your log of Just Kids',
    '@longusername_twenty1 followed you',
    '@mira said Same to your log of Just Kids',
  ]);
  await expect(lines.nth(1).locator('.nt')).toHaveText('Which train?');
  // the title goes to its own page (with its year, read from the log), the time to the post
  await expect(lines.first().getByRole('link', { name: 'Just Kids' })).toHaveAttribute('href', /\/t\/\?kind=book&title=Just\+Kids&year=2010$/);
  await expect(lines.first().locator('.ago a')).toHaveAttribute('href', `../p/?${LOGS[1].id}`);
  await expect(lines.nth(2).getByRole('link', { name: '@longusername_twenty1' })).toHaveAttribute('href', '../u/?longusername_twenty1');
  // what was unread is in bold; the rest isn't
  const weights = await lines.locator('.nl').evaluateAll(ps => ps.map(p => getComputedStyle(p).fontWeight));
  expect(weights).toEqual(['700', '700', '400', '400']);
  await read;
  await expect(bell(page).locator('.dot')).toBeHidden();
  await expect(bell(page)).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('three or more: "@a and 2 others"', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  const n = (id, who) => ({ id, kind: 'like', created_at: '2026-09-30T12:00:00Z', read: false, actor: who.id, username: who.username, display_name: who.display_name, avatar_key: null, log: LOGS[1].id, log_kind: 'book', log_title: 'Just Kids', reply_text: null });
  await page.route(u => u.origin === SB_URL && u.pathname === '/rest/v1/rpc/notifications_list', route => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify([n('1', PEOPLE[1]), n('2', PEOPLE[2]), n('3', { id: 'x', username: 'ola', display_name: 'Ola' })]) }));
  await open(page, '/notifications/');
  await expect(page.locator('#nlist li .nl')).toContainText('@mira and 2 others liked your log of Just Kids');
});

test('signed out: Sign in; without 0009: not open yet', async ({ page }) => {
  await mockNetwork(page, { social: true });
  await open(page, '/notifications/');
  await page.locator('#state').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
  await mockNetwork(page, { signedIn: true });
  await open(page, '/notifications/');
  await expect(page.locator('#state')).toHaveText('Notifications aren’t open yet.');
});
