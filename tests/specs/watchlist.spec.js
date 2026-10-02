// The watchlist, as Letterboxd's: a tab of its own on a profile (/u/?name#watchlist) with what they want to see and
// read, the covers (clean and still sealed: wear is for a log), and on your own a box that adds a title straight in (the + ADD dialog's search, no dialog
// and no spine search), a dotted + first, Remove and ✓ Mark watched / ✓ Mark read. It holds 6. Anywhere else a cover or a spine shows
// (the feed, someone's shelf, From friends), a bookmark on hover, or ••• on a phone, puts it on your watchlist; signed
// out that's the sign-in sheet first. Private by default once supabase/migrations/0008_watchlist_privacy.sql is run.
const { test, expect } = require('@playwright/test');
const { SHELVES, WATCHLIST, SB_URL, CORS, mockNetwork, watchErrors, open, putAside } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const tiles = page => page.locator('#wGrid li:not(:has(.wplus))');
const posted = page => page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/watchlist');
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
// the watchlist table answered with these rows, for the made-up account
const watchRows = (page, rows) => page.route(u => u.origin === SB_URL && u.pathname === '/rest/v1/watchlist', route => {
  const m = route.request().method();
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  return m === 'GET' ? json(route, rows) : route.fallback();
});
// as a database where 0008 has been run: profiles.watchlist_public is there, with this value
const privacyIs = (page, value) => page.route(u => u.origin === SB_URL && u.pathname === '/rest/v1/profiles', route => {
  const r = route.request(), url = new URL(r.url());
  if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (r.method() === 'PATCH' && url.searchParams.get('select') === 'watchlist_public') return json(route, [{ watchlist_public: r.postDataJSON().watchlist_public }]);
  if (r.method() === 'GET' && url.searchParams.get('select') === 'watchlist_public') return json(route, [{ watchlist_public: value }]);
  return route.fallback();
});

test('your Watchlist tab: what you want to see and read, a dotted + first, then the covers, clean and sealed, never worn', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester#watchlist');
  await expect(page.locator('#wLine')).toHaveText('You want to see 1 film and read 1 book.');
  const first = page.locator('#wGrid li').first();
  await expect(first.locator('.wplus')).toHaveAccessibleName('Add a film or book to your watchlist');
  expect(await first.locator('.wplus').evaluate(b => [getComputedStyle(b).borderTopStyle, (b.getBoundingClientRect().height / b.getBoundingClientRect().width).toFixed(1)])).toEqual(['dashed', '1.5']);
  await expect(tiles(page)).toHaveCount(2);
  await expect(tiles(page).locator('canvas.worn')).toHaveCount(0);                 // no wear, no dog-ear: it isn't watched or read yet
  await expect(tiles(page).locator('canvas.clean')).toHaveCount(2);
  // the picture reaches every corner (a worn cover's top right is folded away), and a faint sheen of wrap lies over it
  await expect.poll(() => tiles(page).first().locator('canvas').evaluate(c => { const x = c.getContext('2d'), p = (a, b) => x.getImageData(a, b, 1, 1).data;
    return [p(c.width - 2, 1), p(c.width - 2, 2)].every(d => d[3] === 255 && !(d[0] === 243 && d[1] === 243)); })).toBe(true);
  const sheen = await tiles(page).first().locator('.wc').evaluate(el => { const a = getComputedStyle(el, '::after'); return [a.content, a.backgroundImage.startsWith('linear-gradient'), a.pointerEvents]; });
  expect(sheen).toEqual(['""', true, 'none']);
  const c = await tiles(page).first().locator('.wc').boundingBox();
  expect(c.height / c.width).toBeCloseTo(1.5, 1);                                   // 2:3
  await expect(tiles(page).first().locator('.wcap')).toHaveText('Paris, Texas 1984');
  // the title: under the cover on a phone, over it when a mouse is on it (on a wide window)
  const cap = tiles(page).first().locator('.wcap');
  if (isPhone()) { expect((await cap.boundingBox()).y).toBeGreaterThanOrEqual(c.y + c.height - 1); await expect(cap).toBeVisible(); }
  else {
    expect(+(await cap.evaluate(el => getComputedStyle(el).opacity))).toBe(0);
    await tiles(page).first().locator('.wc').hover();
    await expect.poll(() => cap.evaluate(el => +getComputedStyle(el).opacity)).toBe(1);
  }
  // the + is the box
  await first.locator('.wplus').click();
  await expect(page.getByRole('combobox', { name: 'Add to your watchlist' })).toBeFocused();
  expect(errors).toEqual([]);
});

