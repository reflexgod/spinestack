// A profile's tabs (/u/?name): Profile · Shelves · Activity · Network, the main shelf at the top of Profile, a line
// for each shelf saved in Activity, Following · Followers in Network.
const { test, expect } = require('@playwright/test');
const { SHELVES, PEOPLE, ME, SB_URL, CORS, mockNetwork, watchErrors, open } = require('../site');

const NOW = new Date('2026-09-30T14:00:00Z');   // two hours after the newest made-up shelf was saved
const tabs = page => page.getByRole('tablist', { name: 'Profile' }).getByRole('tab');
const selected = (page, name) => expect(page.getByRole('tablist', { name: 'Profile' }).getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
const followList = (page, kind) => page.waitForRequest(r => r.url().includes('/rpc/follow_list') && r.postDataJSON().kind === kind);   // the Network tab's list (the page asks for the followers once by itself, for "Followed by")

test('the tabs are Profile · Shelves · Activity · Network, each with its own address, kept on reload', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  await expect(tabs(page)).toHaveText(['Profile', 'Shelves', 'Activity', 'Network']);
  await selected(page, 'Profile');
  for (const [name, hash, panel] of [['Shelves', '#shelves', '#panelS'], ['Activity', '#activity', '#panelA'], ['Network', '#network', '#panelN'], ['Profile', '', '#panelP']]) {
    await tabs(page).filter({ hasText: name }).click();
    await selected(page, name);
    expect(new URL(page.url()).hash).toBe(hash);
    await expect(page.locator(panel)).toBeVisible();
    await expect(page.locator('#panelP, #panelS, #panelA, #panelN').locator('visible=true')).toHaveCount(1);
  }
  await open(page, '/u/?mira#activity');
  await selected(page, 'Activity');
  await expect(page.locator('#panelA')).toBeVisible();
  // ← → move along the row
  await tabs(page).nth(2).focus();
  await page.keyboard.press('ArrowRight');
  await selected(page, 'Network');
  await page.keyboard.press('ArrowRight');
  await selected(page, 'Profile');
  expect(errors).toEqual([]);
});

test('Profile: the main shelf comes first', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  await expect(page.locator('#panelP h2').first()).toHaveText('Main shelf');
  await expect(page.locator('#featCap')).toHaveText('shelf number 1');   // none picked: the newest public one
  const main = await page.locator('#featWrap').boundingBox(), recent = await page.locator('#recentWrap').boundingBox();
  expect(main.y).toBeLessThan(recent.y);
});

test('Activity: a line for each shelf saved, newest first, its card under the line and no photo beside it', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira#activity');
  const lines = page.locator('#acts .line');
  await expect(lines).toHaveCount(6);
  const text = (await lines.allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
  expect(text[0]).toBe('@mira shelved shelf number 1 · 1d');
  expect(text[1]).toBe('@mira updated untitled shelf · 4d');   // saved again later than it was made
  expect(text[2]).toBe('@mira shelved shelf number 7 · 1w');
  expect(text[5]).toBe('@mira updated untitled shelf · 2w');
  await expect(page.locator('#acts .fa')).toHaveCount(0);
  const first = page.locator('#acts .item').first(), mira = PEOPLE[1], shelf = SHELVES[1];
  await expect(first.locator('.line a').nth(1)).toHaveAttribute('href', `/u/?mira&shelf=${shelf.id}`);
  await expect(first.locator('.pic')).toHaveAttribute('href', `/u/?mira&shelf=${shelf.id}`);
  const card = await first.locator('.pic').boundingBox(), line = await first.locator('.line').boundingBox();
  expect(Math.round(card.width)).toBe(150);
  expect(Math.abs(card.x - line.x)).toBeLessThanOrEqual(1);
  expect(card.y).toBeGreaterThan(line.y);
  expect(mira.username).toBe('mira');
});

test('Network: Following first, then Followers; the numbers at the top open them', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  let asked = followList(page, 'following');
  await open(page, '/u/?mira#network');
  expect((await asked).postDataJSON()).toMatchObject({ uid: PEOPLE[1].id, kind: 'following' });
  const sub = page.getByRole('tablist', { name: 'Network' }).getByRole('tab');
  await expect(sub).toHaveText(['Following', 'Followers']);
  await expect(sub.first()).toHaveAttribute('aria-selected', 'true');
  const people = page.locator('#netPeople .person');
  await expect(people).toHaveCount(2);
  await expect(people.first().locator('.pn')).toHaveAttribute('href', '/u/?tester');
  await expect(people.first().getByRole('button')).toHaveCount(0);               // that's you: no FOLLOW
  await expect(people.nth(1).getByRole('button', { name: 'Follow' })).toBeVisible();
  // Followers
  asked = followList(page, 'followers');
  await sub.nth(1).click();
  expect((await asked).postDataJSON()).toMatchObject({ kind: 'followers' });
  await expect(sub.nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).hash).toBe('#followers');
  await expect(people).toHaveCount(2);
  // from the Profile tab, the number FOLLOWING opens Network on Following, FOLLOWERS on Followers; no sheet
  await tabs(page).first().click();
  asked = followList(page, 'following');
  await page.locator('.statlink[data-list="following"] button').click();
  expect((await asked).postDataJSON()).toMatchObject({ kind: 'following' });
  await selected(page, 'Network');
  await expect(sub.first()).toHaveAttribute('aria-selected', 'true');
  await page.locator('.statlink[data-list="followers"] button').click();
  await expect(sub.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#listSheet')).toBeHidden();
  await open(page, '/u/?mira#followers');
  await selected(page, 'Network');
  await expect(sub.nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('on your own profile the account menu\'s Shelves, Activity and Network change the tab without loading the page again', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester');
  await page.evaluate(() => { window.stayed = true; });
  for (const [item, tab] of [['Activity', 'Activity'], ['Network', 'Network'], ['Shelves', 'Shelves']]) {
    await page.locator('#acctBtn').click();
    await page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: item, exact: true }).click();
    await selected(page, tab);
    await expect(page.getByRole('menu', { name: 'Account' })).toBeHidden();   // nothing loaded, so the menu shut itself
  }
  expect(await page.evaluate(() => window.stayed)).toBe(true);
  // your own Activity has your shelves
  await tabs(page).nth(2).click();
  await expect(page.locator('#acts .line')).toHaveCount(6);
  await expect(page.locator('#acts .line').first()).toHaveText(/^@tester (shelved|updated) /);
});

