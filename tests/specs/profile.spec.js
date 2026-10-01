// A profile's tabs (/u/?name): Profile · Shelves · Activity · Network, the main shelf at the top of Profile, a line
// for each shelf saved in Activity, Following · Followers in Network.
const { test, expect } = require('@playwright/test');
const { SHELVES, PEOPLE, mockNetwork, watchErrors, open } = require('../site');

const NOW = new Date('2026-09-30T14:00:00Z');   // two hours after the newest made-up shelf was saved
const tabs = page => page.getByRole('tablist', { name: 'Profile' }).getByRole('tab');
const selected = (page, name) => expect(page.getByRole('tablist', { name: 'Profile' }).getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
const followList = page => page.waitForRequest(r => r.url().includes('/rpc/follow_list'));

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
  let asked = followList(page);
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
  asked = followList(page);
  await sub.nth(1).click();
  expect((await asked).postDataJSON()).toMatchObject({ kind: 'followers' });
  await expect(sub.nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).hash).toBe('#followers');
  await expect(people).toHaveCount(2);
  // from the Profile tab, the number FOLLOWING opens Network on Following, FOLLOWERS on Followers; no sheet
  await tabs(page).first().click();
  asked = followList(page);
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
