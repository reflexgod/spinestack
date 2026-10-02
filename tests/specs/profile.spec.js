// A profile's tabs (/u/?name): Profile · Activity · Network. Profile has their shelf, big, then the watchlist and (on
// your own) From friends; Activity a line for each shelf saved and each film or book logged; Network Following ·
// Followers.
const { test, expect } = require('@playwright/test');
const { SHELVES, PEOPLE, ME, LOGS, WATCHLIST, SB_URL, CORS, mockNetwork, watchErrors, open } = require('../site');

const NOW = new Date('2026-09-30T14:00:00Z');   // two hours after the newest made-up shelf was saved
const tabs = page => page.getByRole('tablist', { name: 'Profile' }).getByRole('tab');
const selected = (page, name) => expect(page.getByRole('tablist', { name: 'Profile' }).getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
const followList = (page, kind) => page.waitForRequest(r => r.url().includes('/rpc/follow_list') && r.postDataJSON().kind === kind);   // the Network tab's list (the page asks for the followers once by itself, for "Followed by")

test('the tabs are Profile · Activity · Network, each with its own address, kept on reload', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  await expect(tabs(page)).toHaveText(['Profile', 'Activity', 'Network']);
  await selected(page, 'Profile');
  for (const [name, hash, panel] of [['Activity', '#activity', '#panelA'], ['Network', '#network', '#panelN'], ['Profile', '', '#panelP']]) {
    await tabs(page).filter({ hasText: name }).click();
    await selected(page, name);
    expect(new URL(page.url()).hash).toBe(hash);
    await expect(page.locator(panel)).toBeVisible();
    await expect(page.locator('#panelP, #panelA, #panelN').locator('visible=true')).toHaveCount(1);
  }
  await open(page, '/u/?mira#activity');
  await selected(page, 'Activity');
  await expect(page.locator('#panelA')).toBeVisible();
  // ← → move along the row
  await tabs(page).nth(1).focus();
  await page.keyboard.press('ArrowRight');
  await selected(page, 'Network');
  await page.keyboard.press('ArrowRight');
  await selected(page, 'Profile');
  // a link from when there was a Shelves tab is Profile
  await open(page, '/u/?mira#shelves');
  await selected(page, 'Profile');
  expect(errors).toEqual([]);
});

test('Profile: their shelf first, big, across the column; then the watchlist; no Most shelved', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  const hero = page.locator('#hero');
  await expect(hero.locator('#featCap')).toHaveText('shelf number 1');   // none picked as main: the one saved last
  await expect(hero.locator('#featMeta')).toHaveText(/^2 spines · /);
  await expect(page.locator('#nSpines')).toHaveText('2');
  await expect(hero.locator('canvas')).toHaveCount(1);
  await expect(hero.getByRole('link', { name: 'Edit' })).toBeHidden();   // not yours
  await expect(page.locator('#featLink')).toHaveAttribute('href', `/u/?mira&shelf=${SHELVES[1].id}`);
  await expect(page.getByText('Most shelved')).toHaveCount(0);
  await expect(page.getByText(/Main shelf|Recent shelves/)).toHaveCount(0);
  const h = await hero.boundingBox(), main = await page.locator('main').boundingBox(), watch = await page.locator('#watchSec').boundingBox();
  expect(Math.abs(h.width - main.width)).toBeLessThanOrEqual(1);   // the column's width
  expect(watch.y).toBeGreaterThan(h.y + h.height);
  // drawn big: half the story's size (the builder's preview is about a quarter), unless that's taller than the space
  const scale = await hero.locator('canvas').evaluate(c => c.getBoundingClientRect().width / c.width);
  if (test.info().project.name.startsWith('desktop')) expect(scale).toBeGreaterThanOrEqual(.45);
  // someone else's watchlist shows, with nothing to press; From friends is only ever your own
  await expect(page.locator('#watch li')).toHaveCount(1);
  await expect(page.locator('#watch li')).toContainText('Stalker 1979');
  await expect(page.locator('#watch').getByRole('button')).toHaveCount(0);
  await expect(page.locator('#friendsSec')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Activity: a line for each shelf saved and each film or book logged, newest first, with no photo beside it', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira#activity');
  const lines = page.locator('#acts .line');
  await expect(lines).toHaveCount(8);
  const text = (await lines.allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
  expect(text[0]).toBe('@mira watched Gummo · today');
  expect(text[1]).toBe('@mira shelved shelf number 1 · 1d');
  expect(text[2]).toBe('@mira updated untitled shelf · 4d');   // saved again later than it was made
  expect(text[3]).toBe('@mira read The Waves · 1w');
  expect(text[4]).toBe('@mira shelved shelf number 7 · 1w');
  expect(text[7]).toBe('@mira updated untitled shelf · 2w');
  await expect(page.locator('#acts .fa')).toHaveCount(0);
  await expect(page.locator('#acts').getByRole('button', { name: 'Delete' })).toHaveCount(0);   // not yours
  // a log: its cover, worn, and its caption beside it
  const log = page.locator('#acts .item.log').first();
  await expect(log.locator('.cover canvas')).toHaveAttribute('aria-label', 'Gummo (1997), watched by @mira');
  await expect(log.locator('.say')).toHaveText('The bathtub scene. Still thinking about it.');
  const cov = await log.locator('.cover canvas').boundingBox(), said = await log.locator('.say').boundingBox();
  expect([Math.round(cov.width), Math.round(cov.height)]).toEqual([72, 108]);   // small, as on the feed
  expect(said.x).toBeGreaterThan(cov.x + cov.width);
  const first = page.locator('#acts .item:not(.log)').first(), mira = PEOPLE[1], shelf = SHELVES[1];
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

test('on your own profile the account menu\'s Activity and Network change the tab without loading the page again; Shelf is your shelf\'s page', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester');
  await page.evaluate(() => { window.stayed = true; });
  for (const [item, tab] of [['Activity', 'Activity'], ['Network', 'Network']]) {
    await page.locator('#acctBtn').click();
    await page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: item, exact: true }).click();
    await selected(page, tab);
    await expect(page.getByRole('menu', { name: 'Account' })).toBeHidden();   // nothing loaded, so the menu shut itself
  }
  expect(await page.evaluate(() => window.stayed)).toBe(true);
  // your own Activity has your shelf and your log, and Delete on the log
  await tabs(page).nth(1).click();
  await expect(page.locator('#acts .line')).toHaveCount(7);
  await expect(page.locator('#acts .line').first()).toHaveText(/^@tester (shelved|updated) /);
  await expect(page.locator('#acts .item.log').getByRole('button', { name: 'Delete' })).toHaveCount(1);
  // Shelf: your shelf, on its own page
  await page.locator('#acctBtn').click();
  await page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Shelf', exact: true }).click();
  await expect(page).toHaveURL(/\/u\/\?tester&shelf$/);
  await expect(page.locator('#oneCap')).toHaveText(SHELVES[0].name);
  await expect(page.locator('#backLink')).toHaveText('← @tester');
});

