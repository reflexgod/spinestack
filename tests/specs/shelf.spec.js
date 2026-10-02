// A shelf's own page (/u/?name&shelf=id): its heading, Copy link, what's on it with + Add to my shelf, and for its
// owner Edit, Make main, Make private or public, and Delete with a confirm.
const { test, expect } = require('@playwright/test');
const { SHELVES, ME, mockNetwork, watchErrors, open } = require('../site');

const theirs = SHELVES[1], mine = SHELVES[3];   // @mira's "shelf number 1"; the made-up account's second shelf
const rows = page => page.locator('#oneItems li');
const titles = page => page.locator('#books .book .bt').allTextContents();
const sent = (page, method, part) => page.waitForRequest(r => r.method() === method && r.url().includes(part));

test('someone\'s shelf: its name, who made it and when, Copy link, the story, and what\'s on it', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('shelf number 1');
  await expect(page.locator('.phead')).toBeHidden();   // the shelf has its own heading
  const by = page.locator('#oneBy');
  await expect(by).toHaveText(/^by @mira· .*2026 · 2 spines$/);
  await expect(by.getByRole('link', { name: '@mira' })).toHaveAttribute('href', '/u/?mira');
  await expect(page.locator('#oneShelf canvas')).toBeVisible();
  // not yours: Copy link and Report, nothing else
  await expect(page.locator('#oneActs').locator('button:visible, a:visible')).toHaveText(['Copy link', 'Report']);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('#toast')).toHaveText(new RegExp(`Link copied\\.|/u/\\?mira&shelf=${theirs.id}`));
  // On this shelf: a row for each spine
  await expect(page.getByRole('heading', { level: 2, name: 'On this shelf' })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  const first = rows(page).first();
  await expect(first.locator('.st b')).toHaveText('The Waves 1931');
  await expect(first.locator('.st > span')).toHaveText('Virginia Woolf · Book');
  await expect(first.locator('.sthumb canvas')).toHaveCount(1);
  await expect(first.getByRole('button', { name: '+ Add to my shelf' })).toBeVisible();
  // the list is under the picture
  const pic = await page.locator('#oneShelf').boundingBox(), list = await page.locator('#oneOn').boundingBox();
  expect(list.y).toBeGreaterThanOrEqual(pic.y + pic.height);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

test('+ Add to my shelf puts that same spine on the shelf being built, with no new search', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page);
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  await rows(page).nth(1).getByRole('button', { name: '+ Add to my shelf' }).click();
  await expect(page).toHaveURL(/\/build\/$/);
  await expect.poll(() => titles(page)).toEqual(['Journey by Moonlight']);
  await expect(page.locator('#toast')).toHaveText('Journey by Moonlight added to your shelf.');
  // the spine as it was saved: its own look, not a new one
  await page.locator('#books .bopen').first().click();
  const row = page.locator('#books .book').first();
  await expect(row.getByRole('textbox', { name: 'Author or director' })).toHaveValue('Antal Szerb');
  await expect(row.getByLabel('Spine', { exact: true })).toHaveValue('#1c1b21');
  await expect(row.getByLabel('Text', { exact: true })).toHaveValue('#e8d23c');
  // a second one, from the shelf's page again: it joins the shelf being made
  await page.waitForFunction(() => !!sessionStorage.getItem('spinestack-draft'));
  await page.waitForTimeout(700);
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  await rows(page).first().getByRole('button', { name: '+ Add to my shelf' }).click();
  await expect(page).toHaveURL(/\/build\/$/);
  await expect.poll(() => titles(page)).toEqual(['Journey by Moonlight', 'The Waves']);
  expect(net.asked).toEqual([]);   // nothing was searched for
  expect(errors).toEqual([]);
});

test('your own shelf: Edit, Make main, Make private, and Delete after a confirm', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  const at = `/u/?tester&shelf=${mine.id}`;
  await open(page, at);
  await expect(page.locator('#oneActs').locator('button:visible, a:visible')).toHaveText(['Copy link', 'Edit', 'Make main', 'Make private', 'Delete']);
  await expect(page.locator('#oneActs').getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `../build/?open=${mine.id}`);
  // Make main
  let req = sent(page, 'PATCH', '/rest/v1/profiles');
  await page.getByRole('button', { name: 'Make main' }).click();
  expect((await req).postDataJSON()).toEqual({ pinned_shelf_id: mine.id });
  // Make private
  await open(page, at);
  req = sent(page, 'PATCH', `/rest/v1/shelves?id=eq.${mine.id}`);
  await page.getByRole('button', { name: 'Make private' }).click();
  expect((await req).postDataJSON()).toEqual({ is_public: false });
  await expect(page.locator('#toast')).toHaveText('Only you can see this shelf now.');
  // Delete: asks first; Cancel leaves it
  let deletes = 0; page.on('request', r => { if (r.method() === 'DELETE') deletes++; });
  await page.getByRole('button', { name: 'Delete' }).click();
  const ask = page.getByRole('dialog', { name: /^Delete “shelf number 3”\?$/ });
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('This can’t be undone.');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.keyboard.press('Escape');
  await expect(ask).toBeHidden();
  expect(deletes).toBe(0);
  // Delete, then yes: it's deleted and you're back on your shelves
  await page.getByRole('button', { name: 'Delete' }).click();
  req = sent(page, 'DELETE', `/rest/v1/shelves?id=eq.${mine.id}`);
  await ask.getByRole('button', { name: 'Delete' }).click();
  await req;
  await expect(page).toHaveURL(/\/u\/\?tester#shelves$/);
  expect(errors).toEqual([]);
});

