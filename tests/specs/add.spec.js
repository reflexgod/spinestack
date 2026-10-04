// The Add to your shelf dialog's search: suggestions as you type, the keyboard, the order of the results, the
// loading and nothing-found lines and where they sit; what it says when the day's spine searches are used up; and the builder's
// smaller touches (the count and its limit, the empty shelf, the note under the preview).
const { test, expect } = require('@playwright/test');
const { PAGES, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const dialog = page => page.getByRole('dialog', { name: /^(add to (your|the) shelf|what did you watch or read\?)$/i });   // "the" signed out; + ADD opens on Log it, except on the builder
const box = d => d.getByRole('combobox', { name: 'Film or book name' });
const options = d => d.getByRole('option');
const names = d => d.locator('#addRows .t').evaluateAll(els => els.map(e => e.firstChild.textContent.trim()));
const NEW = { signedIn: true, ownShelf: false };   // signed out the site is read only: these are someone signed in, with no shelf yet
async function openDialog(page, opt, path = '/') {
  const net = await mockNetwork(page, { ...NEW, ...opt });
  await open(page, path);
  await page.locator('header.top .add').click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('radio', { name: 'Put on shelf' }).check();   // these are about the shelf's spines (+ ADD opens on Log it)
  await dialog(page).getByRole('combobox', { name: 'Film or book name' }).focus();
  return net;
}

/* ---------- 1. the search ---------- */
// The builder's own box is the same search: typing in it opens the dialog with what's typed so far, and the rest of the
// typing goes on there, with suggestions as it goes (no Enter)
test('the builder\'s search box suggests as you type, the same search as + ADD\'s', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page, { signedIn: true }), d = dialog(page);
  await open(page, '/build/');
  await page.locator('#findQ').pressSequentially('gummo', { delay: 30 });
  await expect(d).toBeVisible();
  await expect(box(d)).toHaveValue('gummo');
  await expect(box(d)).toBeFocused();
  await expect(options(d)).toHaveCount(1);
  expect(await names(d)).toEqual(['Gummo']);
  expect(net.asked).toEqual(['gummo (typed)']);   // suggested, as typing in the dialog does; not a search on Enter
  await expect(page.locator('#findQ')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('suggestions come while typing, with one search for a word typed quickly', async ({ page }) => {
  const errors = watchErrors(page), net = await openDialog(page, { signedIn: true }), d = dialog(page);
  await box(d).pressSequentially('gummo', { delay: 30 });   // faster than the 250 ms wait
  await expect(options(d)).toHaveCount(1);
  expect(await names(d)).toEqual(['Gummo']);
  expect(net.asked).toEqual(['gummo (typed)']);   // not one search a letter, and marked as typed (not kept by the Worker)
  await expect(box(d)).toHaveAttribute('aria-expanded', 'true');
  expect(errors).toEqual([]);
});

test('a slower answer to an earlier word is dropped: the results are for what is in the box', async ({ page }) => {
  const net = await openDialog(page, { slow: 900 }), d = dialog(page);
  await box(d).fill('waves');
  await expect(d.locator('#addStatus')).toHaveText('Searching…');   // the loading line
  await page.waitForTimeout(450);                                    // its search has started and is still out
  await box(d).fill('gummo');
  await expect(options(d)).toHaveCount(1);
  expect(await names(d)).toEqual(['Gummo']);
  await page.waitForTimeout(1000);                                   // long enough for the first answer to have come
  expect(await names(d)).toEqual(['Gummo']);
  expect(net.asked).toEqual(['waves (typed)', 'gummo (typed)']);
});

test('at most six results, films and books together, the closest titles first', async ({ page }) => {
  await openDialog(page);
  const d = dialog(page);
  await box(d).fill('kids');
  await expect(options(d)).toHaveCount(6);   // nine titles have "kids" in them
  // the same title (a book and a film), then ones starting with it (a leading The doesn't count), then ones containing it
  expect(await names(d)).toEqual(['Kids', 'Kids', 'Kids in America', 'The Kids Are All Right', 'Spy Kids', 'Just Kids']);
  await expect(options(d).first()).toContainText('Book');
  await expect(options(d).nth(1)).toContainText('Film');
  await d.getByRole('radio', { name: 'Films' }).check();
  await expect(options(d)).toHaveCount(5);
  expect(await names(d)).toEqual(['Kids', 'Kids in America', 'The Kids Are All Right', 'Spy Kids', 'Honey, I Shrunk the Kids']);
});

test('the closest first, as the Worker ranks them: 1984 is also Nineteen Eighty-Four, and a leading The doesn’t count', async ({ page }) => {
  await openDialog(page);
  const titles = (list, q) => page.evaluate(([list, q]) => Add.rank(list.map(([kind, title]) => ({ kind, title })), q).map(m => m.title), [list, q]);
  expect(await titles([['movie', 'Wonder Woman 1984'], ['movie', '1984'], ['book', '1984 (adaptation)'], ['book', 'Nineteen Eighty-Four']], '1984'))
    .toEqual(['1984', 'Nineteen Eighty-Four', '1984 (adaptation)', 'Wonder Woman 1984']);
  expect(await titles([['book', 'The great Gatsby, by F. Scott Fitzgerald'], ['book', 'The Great Gatsby']], 'great gatsby')).toEqual(['The Great Gatsby', 'The great Gatsby, by F. Scott Fitzgerald']);
  expect(await titles([['movie', 'Gummo'], ['movie', 'Gummo 2'], ['movie', 'My Favorite Scene from Gummo'], ['movie', "G'mor Evian!"]], 'gummo')).toEqual(['Gummo', 'Gummo 2', 'My Favorite Scene from Gummo', "G'mor Evian!"]);
});

test('the keyboard: ↑ ↓ move through the results, Enter picks the highlighted one, Esc closes', async ({ page }) => {
  await openDialog(page);
  const d = dialog(page), picked = () => d.locator('[role=option][aria-selected="true"]');
  await box(d).fill('kids');
  await expect(options(d)).toHaveCount(6);
  await expect(picked()).toHaveCount(1);
  await expect(options(d).first()).toHaveAttribute('aria-selected', 'true');   // the first is highlighted to begin with
  await page.keyboard.press('ArrowDown');
  await expect(options(d).nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(await box(d).getAttribute('aria-activedescendant')).toBe(await options(d).nth(1).getAttribute('id'));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');   // from the first, up goes round to the last
  await expect(options(d).nth(5)).toHaveAttribute('aria-selected', 'true');
  await expect(picked()).toHaveCount(1);
  // the highlighted row is drawn white on black
  expect(await picked().evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(0, 0, 0)');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');   // the film Kids (1995)
  await page.keyboard.press('Enter');
  await expect(d.locator('#addSpinesTitle')).toHaveText('Kids (1995)');
  await expect(d.getByRole('button', { name: 'Add to shelf' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
});

test('Enter still searches at once, without waiting for the suggestions', async ({ page }) => {
  const net = await openDialog(page, { slow: 200 }), d = dialog(page);
  await box(d).fill('waves');
  await page.keyboard.press('Enter');   // before the 250 ms are up
  await expect(options(d)).toHaveCount(2);
  expect(net.asked).toEqual(['waves']);   // one search, and a finished one (not marked as typed)
  await page.keyboard.press('Enter');     // the results are for what's in the box now: Enter picks the highlighted one
  await expect(d.locator('#addSpinesTitle')).toHaveText('Waves (2019)');
});

test('nothing found says so plainly', async ({ page }) => {
  await openDialog(page);
  const d = dialog(page);
  await box(d).fill('zzzz');
  await expect(d.locator('#addStatus')).toHaveText('Nothing found for "zzzz". Try the original title or the author.');
  await expect(options(d)).toHaveCount(0);
  await expect(box(d)).toHaveAttribute('aria-expanded', 'false');
  await box(d).fill('');   // cleared: the line goes too
  await expect(d.locator('#addStatus')).toHaveText('');
});

test('what the search says sits at the right of the All · Films · Books row: no room is held open for it, and nothing moves when it comes', async ({ page }) => {
  await openDialog(page, { slow: 900 });
  const d = dialog(page), row = d.locator('.addunder'), opts = d.getByRole('radiogroup', { name: 'Search in' }), status = d.locator('#addStatus');
  // nothing said yet: the row is only its choices (it used to be followed by 32px kept open for the line)
  await expect(status).toBeHidden();
  const before = await row.boundingBox(), o = await opts.boundingBox(), form = await d.locator('#addForm').boundingBox();
  expect(before.height).toBeLessThanOrEqual(o.height + 1);
  expect(await d.locator('#addFind').evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(before.y + before.height + 1);   // and nothing under it
  await box(d).fill('waves');
  await expect(status).toHaveText('Searching…');
  const during = await row.boundingBox(), s = await status.boundingBox();
  expect([during.y, during.height]).toEqual([before.y, before.height]);                  // nothing moved
  expect(Math.abs(s.x + s.width - (form.x + form.width))).toBeLessThanOrEqual(1);       // at the right, in line with the box's edge
  expect(s.x).toBeGreaterThan(o.x + o.width);
  expect(Math.abs(s.y + s.height / 2 - (o.y + o.height / 2))).toBeLessThanOrEqual(2);   // on the choices' line
  // the results come straight under the row
  await expect(options(d)).toHaveCount(2);
  await expect(status).toBeHidden();
  const list = await d.locator('#addRows').boundingBox();
  expect(list.y - (before.y + before.height)).toBeLessThanOrEqual(12);
  // a line too long for the row has the next one, whole, from the left, inside the dialog
  await box(d).fill('zzzz');
  await expect(status).toHaveText(/^Nothing found/);
  const long = await status.boundingBox(), o2 = await opts.boundingBox();
  expect(long.y).toBeGreaterThanOrEqual(o2.y + o2.height);
  expect(Math.abs(long.x - form.x)).toBeLessThanOrEqual(1);
  expect(long.x + long.width).toBeLessThanOrEqual(form.x + form.width + 1);
});

/* ---------- 3. the day's spine searches are used up ---------- */
test('when spine search is capped, the dialog says it is resting and offers the spine made from the cover', async ({ page }) => {
  const errors = watchErrors(page);
  await openDialog(page, { capped: true }, '/build/');
  const d = dialog(page), spines = d.getByRole('radiogroup', { name: 'Which spine' }).getByRole('radio');
  await box(d).fill('gummo');
  await options(d).first().click();
  await expect(d.locator('#addStatus')).toHaveText('Spine search is resting for today. Here’s one made from the cover.');
  await expect(spines).toHaveCount(2);   // Generated, and Cover
  await expect(spines.first()).toHaveAttribute('aria-checked', 'true');
  await d.getByRole('button', { name: 'Add to shelf' }).click();
  await expect(d).toBeHidden();
  await expect(page.locator('#books .book .bt')).toHaveText(['Gummo']);
  expect(errors).toEqual([]);
});

// the footer, the same on every page: one line of small print, About · Privacy · hello@shelfstackd.com. The credits
// (TMDB's line and logo, Open Library, Search by Brave) are under About, on the privacy page
for (const pg of [...PAGES, { name: 'privacy', path: '/privacy.html' }, { name: 'not found', path: '/nope' }]) {
  test(`${pg.name}: the footer is one line: About · Privacy · hello@shelfstackd.com`, async ({ page }) => {
    await mockNetwork(page, NEW);
    await open(page, pg.path);
    const foot = page.locator('footer');
    expect((await foot.innerText()).replace(/\s+/g, ' ').trim()).toBe('About · Privacy · hello@shelfstackd.com');
    await expect(foot.locator('a')).toHaveText(['About', 'Privacy', 'hello@shelfstackd.com']);
    expect(await foot.getByRole('link', { name: 'About' }).evaluate(a => { const u = new URL(a.href); return u.pathname + u.hash; })).toBe('/privacy.html#credits');
    expect(await foot.getByRole('link', { name: 'Privacy' }).evaluate(a => { const u = new URL(a.href); return u.pathname + u.hash; })).toBe('/privacy.html');
    await expect(foot.getByRole('link', { name: 'hello@shelfstackd.com' })).toHaveAttribute('href', 'mailto:hello@shelfstackd.com');
    // small grey print on one line, with no credits in it any more (they made it three lines on a phone)
    expect(await foot.evaluate(el => { const s = getComputedStyle(el); return [s.backgroundColor, s.color, s.fontSize]; })).toEqual(['rgba(0, 0, 0, 0)', 'rgb(107, 107, 107)', '11px']);
    const tops = await foot.locator('a').evaluateAll(as => as.map(a => Math.round(a.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    expect((await foot.locator('.fnav').boundingBox()).height).toBeLessThan(22);
    expect((await foot.boundingBox()).height).toBeLessThanOrEqual(64);
    await expect(foot).not.toContainText(/TMDB|Open Library|Brave|how it works/i);
    await expect(foot.locator('h2, h3, ol, .btn, img')).toHaveCount(0);
    // About goes to the Credits (signed out, Settings opens its sign-in sheet over the page: that's shut first)
    if (await page.locator('.sheet:not([hidden])').count()) await page.keyboard.press('Escape');
    await foot.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/\/privacy\.html#credits$/);
    await expect(page.getByRole('heading', { name: 'Credits' })).toBeInViewport();
  });
}

/* ---------- 3. speed: what shows while the spines are looked for ---------- */
// /scans answered by the test: round 0 searches slowly; later rounds come from what's kept (cached), or aren't kept
function slowScans(page, { kept }) {
  const asked = [];
  page.route(u => u.pathname === '/scans', async route => {
    const u = new URL(route.request().url()), round = +u.searchParams.get('round'), only = u.searchParams.get('cacheonly') === '1';
    asked.push({ round, only, at: Date.now() });
    if (only) return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ results: [], round, more: round < 3, cached: kept }) });
    await new Promise(r => setTimeout(r, round === 0 ? 1500 : 300));   // a search takes a while
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ results: [], round, more: round < 3 }) });
  });
  return asked;
}
test('while the scans load, the spine made from the cover and the Cover are there to pick, and Add to shelf works', async ({ page }) => {
  const errors = watchErrors(page), net = await openDialog(page, { signedIn: true }), d = dialog(page);
  const asked = slowScans(page, { kept: false });
  await box(d).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  const tiles = d.locator('#addFound [data-use]');
  await expect(tiles).toHaveCount(2, { timeout: 1200 });   // before round 0's search has answered
  expect(asked.filter(a => !a.only && a.round === 0)).toHaveLength(1);
  await expect(d.locator('#addFound [data-use="spine"]')).toHaveAttribute('aria-checked', 'true');
  await expect(d.locator('#addFound [data-use="cover"]')).toBeVisible();
  await expect(d.getByRole('button', { name: 'Add to shelf' })).toBeEnabled();
  await d.locator('#addFound [data-use="cover"]').click();   // picked while it's still looking: it stays picked
  await expect.poll(() => asked.filter(a => !a.only).length, { timeout: 8000 }).toBe(4);   // all four rounds, nothing kept
  await expect(d.locator('#addFound [data-use="cover"]')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});
test('rounds kept from before are asked for at once, without a search, while round 0 searches; none is searched again', async ({ page }) => {
  await openDialog(page, { signedIn: true });
  const d = dialog(page), asked = slowScans(page, { kept: true });
  await box(d).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  await expect.poll(() => asked.filter(a => a.only).map(a => a.round).sort()).toEqual([1, 2, 3]);
  const first = asked.find(a => !a.only && a.round === 0);
  expect(asked.filter(a => a.only).every(a => a.at - first.at < 500)).toBe(true);   // at the same time as round 0, not after it
  await page.waitForTimeout(2500);
  expect(asked.filter(a => !a.only).map(a => a.round)).toEqual([0]);   // the others came from what was kept
});
test('rounds that aren\'t kept are still searched one after another, each only when the one before wasn\'t enough', async ({ page }) => {
  await openDialog(page, { signedIn: true });
  const d = dialog(page), asked = slowScans(page, { kept: false });
  await box(d).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  await expect.poll(() => asked.filter(a => !a.only).length, { timeout: 8000 }).toBe(4);
  const live = asked.filter(a => !a.only);
  expect(live.map(a => a.round)).toEqual([0, 1, 2, 3]);
  for (let i = 1; i < live.length; i++) expect(live[i].at - live[i - 1].at).toBeGreaterThanOrEqual(250);   // after the one before answered
});
test('a book with no scan found has three rounds, not four: round 0, then the book spine, then the dust jacket', async ({ page }) => {
  await openDialog(page, { signedIn: true });
  const d = dialog(page), asked = slowScans(page, { kept: false });
  await box(d).fill('the waves');
  await d.getByRole('option', { name: /The Waves.*Book/ }).click();
  await expect.poll(() => asked.filter(a => !a.only).length, { timeout: 8000 }).toBe(3);
  await page.waitForTimeout(1000);
  expect(asked.filter(a => !a.only).map(a => a.round)).toEqual([0, 1, 2]);
  expect(asked.filter(a => a.only).map(a => a.round).sort()).toEqual([1, 2]);   // what's kept is asked for those two only
});
test('a title search starts 250 ms after the last key, not before', async ({ page }) => {
  const d = dialog(page);
  await openDialog(page, { signedIn: true });
  let at = 0; page.on('request', r => { if (r.url().includes('/identify?') && !at) at = Date.now(); });
  await box(d).pressSequentially('gummo', { delay: 20 });
  const typed = Date.now();
  await expect(options(d)).toHaveCount(1);
  expect(at - typed).toBeGreaterThanOrEqual(150);
  expect(at - typed).toBeLessThan(600);
});

test('the Add dialog says "Search by Brave", small and grey, under the spines a search found', async ({ page }) => {
  await openDialog(page, {}, '/feed/?everyone');
  const d = dialog(page), by = d.getByRole('link', { name: 'Search by Brave' });
  await expect(by).toBeHidden();   // nothing has been searched for yet: the titles come from TMDB and Open Library
  await box(d).fill('gummo');
  await expect(options(d)).toHaveCount(1);
  await expect(by).toBeHidden();
  await options(d).first().click();
  await expect(d.getByRole('radiogroup', { name: 'Which spine' }).getByRole('radio')).toHaveCount(2);
  await expect(by).toBeVisible();
  await expect(by).toHaveAttribute('href', 'https://search.brave.com/');
  expect(await by.evaluate(el => { const s = getComputedStyle(el); return [s.color, s.fontSize]; })).toEqual(['rgb(107, 107, 107)', '11px']);
  // under the spines, on the line of Add to shelf, at the left
  const at = await by.boundingBox(), found = await d.locator('#addFound').boundingBox(), go = await d.getByRole('button', { name: 'Add to shelf' }).boundingBox();
  expect(at.y).toBeGreaterThanOrEqual(found.y + found.height);
  expect(Math.abs(at.x - found.x)).toBeLessThanOrEqual(4);
  expect(at.x + at.width).toBeLessThan(go.x);
  expect(Math.abs(at.y + at.height / 2 - (go.y + go.height / 2))).toBeLessThanOrEqual(2);
  // Log it and Watchlist search for no spines, so they don't say it
  await d.getByRole('radio', { name: 'Log it' }).check();
  await expect(by).toBeHidden();
});

/* ---------- 4. the builder's smaller touches ---------- */
test('the preview is not hidden by the Save bar', async ({ page }) => {
  test.skip(isPhone(), 'on a phone the preview is in the page, not beside it');
  await mockNetwork(page, NEW);
  await open(page, '/build/');
  const stage = await page.locator('#stage').boundingBox(), bar = await page.locator('.mkbar').boundingBox();
  expect(stage.height).toBeGreaterThan(200);
  expect(stage.y + stage.height).toBeLessThanOrEqual(bar.y);
});

test('the Name box suggests a name, the count shows the limit, and an empty shelf says so', async ({ page }) => {
  await mockNetwork(page, NEW);
  await open(page, '/build/');
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'e.g. 2am films');
  await expect(page.locator('#books .empty')).toContainText('No spines yet.');
  await expect(page.locator('#count')).toHaveText('(0 of 20)');   // everyone has Pro's 20 for now
  await page.locator('header.top .add').click();
  const d = dialog(page);
  await box(d).fill('gummo');
  await options(d).first().click();
  await d.getByRole('button', { name: 'Add to shelf' }).click();
  await expect(page.locator('#count')).toHaveText('(1 of 20)');
});

test('a full shelf: Add and upload are off and say why, and work again when a spine is removed', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, NEW);
  await open(page, '/build/');
  const png = Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 60; c.height = 90;
    const x = c.getContext('2d'); x.fillStyle = '#24456B'; x.fillRect(0, 0, 60, 90);
    return c.toDataURL('image/png').split(',')[1];
  }), 'base64');
  const picker = page.waitForEvent('filechooser');
  await page.locator('#upload').click();
  await (await picker).setFiles(Array.from({ length: 20 }, (_, i) => ({ name: `Title ${i + 1}.png`, mimeType: 'image/png', buffer: png })));
  await expect(page.locator('#books .book')).toHaveCount(20);
  await expect(page.locator('#count')).toHaveText('(20 of 20)');
  const add = page.getByRole('textbox', { name: 'Add' });
  await expect(add).toBeDisabled();
  await expect(page.locator('#findNote')).toHaveText('A shelf holds 20 spines. Remove one to add another.');
  await expect(add).toHaveAccessibleDescription('A shelf holds 20 spines. Remove one to add another.');
  await expect(page.locator('#file')).toBeDisabled();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  // one off: there's room again
  await page.locator('#books .bopen').first().click();
  await page.locator('#books .book').first().getByRole('button', { name: /^Remove/ }).click();
  await expect(page.locator('#count')).toHaveText('(19 of 20)');
  await expect(add).toBeEnabled();
  await expect(page.locator('#findNote')).toBeHidden();
  expect(errors).toEqual([]);
});
