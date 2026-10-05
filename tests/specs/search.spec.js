// One search (search.js): the bar's search icon opens a box (on a phone the whole screen, the box with the focus);
// as you type, Films, Books and People, five each with See all for the rest; a film or a book goes to its title's
// page, a person to their profile; with nothing typed, your recent searches, kept in this browser only. The People
// page keeps its own Find box.
const { test, expect } = require('@playwright/test');
const { MATCHES, CORS, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const icon = page => page.locator('header.top .links').getByRole('link', { name: 'Search' });
const dialog = page => page.getByRole('dialog', { name: 'Search' });
const box = page => dialog(page).getByRole('searchbox', { name: 'Search films, books and people' });
const group = (page, name) => dialog(page).getByRole('region', { name });

test('the icon opens one box, with the focus in it; on a phone it is the whole screen', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await icon(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(box(page)).toBeFocused();
  await expect(page).toHaveURL(/\/feed\/\?everyone$/);   // still here: it's a box, not the People page
  const b = await dialog(page).locator('.srchbox').boundingBox(), vw = page.viewportSize().width, vh = page.viewportSize().height;
  if (isPhone()) { expect(Math.round(b.x)).toBe(0); expect(Math.round(b.width)).toBe(vw); expect(Math.round(b.y)).toBe(0); expect(Math.round(b.height)).toBe(vh); }
  else { expect(b.width).toBeLessThanOrEqual(640); expect(b.x).toBeGreaterThan(0); }
  // Esc shuts it, and the focus goes back to the icon
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(icon(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('"gummo": the film, with its cover, year and director; pressing it opens its title page', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/');
  await icon(page).click();
  await box(page).fill('gummo');
  const films = group(page, 'Films');
  await expect(films.getByRole('link')).toHaveCount(1);
  const gummo = films.getByRole('link').first();
  await expect(gummo).toContainText('Gummo');
  await expect(gummo).toContainText('1997 · Harmony Korine');
  await expect(gummo.locator('.cv img')).toHaveAttribute('src', /\/img\?url=https%3A%2F%2Fimage\.tmdb\.org%2Ft%2Fp%2Fw185%2Fgummo\.jpg$/);   // TMDB's, at a list's size
  await expect(gummo).toHaveAttribute('href', /\/t\/\?film=106&title=Gummo&year=1997$/);   // by its TMDB id
  await expect(group(page, 'Books')).toHaveCount(0);   // nothing by that name
  await gummo.click();
  await expect(page).toHaveURL(/\/t\/\?film=106&title=Gummo&year=1997$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gummo 1997');
  expect(errors).toEqual([]);
});

test('"div": @div under People, with a photo; pressing it opens the profile', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await icon(page).click();
  await box(page).fill('div');
  const people = group(page, 'People');
  const div = people.getByRole('link', { name: /@div/ });
  await expect(div).toBeVisible();
  await expect(div).toContainText('Divya');
  await expect(div.locator('.av img')).toHaveAttribute('src', /\/m\/img\?k=avatars%2Fdiv$/);
  await expect(div).toHaveAttribute('href', /\/u\/\?div$/);
  await expect(group(page, 'Films')).toHaveCount(0);
  // nothing found, then @div again
  await box(page).fill('zzzz');
  await expect(dialog(page).locator('.srnote')).toHaveText('Nothing found for “zzzz”.');
  await box(page).fill('@div');
  await expect(div).toBeVisible();
  await div.click();
  await expect(page).toHaveURL(/\/u\/\?div$/);
});

test('the three groups, five each, See all for the rest; ↓ goes through them', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  // the Worker finds seven films and two books with "kids" in them
  const films7 = [...MATCHES.filter(m => m.kind === 'movie' && /kids/i.test(m.title)), { kind: 'movie', tmdb: '7', title: 'Kids Return', year: '1996', creator: 'Takeshi Kitano', cover: '' },
    { kind: 'movie', tmdb: '8', title: 'Kids World', year: '2001', creator: '', cover: '' }];
  await page.route(u => u.pathname === '/identify', route => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json',
    body: JSON.stringify({ results: [...films7, ...MATCHES.filter(m => m.kind === 'book' && /kids/i.test(m.title))] }) }));
  await open(page, '/shelves/');
  await icon(page).click();
  await box(page).fill('kids');
  const films = group(page, 'Films'), books = group(page, 'Books');
  await expect(films.getByRole('link')).toHaveCount(5);
  await expect(books.getByRole('link')).toHaveCount(2);
  await expect(dialog(page).locator('.srchg h2 > span')).toHaveText(['Films', 'Books']);
  await expect(films.getByRole('button', { name: 'See all 7 films' })).toHaveText('See all (7)');
  await films.getByRole('button', { name: /^See all/ }).click();
  await expect(films.getByRole('link')).toHaveCount(7);
  await expect(films.getByRole('link').nth(5)).toBeFocused();   // the first of the rest
  await expect(films.getByRole('button', { name: /^See all/ })).toHaveCount(0);
  await expect(books.getByRole('button', { name: /^See all/ })).toHaveCount(0);   // all of them are there
  await box(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(films.getByRole('link').first()).toBeFocused();
  await expect(films.getByRole('link').first()).toContainText('Kids');   // no cover: a blank in its place
  await page.keyboard.press('ArrowDown');
  await expect(films.getByRole('link').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  await expect(box(page)).toBeFocused();
});

test('recent searches: shown when the box is empty, kept in this browser only, Clear forgets them', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  await icon(page).click();
  await expect(dialog(page).getByRole('region', { name: 'Recent searches' })).toHaveCount(0);   // none yet
  await box(page).fill('gummo');
  await group(page, 'Films').getByRole('link').first().click();
  await expect(page).toHaveURL(/\/t\//);
  await icon(page).click();
  const rec = dialog(page).getByRole('region', { name: 'Recent searches' });
  await expect(rec.getByRole('button', { name: 'gummo' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shelfstackd-searches')))).toEqual(['gummo']);
  // one pressed: searched again
  await rec.getByRole('button', { name: 'gummo' }).click();
  await expect(box(page)).toHaveValue('gummo');
  await expect(group(page, 'Films').getByRole('link')).toHaveCount(1);
  // Enter on the box opens the first thing found
  await box(page).fill('div');
  await expect(group(page, 'People').getByRole('link')).toHaveCount(1);
  await box(page).press('Enter');
  await expect(page).toHaveURL(/\/u\/\?div$/);
  await icon(page).click();
  await expect(rec.getByRole('button')).toHaveText(['Clear', 'div', 'gummo']);
  await rec.getByRole('button', { name: 'Clear' }).click();
  await expect(rec).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('shelfstackd-searches'))).toBeNull();
});

test('signed out it works too; the People page keeps its own Find box', async ({ page }) => {
  await mockNetwork(page, {});
  await open(page, '/people/');
  await expect(page.getByRole('textbox', { name: 'Find @username' })).toBeVisible();
  await icon(page).click();
  await expect(box(page)).toBeFocused();
  await box(page).fill('the waves');
  await expect(group(page, 'Books').getByRole('link').first()).toHaveAttribute('href', /\/t\/\?book=OL99W&title=The\+Waves&year=1931$/);
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toBeHidden();
});

test('a new tab from the icon is still the People page', async ({ page }) => {
  await mockNetwork(page, {});
  await open(page, '/');
  expect(await icon(page).getAttribute('href')).toBe('people/');
  await expect(icon(page)).toHaveAttribute('aria-haspopup', 'dialog');
});

// a book's cover is Open Library's (medium, through the Worker, as + ADD has it); with none, or one that doesn't come,
// a paper block with the title in small type, never a grey box
test('books have covers; with none, a paper block with the title', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await page.route(u => u.pathname === '/identify', route => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ results: [
    { kind: 'book', ol: 'OL99W', title: 'The Waves', year: '1931', creator: 'Virginia Woolf', cover: 'https://covers.openlibrary.org/b/id/1-L.jpg' },
    { kind: 'book', ol: 'OL98W', title: 'The Waves Behind the Boat', year: '1967', creator: 'Francis King', cover: '' },
    { kind: 'book', ol: 'OL97W', title: 'Waves of Light', year: '2001', creator: '', cover: 'https://covers.openlibrary.org/b/id/404-L.jpg' },
  ] }) }));
  await page.route(u => u.pathname === '/img' && /404-M/.test(decodeURIComponent(u.search)), route => route.fulfill({ status: 404, headers: CORS, body: '' }));
  await open(page, '/feed/?everyone');
  await icon(page).click();
  await box(page).fill('waves');
  const books = group(page, 'Books').getByRole('link');
  await expect(books).toHaveCount(3);
  await expect(books.nth(0).locator('.cv img')).toHaveAttribute('src', /covers\.openlibrary\.org%2Fb%2Fid%2F1-M\.jpg$/);
  await expect.poll(() => books.nth(0).locator('.cv img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
  for (const i of [1, 2]) {
    const cv = books.nth(i).locator('.cv');
    await expect(cv.locator('img')).toHaveCount(0);   // none, or it didn't come
    await expect(cv.locator('.cvt')).toHaveText(i === 1 ? 'The Waves Behind the Boat' : 'Waves of Light');
    expect(await cv.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');   // paper, not grey
  }
});