test('the box on your Watchlist tab suggests as you type, and a title picked goes straight on: no dialog, no spine search', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page, { signedIn: true });
  let scans = 0; page.on('request', r => { if (r.url().includes('/scans?')) scans++; });
  await open(page, '/u/?tester#watchlist');
  const box = page.getByRole('combobox', { name: 'Add to your watchlist' });
  await box.pressSequentially('gummo', { delay: 30 });
  const option = page.locator('#wSugg').getByRole('option', { name: /Gummo/ });
  await expect(option).toBeVisible();
  expect(net.asked).toEqual(['gummo (typed)']);                                       // the + ADD dialog's search, as typed
  const req = posted(page), again = page.waitForRequest(r => r.method() === 'GET' && r.url().includes('/rest/v1/watchlist?'));
  await option.click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg' });
  await again;                                                                         // the grid is read again
  await expect(page.locator('#toast')).toHaveText('Gummo is on your watchlist.');
  await expect(page.locator('#addDialog')).toBeHidden();
  await expect(box).toHaveValue('');
  expect(scans).toBe(0);
  // the keyboard too: ↓ and Enter
  await box.pressSequentially('waves', { delay: 30 });
  await expect(page.locator('#wSugg [role=option]').first()).toBeVisible();
  const req2 = posted(page);
  await box.press('ArrowDown'); await box.press('Enter');
  expect((await req2).postDataJSON().title).toBe('The Waves');
  expect(errors).toEqual([]);
});

test('full at 6: "Your watchlist is full (6). Remove one to add another." and nothing is sent', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const six = Array.from({ length: 6 }, (_, i) => ({ ...WATCHLIST[0], id: `cccccccc-cccc-4ccc-8ccc-1000000000${i}0`, title: 'Title ' + i }));
  await watchRows(page, six);
  let sent = 0; page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/rest/v1/watchlist')) sent++; });
  await open(page, '/u/?tester#watchlist');
  await expect(tiles(page)).toHaveCount(6);
  await page.getByRole('combobox', { name: 'Add to your watchlist' }).pressSequentially('gummo', { delay: 30 });
  await page.locator('#wSugg').getByRole('option', { name: /Gummo/ }).click();
  await expect(page.locator('#wSay')).toHaveText('Your watchlist is full (6). Remove one to add another.');
  expect(sent).toBe(0);
  await expect(page.locator('#watchSec h2')).toContainText('6 of 6');
});

test('an empty watchlist: only the + and "Add a film or book you want to get to."', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, fresh: true });
  await open(page, '/u/?tester#watchlist');
  await expect(page.locator('#wGrid li')).toHaveCount(1);
  await expect(page.locator('#wGrid .wplus')).toBeVisible();
  await expect(page.locator('#wNone')).toHaveText('Add a film or book you want to get to.');
  await expect(page.locator('#wLine')).toBeHidden();
});

test('someone else\'s Watchlist tab: their covers and what they want, nothing to remove; each cover onto yours', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira#watchlist');
  await expect(page.locator('#wLine')).toHaveText('@mira wants to see 1 film.');
  await expect(page.locator('#wSearch')).toBeHidden();
  await expect(page.locator('#wGrid .wplus')).toHaveCount(0);
  await expect(page.locator('#wGrid').getByRole('button', { name: /^(Remove|Mark watched|Mark read)$/ })).toHaveCount(0);
  const req = posted(page);
  if (isPhone()) { await page.locator('#wGrid').getByRole('button', { name: 'More for Stalker (1979)' }).click(); await page.getByRole('menuitem', { name: 'Add to watchlist' }).click(); }
  else { await page.locator('#wGrid .wc').first().hover(); await page.getByRole('button', { name: 'Add Stalker (1979) to watchlist' }).click(); }
  expect((await req).postDataJSON()).toMatchObject({ kind: 'movie', title: 'Stalker', year: 1979 });
});

