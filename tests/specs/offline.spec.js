// Signed in, but shelfstackd's database can't be reached: the pages say so calmly, and never take it for "no username
// yet" (which would offer Finish sign-up and the username sheet to someone who has one).
const { test, expect } = require('@playwright/test');
const { SB_URL, mockNetwork, open } = require('../site');

const offline = page => page.route(u => u.origin === SB_URL && u.pathname.startsWith('/rest/'), route => route.abort('internetdisconnected'));
const SAYS = 'Couldn’t reach shelfstackd. Check your connection and try again.';

test('Settings says it couldn\'t reach shelfstackd, with Try again, and the bar offers no Finish sign-up', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await offline(page);
  await open(page, '/settings/');
  await expect(page.locator('#gateText')).toHaveText(SAYS);
  await expect(page.locator('#gate').getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.locator('#gateLink')).toBeHidden();
  await expect(page.getByText(/pick a username/i)).toHaveCount(0);
  await expect(page.locator('#signInBtn')).toBeHidden();
});

test('the feed\'s You tab says it couldn\'t reach shelfstackd, not that you have nothing', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await offline(page);
  await open(page, '/feed/?you');
  await expect(page.locator('#state')).toHaveText(SAYS);
  await expect(page.locator('#none')).toBeHidden();
  await expect(page.locator('#signInBtn')).toBeHidden();
});

test('a profile says it couldn\'t reach shelfstackd', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await offline(page);
  await open(page, '/u/?mira');
  await expect(page.locator('#state')).toHaveText(SAYS);
});

test('the builder: Save says the account couldn\'t load, and doesn\'t ask for a username', async ({ page }) => {
  test.setTimeout(120000);
  await mockNetwork(page, { signedIn: true });
  await offline(page);
  await open(page, '/build/');
  // the Supabase library tries the account a few times before it gives up
  await expect(page.locator('#toast')).toHaveText('Couldn’t load your account. Check your connection and try again.', { timeout: 30000 });
  await expect(page.locator('#signInBtn')).toBeHidden();
  await page.locator('header.top .add').click();
  const d = page.locator('#addDialog');
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  await d.getByRole('button', { name: 'Add to shelf' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // it asks for the account again, 3 times over about 10 seconds, saying Saving… meanwhile, before it says so
  await expect(page.locator('#saveNote')).toHaveText('Saving…');
  await expect(page.locator('#toast')).toHaveText('Couldn’t load your account. Check your connection and try again.', { timeout: 60000 });
  await expect(page.locator('#namePane')).toBeHidden();
  await expect(page.locator('#sheet')).toBeHidden();
});

test('with no connection at all, the Add dialog\'s search says it didn\'t answer, and Log it\'s Post says it couldn\'t reach shelfstackd', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const d = page.locator('#addDialog');
  // Post first, with the search still there
  await page.locator('header.top .add').click();
  await d.getByRole('radio', { name: 'Log it' }).check();
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  await offline(page);
  await d.getByRole('button', { name: 'Post' }).click();
  await expect(d.locator('#addStatus')).toHaveText(SAYS, { timeout: 30000 });
  await expect(d).toBeVisible();
  // then the search, with everything off this site out of reach
  await page.route(u => u.hostname !== '127.0.0.1', route => route.abort('internetdisconnected'));
  await d.getByRole('button', { name: 'Change' }).click();
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('stalker');
  await expect(d.getByText(/didn’t answer\. Try again in a moment\./)).toBeVisible({ timeout: 30000 });
  await expect(d.getByRole('option')).toHaveCount(0);
});