/* ---------- the watchlist and From friends ---------- */
const row = (page, list, title) => page.locator(`#${list} li`).filter({ hasText: title });
const sent = (page, method, table) => page.waitForRequest(r => r.method() === method && new URL(r.url()).pathname === '/rest/v1/' + table);

test('your watchlist: up to 6, each with Remove and Watched (or Read); From friends: Keep · Remove · Watched / Read', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester');
  await expect(page.locator('#watchSec h2')).toHaveText('Watchlist 2 of 6');
  await expect(page.locator('#watch li')).toHaveCount(2);
  await expect(row(page, 'watch', 'Paris, Texas').getByRole('button')).toHaveText(['Remove', 'Watched']);
  await expect(row(page, 'watch', 'Orlando').getByRole('button')).toHaveText(['Remove', 'Read']);
  await expect(page.locator('#friendsSec h2')).toHaveText('From friends');
  await expect(page.locator('#friends li')).toHaveCount(2);
  await expect(row(page, 'friends', 'Gummo')).toContainText('from @mira');
  await expect(row(page, 'friends', 'Gummo').getByRole('button')).toHaveText(['Keep', 'Remove', 'Watched']);
  await expect(row(page, 'friends', 'The Waves').getByRole('button')).toHaveText(['Keep', 'Remove', 'Read']);
  // Keep: on your watchlist, saying whose log it came from
  let req = sent(page, 'POST', 'watchlist');
  await row(page, 'friends', 'Gummo').getByRole('button', { name: 'Keep' }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg', from_user: PEOPLE[1].id });
  await expect(page.locator('#toast')).toHaveText('Gummo is on your watchlist.');
  // Remove, in From friends: kept out for good, by its title
  req = sent(page, 'POST', 'friend_hides');
  await row(page, 'friends', 'The Waves').getByRole('button', { name: 'Remove' }).click();
  expect((await req).postDataJSON()).toEqual({ item_key: 'book:the waves:1931' });
  // Remove, on the watchlist
  req = sent(page, 'DELETE', 'watchlist');
  await row(page, 'watch', 'Orlando').getByRole('button', { name: 'Remove' }).click();
  expect(new URL((await req).url()).searchParams.get('id')).toBe('eq.' + WATCHLIST[1].id);
  await expect(page.locator('#toast')).toHaveText('Orlando is off your watchlist.');
  // Watched: + ADD's Log it, on that title; Post logs it, and the lists are read again
  await row(page, 'watch', 'Paris, Texas').getByRole('button', { name: 'Watched' }).click();
  const d = page.getByRole('dialog', { name: /log a film or a book/i });
  await expect(d).toBeVisible();
  await expect(d.getByRole('radio', { name: 'Log it' })).toBeChecked();
  await expect(d.locator('#addPostTitle')).toHaveText('Paris, Texas (1984)');
  await expect(d.getByRole('textbox', { name: /Caption/ })).toBeFocused();
  await page.keyboard.type('Harry Dean Stanton.');
  req = sent(page, 'POST', 'logs');
  const again = page.waitForRequest(r => r.method() === 'GET' && r.url().includes('/rest/v1/watchlist?'));
  await d.getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Paris, Texas', author: 'Wim Wenders', year: 1984, cover_src: 'url:https://image.tmdb.org/t/p/w500/paris.jpg', caption: 'Harry Dean Stanton.' });
  await again;
  await expect(d).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Logged Paris, Texas. It’s on the feed.');
  expect(errors).toEqual([]);
});

test('before the database has logs (the proposed 0007 not run yet): no watchlist, no From friends, and Activity is shelves', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, logs: false });
  await open(page, '/u/?tester');
  await expect(page.locator('#hero canvas')).toHaveCount(1);
  await expect(page.locator('#watchSec')).toBeHidden();
  await expect(page.locator('#friendsSec')).toBeHidden();
  await expect(page.locator('#pgrid')).toHaveClass(/solo/);   // the bio has the width
  await tabs(page).nth(1).click();
  await expect(page.locator('#acts .line')).toHaveCount(6);
  await expect(page.locator('#acts .item.log')).toHaveCount(0);
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