/* ---------- private by default, once 0008 is run ---------- */
test('before 0008 is run: no Make public, and someone else\'s watchlist shows as it did', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester#watchlist');
  await expect(page.locator('#wPrivacy')).toBeHidden();
  await open(page, '/u/?mira');
  await expect(page.getByRole('tab', { name: 'Watchlist' })).toBeVisible();
  await expect(page.locator('#watchSec')).toBeVisible();
});
test('after 0008: yours is private with Make public, which makes it public (and back)', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await privacyIs(page, false);
  await open(page, '/u/?tester#watchlist');
  const b = page.locator('#wPrivacy');
  await expect(b).toHaveText('Make public');
  await expect(page.locator('#wPrivNote')).toHaveText('Only you see it.');
  const req = page.waitForRequest(r => r.method() === 'PATCH' && r.url().includes('/rest/v1/profiles'));
  await b.click();
  expect((await req).postDataJSON()).toEqual({ watchlist_public: true });
  await expect(b).toHaveText('Make private');
  await expect(page.locator('#toast')).toHaveText('Your watchlist is public.');
});
test('after 0008: someone else\'s private watchlist isn\'t shown at all; a public one is', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await privacyIs(page, false);
  await open(page, '/u/?mira');
  await expect(page.getByRole('tab', { name: 'Watchlist' })).toBeHidden();
  await expect(page.locator('#watchSec')).toBeHidden();
  await open(page, '/u/?mira#watchlist');
  await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');   // the address goes back to Profile
  await page.unroute(u => u.pathname === '/rest/v1/profiles');
  await privacyIs(page, true);
  await open(page, '/u/?mira');
  await expect(page.getByRole('tab', { name: 'Watchlist' })).toBeVisible();
});

/* ---------- from any cover or spine ---------- */
async function addFrom(page, scope, name) {
  if (isPhone()) {
    await scope.getByRole('button', { name: `More for ${name}` }).click();
    await scope.getByRole('menuitem', { name: 'Add to watchlist' }).click();
  } else {
    await scope.getByRole('button', { name: `Add ${name} to watchlist` }).click();
  }
}
test('the feed: someone\'s log cover goes onto your watchlist in one press, then says In watchlist', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const log = page.locator('#items .item.log').first();
  await log.locator('.cover').hover();
  const req = posted(page);
  await addFrom(page, log, 'Gummo (1997)');
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg' });
  await expect(page.locator('#toast')).toHaveText('Gummo is on your watchlist.');
  if (isPhone()) { await log.getByRole('button', { name: 'More for Gummo (1997)' }).click(); await expect(log.getByRole('menuitem', { name: 'In watchlist' })).toBeDisabled(); }
  else await expect(log.getByRole('button', { name: 'Gummo (1997): in watchlist' })).toBeDisabled();
  // your own logs have none
  await expect(page.locator('#items .item.log').filter({ hasText: '@tester read Just Kids' }).locator('.wbtn, .wmore')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('someone\'s shelf page: each spine onto your watchlist; your own shelf has none', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?mira&shelf=${SHELVES[1].id}`);
  const row = page.locator('#oneItems li').filter({ hasText: 'Journey by Moonlight' });
  await row.locator('.sthumb').hover();
  const req = posted(page);
  await addFrom(page, row, 'Journey by Moonlight (1937)');
  expect((await req).postDataJSON()).toMatchObject({ kind: 'book', title: 'Journey by Moonlight', author: 'Antal Szerb', year: 1937 });
  await open(page, '/u/?tester&shelf');
  await expect(page.locator('#oneItems .wbtn, #oneItems .wmore')).toHaveCount(0);
});
test('From friends: a cover onto your watchlist, kept from whose log it was', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester');
  const row = page.locator('#friends li').filter({ hasText: 'The Waves' });
  await row.locator('.tc').hover();
  const req = posted(page);
  await addFrom(page, row, 'The Waves (1931)');
  expect((await req).postDataJSON()).toMatchObject({ title: 'The Waves', from_user: '22222222-2222-4222-8222-222222222222' });
});
test('signed out, a cover\'s watchlist button is the sign-in sheet; once signed in, the title goes on', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const signBack = await putAside(page);
  let sent = 0; page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/rest/v1/watchlist')) sent++; });
  await open(page, '/feed/?everyone');
  const log = page.locator('#items .item.log').first();
  await log.locator('.cover').hover();
  await addFrom(page, log, 'Gummo (1997)');
  await expect(page.locator('#signSheet')).toBeVisible();
  await expect(page.locator('#signSheet .sheetbox p:not(.note)').first()).toHaveText('Sign in to start your shelf.');
  expect(sent).toBe(0);
  const req = posted(page);
  await signBack(); await page.reload();
  expect((await req).postDataJSON()).toMatchObject({ title: 'Gummo', year: 1997 });
});
