// A brand-new account (a username, and nothing else yet): every empty place says what to do next, in one line.
const { test, expect } = require('@playwright/test');
const { mockNetwork, watchErrors, open } = require('../site');

test('home: "Welcome", not "Welcome back", and what to do first; the empty row says how to find people', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, fresh: true });
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome, @tester. Start your shelf with + Add, then follow a few people to see theirs.');
  await expect(page.locator('#folNone')).toHaveText('Follow people to see their shelves here. Find members');
  await expect(page.locator('#folNone').getByRole('link', { name: 'Find members' })).toHaveAttribute('href', 'members/');
  expect(errors).toEqual([]);
});

test('home for someone who follows people with shelves still says "Welcome back"', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome back, @tester. Here’s what people you follow have been shelving…');
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
  await expect(page.locator('#hello')).toHaveText('Welcome back, @tester. Follow a few people to see their shelves here.');
  await expect(page.locator('#hello')).not.toContainText('Start your shelf');
  await expect(page.locator('#folNone')).toHaveText('Follow people to see their shelves here. Find members');
  expect(errors).toEqual([]);
});

test('home for someone with no shelf yet and nothing from people they follow: "Welcome", and to start the shelf', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await nothingFromFollowing(page);
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome, @tester. Start your shelf with + Add, then follow a few people to see theirs.');
});

test('home when your own shelves can\'t be read: nobody is told to start a shelf they may have', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await nothingFromFollowing(page);
  await page.route(u => u.pathname === '/rest/v1/shelves', route => route.request().method() === 'OPTIONS' ? route.fallback() : route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"message":"no"}' }));
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome back, @tester. Follow a few people to see their shelves here.');
});

test('your empty profile: the shelf, the watchlist, From friends, Activity and Network each say what to do next', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, fresh: true });
  await open(page, '/u/?tester');
  await expect(page.locator('#hero')).toContainText('Your shelf is empty.');
  await expect(page.locator('#hero').getByRole('link', { name: 'Make your shelf' })).toBeVisible();
  // no bio: "add a bio", beside the profile on a wide window and under you on a phone
  await expect(page.getByRole('link', { name: 'add a bio' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'add a bio' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'add a bio' })).toHaveAttribute('href', '../settings/');
  await expect(page.locator('#watchNone')).toHaveText('Nothing here yet. Pick Watchlist in + Add to keep a film or a book for later.');
  await expect(page.locator('#friendsNone')).toHaveText('Nothing from friends yet. What people you follow log shows up here. Find people');
  await expect(page.locator('#friendsNone').getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '../members/');
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.locator('#actsNoneMine')).toHaveText('Nothing here yet. Log a film or a book with + Add, or save your shelf.');
  await expect(page.locator('#actsNone')).toBeHidden();
  await page.getByRole('tab', { name: 'Network' }).click();
  await expect(page.locator('#netNone')).toHaveText('You’re not following anyone yet. Find people');
  await expect(page.locator('#netNone').getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '../members/');
  await page.getByRole('tablist', { name: 'Network' }).getByRole('tab', { name: 'Followers' }).click();
  await expect(page.locator('#netNone')).toHaveText('No followers yet. Share your shelf from its page and they’ll find you.');
  expect(errors).toEqual([]);
});

test('someone else\'s empty lists stay plain: nothing to do there', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false, logs: true });
  await page.route(u => u.pathname.endsWith('/rpc/follow_list'), route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }));
  await open(page, '/u/?mira#network');
  await expect(page.locator('#netNone')).toHaveText('Not following anyone yet.');
  await expect(page.locator('#netNone a')).toHaveCount(0);
});

test('the feed: Following and You say what to do when there\'s nothing', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, fresh: true });
  await open(page, '/feed/');
  await expect(page.locator('#none')).toHaveText('Follow people to see what they shelve and log here.Everyone');
  await page.getByRole('tab', { name: 'You' }).click();
  await expect(page.locator('#none')).toContainText('Nothing from you yet. Save your shelf, or log a film or a book with + Add.');
  await expect(page.locator('#none').getByRole('link', { name: 'Your shelf' })).toBeVisible();
});

test('signing up: the username sheet speaks of your shelf, one each', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, named: false });
  await open(page, '/build/');
  await expect(page.locator('#namePane')).toContainText('It’s how people find your shelf. You can change it once a month.');
});