/* ---------- who you both know ---------- */
const mutual = page => page.locator('.mutual:visible');
// the followers list answered with these people, each one someone you follow
const followedBy = (page, names) => page.route(u => u.origin === SB_URL && u.pathname === '/rest/v1/rpc/follow_list', route => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const rows = names.map((n, i) => ({ id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, '0')}`, username: n, display_name: '', avatar_key: null, is_private: false, followed_at: new Date(Date.UTC(2026, 8, 30 - i)).toISOString(), i_follow: n !== 'stranger', i_requested: false }));
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(route.request().postDataJSON().kind === 'followers' ? rows : []) });
});

test('"Follows you" is by the name of someone who follows you', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  const asked = page.waitForRequest(r => r.url().includes('/rest/v1/follows?'));
  await open(page, '/u/?mira');
  const q = new URL((await asked).url()).searchParams;
  expect([q.get('follower'), q.get('followee')]).toEqual(['eq.' + PEOPLE[1].id, 'eq.' + ME.id]);
  const tag = page.locator('#followsYou');
  await expect(tag).toBeVisible();
  await expect(tag).toHaveText('Follows you');
  const name = await page.locator('#name').boundingBox(), box = await tag.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(name.x + name.width);                                       // after the name
  expect(Math.abs(box.y + box.height / 2 - (name.y + name.height / 2))).toBeLessThanOrEqual(8);   // on its line
  // someone who doesn't follow you, and your own profile: no tag
  await open(page, '/u/?longusername_twenty1');
  await expect(page.locator('#name')).toHaveText('@longusername_twenty1');
  await expect(tag).toBeHidden();
  await open(page, '/u/?tester');
  await expect(page.locator('#name')).toHaveText('Test Person');
  await expect(tag).toBeHidden();
  expect(errors).toEqual([]);
});

test('"Followed by": the people you follow who follow them, under the bio', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?longusername_twenty1');   // @mira, whom you follow, follows them
  await expect(mutual(page)).toHaveCount(1);
  await expect(mutual(page)).toHaveText('Followed by @mira');
  await expect(mutual(page).getByRole('link', { name: '@mira' })).toHaveAttribute('href', '/u/?mira');
  // @mira's own followers are you and someone you don't follow: nothing to say
  await open(page, '/u/?mira');
  await expect(page.locator('#followsYou')).toBeVisible();
  await expect(mutual(page)).toHaveCount(0);
  // under the bio
  await followedBy(page, ['ana', 'ben']);
  await open(page, '/u/?mira');
  await expect(mutual(page)).toHaveText('Followed by @ana and @ben');
  const bio = await page.getByText('Films, mostly.').locator('visible=true').boundingBox(), line = await mutual(page).boundingBox();
  expect(line.y).toBeGreaterThanOrEqual(bio.y + bio.height);
  expect(line.y - (bio.y + bio.height)).toBeLessThan(60);
});

test('"Followed by" names two and counts the others, who are a press away', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await followedBy(page, ['ana', 'stranger', 'ben', 'cat']);
  await open(page, '/u/?mira');
  await expect(mutual(page)).toHaveText('Followed by @ana, @ben and 1 other');   // the stranger isn't someone you follow
  await followedBy(page, ['ana', 'ben', 'cat', 'dev', 'eli']);   // the newer answer is the one that's used
  await open(page, '/u/?mira');
  await expect(mutual(page)).toHaveText('Followed by @ana, @ben and 3 others');
  await mutual(page).getByRole('link', { name: '3 others' }).click();
  await selected(page, 'Network');
  await expect(page.getByRole('tablist', { name: 'Network' }).getByRole('tab', { name: 'Followers' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#netPeople .person')).toHaveCount(5);
});

test('signed out, a profile has neither "Follows you" nor "Followed by"', async ({ page }) => {
  await mockNetwork(page);
  let asked = 0; page.on('request', r => { if (r.url().includes('/rest/v1/follows?')) asked++; });
  await open(page, '/u/?longusername_twenty1');
  await expect(page.locator('#followsYou')).toBeHidden();
  await expect(mutual(page)).toHaveCount(0);
  expect(asked).toBe(0);
});