test('your own shelf: its name in the heading renames it, and your main shelf says so', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?tester&shelf=${mine.id}`);
  await page.getByRole('heading', { level: 1 }).getByRole('button', { name: 'shelf number 3' }).click();
  const box = page.getByRole('textbox', { name: 'Shelf name' });
  await box.fill('late films');
  const req = sent(page, 'PATCH', `/rest/v1/shelves?id=eq.${mine.id}`);
  await box.press('Enter');
  expect((await req).postDataJSON()).toEqual({ name: 'late films' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('late films');
  // the newest public shelf is the main one until another is picked: it's tagged, and has no Make main
  await open(page, `/u/?tester&shelf=${SHELVES[0].id}`);
  await expect(page.locator('#oneBy .tag')).toHaveText(['main']);
  await expect(page.getByRole('button', { name: 'Make main' })).toBeHidden();
});

test('a shelf that isn\'t there says so, with nothing to press but the way back', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira&shelf=cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This shelf is private, or it was deleted.');
  await expect(page.locator('#oneActs')).toBeHidden();
  await expect(page.locator('#oneOn')).toBeHidden();
  await expect(page.locator('#backLink')).toHaveAttribute('href', '/u/?mira#shelves');
});

/* ---------- your shelf cards on your profile ---------- */
const card = (page, shelf) => page.locator('#all li.own').filter({ has: page.locator(`.pic[data-shelf="${shelf.id}"]`) });
const menu = page => page.getByRole('menu', { name: /^More for / });

test('your profile\'s cards: the card opens the shelf\'s page, and ··· has Edit, Make main, Make private, Delete', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester#shelves');
  const c = card(page, mine);
  await expect(c.locator('a')).toHaveAttribute('href', `/u/?tester&shelf=${mine.id}`);
  await expect(c.locator('a')).toHaveCount(1);                 // no small links under the card any more
  await expect(c.getByRole('button')).toHaveCount(1);          // only ···
  await expect(page.locator('#all').getByText(/make main shelf|sure\? delete/)).toHaveCount(0);
  const more = c.getByRole('button', { name: 'More for shelf number 3' });
  await expect(menu(page)).toBeHidden();
  await more.click();
  await expect(menu(page)).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(menu(page).getByRole('menuitem')).toHaveText(['Edit', 'Make main', 'Make private', 'Delete']);
  await expect(menu(page).getByRole('menuitem', { name: 'Edit' })).toHaveAttribute('href', `../build/?open=${mine.id}`);
  await expect(menu(page).getByRole('menuitem', { name: 'Edit' })).toBeFocused();
  // all of it inside the window, by its button
  const m = await menu(page).boundingBox(), b = await more.boundingBox(), w = page.viewportSize().width;
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.x + m.width).toBeLessThanOrEqual(w);
  expect(Math.abs(m.y - (b.y + b.height + 4)) < 2 || Math.abs(m.y + m.height - (b.y - 4)) < 2).toBe(true);
  // ↓ moves through it, Esc shuts it and goes back to ···
  await page.keyboard.press('ArrowDown');
  await expect(menu(page).getByRole('menuitem', { name: 'Make main' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  // a press outside shuts it too
  await more.click();
  await expect(menu(page)).toBeVisible();
  await page.locator('h1:visible').first().click();
  await expect(menu(page)).toBeHidden();
  // your main shelf has no Make main, and says it's the main one
  const first = card(page, SHELVES[0]);
  await expect(first.locator('.tag')).toHaveText(['main']);
  await first.getByRole('button', { name: /^More for / }).click();
  await expect(menu(page).getByRole('menuitem')).toHaveText(['Edit', 'Make private', 'Delete']);
  await page.keyboard.press('Escape');
  // the card itself: the shelf's page
  await c.locator('a').click();
  await expect(page).toHaveURL(new RegExp(`/u/\\?tester&shelf=${mine.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('shelf number 3');
  expect(errors).toEqual([]);
});

test('a card\'s ··· menu: Make private changes the shelf, and Delete asks first', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester#shelves');
  const more = () => card(page, mine).getByRole('button', { name: /^More for / });
  await more().click();
  let req = sent(page, 'PATCH', `/rest/v1/shelves?id=eq.${mine.id}`);
  await menu(page).getByRole('menuitem', { name: 'Make private' }).click();
  expect((await req).postDataJSON()).toEqual({ is_public: false });
  await expect(menu(page)).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Only you can see this shelf now.');
  let deletes = 0; page.on('request', r => { if (r.method() === 'DELETE') deletes++; });
  await more().click();
  await menu(page).getByRole('menuitem', { name: 'Delete' }).click();
  const ask = page.getByRole('dialog', { name: /^Delete “shelf number 3”\?$/ });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancel' }).click();
  expect(deletes).toBe(0);
  await more().click();
  await menu(page).getByRole('menuitem', { name: 'Delete' }).click();
  req = sent(page, 'DELETE', `/rest/v1/shelves?id=eq.${mine.id}`);
  await ask.getByRole('button', { name: 'Delete' }).click();
  await req;
  await expect(page.locator('#toast')).toHaveText('Shelf deleted.');
  await expect(page).toHaveURL(/\/u\/\?tester#shelves$/);   // still on your shelves
});

test('someone else\'s cards have no ··· menu', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira#shelves');
  await expect(page.locator('#all li')).toHaveCount(6);
  await expect(page.locator('#all').getByRole('button')).toHaveCount(0);
});

