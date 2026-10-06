// A brand-new account (a username, and nothing else yet): every empty place says what to do next, in one line.
const { test, expect } = require('@playwright/test');
const { mockNetwork, watchErrors, open } = require('../site');

test('home: "Welcome", not "Welcome back", and nothing else on that line; the empty row says how to find people', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, fresh: true });
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome, @tester.');
  await expect(page.locator('#folNone')).toHaveText('No one followed yet. Find people');
  await expect(page.locator('#folNone').getByRole('link', { name: 'Find people' })).toHaveAttribute('href', 'people/');
  expect(errors).toEqual([]);
});

test('home for someone who follows people with shelves still says "Welcome back"', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome back, @tester.');
});

// nothing from the people you follow (or you follow no one), whichever way home asks for it
const nothingFromFollowing = page => page.route(u => /\/rest\/v1\/rpc\/(feed|activity)$/.test(u.pathname), route => {
  const req = route.request();
  if (req.method() === 'POST' && req.postDataJSON().scope === 'following') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
  return route.fallback();
});

test('home for someone who has a shelf but nothing from people they follow: still "Welcome back", and to follow people, not to start a shelf', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });   // the made-up account has a shelf
  await nothingFromFollowing(page);
  const asked = page.waitForRequest(r => r.url().includes('/rest/v1/shelves?') && r.url().includes('owner=eq.'));
  await open(page, '/');
  expect(new URL((await asked).url()).searchParams.get('owner')).toMatch(/^eq\.11111111-/);   // its own shelves, to see if it has one
  await expect(page.locator('#hello')).toHaveText('Welcome back, @tester.');   // the row's empty line says it once, not the welcome too
  await expect(page.locator('#folNone')).toHaveText('No one followed yet. Find people');
  expect(errors).toEqual([]);
});

test('home for someone with no shelf yet and nothing from people they follow: "Welcome", and to start the shelf', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await nothingFromFollowing(page);
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome, @tester.');
});

test('home when your own shelves can\'t be read: nobody is told to start a shelf they may have', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await nothingFromFollowing(page);
  await page.route(u => u.pathname === '/rest/v1/shelves', route => route.request().method() === 'OPTIONS' ? route.fallback() : route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"message":"no"}' }));
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome back, @tester.');
});

test('your empty profile: the shelf, the watchlist, From friends, Posts and People each say what to do next', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, fresh: true });
  await open(page, '/u/?tester');
  await expect(page.locator('#hero')).toContainText('Your shelf is empty.');
  await expect(page.locator('#hero').getByRole('link', { name: 'Make your shelf' })).toBeVisible();
  // no bio: "add a bio", in the header under you
  await expect(page.getByRole('link', { name: 'add a bio' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'add a bio' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'add a bio' })).toHaveAttribute('href', '../settings/');
  await expect(page.locator('#watchNone')).toHaveText('Nothing saved for later.');   // under the Watchlist heading: no second "Watchlist"
  await expect(page.locator('#friendsNone')).toHaveText('Your friends haven’t logged anything. Find people');
  await expect(page.locator('#friendsNone').getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '../people/');
  await page.getByRole('tab', { name: 'Posts' }).click();
  await expect(page.locator('#actsNoneMine')).toHaveText('Nothing logged or shelved yet.');
  await expect(page.locator('#actsNone')).toBeHidden();
  await page.getByRole('tab', { name: 'People' }).click();
  await expect(page.locator('#netNone')).toHaveText('You follow nobody yet. Find people');
  await expect(page.locator('#netNone').getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '../people/');
  await page.getByRole('tablist', { name: 'People' }).getByRole('tab', { name: 'Followers' }).click();
  await expect(page.locator('#netNone')).toHaveText('Nobody follows you yet.');
  expect(errors).toEqual([]);
});

test('someone else\'s empty lists stay plain: nothing to do there', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false, logs: true });
  await page.route(u => u.pathname.endsWith('/rpc/follow_list'), route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }));
  await open(page, '/u/?mira#network');
  await expect(page.locator('#netNone')).toHaveText('Not following anyone yet.');
  await expect(page.locator('#netNone a')).toHaveCount(0);
});

test('the feed: an empty Friends says so, then Follow these people, then Everyone', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, fresh: true });
  await open(page, '/feed/');
  await expect(page.locator('#none > p:first-child')).toHaveText('Nobody you follow has posted.');
  await expect(page.locator('#none').getByRole('heading', { name: 'Follow these people' })).toBeVisible();
  await expect(page.locator('#none').getByRole('heading', { name: /^Everyone/ })).toBeVisible();
});

test('signing up: the username sheet speaks of your shelf, one each', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, named: false });
  await open(page, '/build/');
  await expect(page.locator('#namePane')).toContainText('You can change it once a month.');
});

// every empty place a new account meets: a short line of its own (six words at most, links aside), never the words of
// another place, and no sentence about how to use the page
test('empty places: six words at most each, and no two the same', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, fresh: true });
  const said = [];
  const take = async (where, sel) => { const t = await page.locator(sel).evaluate(el => [...el.childNodes].filter(n => n.nodeType === 3 || (n.tagName !== 'A' && n.tagName !== 'BUTTON')).map(n => n.textContent).join('').trim()); said.push([where, t]); };
  await open(page, '/'); await take('home', '#folNone');
  await open(page, '/u/?tester'); await take('profile shelf', '#noneText'); await take('watchlist strip', '#watchNone'); await take('from friends', '#friendsNone');
  await page.getByRole('tab', { name: 'Posts' }).click(); await take('activity', '#actsNoneMine');
  await page.getByRole('tab', { name: 'Up next' }).click(); await take('watchlist tab', '#wNone');
  await page.getByRole('tab', { name: 'People' }).click(); await expect(page.locator('#netNone')).toBeVisible(); await take('following', '#netNone');
  await open(page, '/feed/?following'); await take('feed following', '#none > p:first-child');
  await open(page, '/build/'); await take('builder', '#books .empty p:first-child');
  for (const [where, t] of said){
    expect(t, where).not.toBe('');
    expect(t.split(/\s+/).length, `${where}: "${t}"`).toBeLessThanOrEqual(6);
  }
  const texts = said.map(x => x[1]);
  expect(new Set(texts).size, texts.join(' | ')).toBe(texts.length);
});
