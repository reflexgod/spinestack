// A shelf's own page (/u/?name&shelf, or by its id, /u/?name&shelf=id): its heading, Share, the shelf itself on the
// wash (the story is only for Share), what's on it with + Add to my shelf (beside the picture on a wide window), and
// for its owner Edit, Make private or public, and Delete with a confirm.
const { test, expect } = require('@playwright/test');
const { SHELVES, ME, CORS, mockNetwork, watchErrors, open, putAside } = require('../site');

const theirs = SHELVES[1], mine = SHELVES[3];   // @mira's "shelf number 1"; the made-up account's second shelf
const rows = page => page.locator('#oneItems li');
const titles = page => page.locator('#books .book .bt').allTextContents();
const sent = (page, method, part) => page.waitForRequest(r => r.method() === method && r.url().includes(part));

test('someone\'s shelf: its name, who made it and when, the shelf itself, and what\'s on it', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('shelf number 1');
  await expect(page.locator('.phead')).toBeHidden();   // the shelf has its own heading
  const by = page.locator('#oneBy');
  await expect(by).toHaveText(/^by @mira· .*2026 · 2 spines$/);
  await expect(by.getByRole('link', { name: '@mira' })).toHaveAttribute('href', '/u/?mira');
  await expect(page.locator('#oneShelf canvas')).toBeVisible();
  // the shelf itself, as the profile's hero has it: the books cut out of the story, on the wash, with no caption (the
  // name is said once, in the heading). Not the 9:16 story with the books at its foot
  expect(await page.locator('#oneShelf').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(243, 243, 243)');
  const drawn = await page.locator('#oneShelf canvas').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let clear = 0; for (let i = 3; i < d.length; i += 4) if (!d[i]) clear++;
    return { w: c.width, h: c.height, clear: clear / (d.length / 4), bottom: c.getBoundingClientRect().bottom, label: c.getAttribute('aria-label') }; });
  expect(drawn.h).toBeLessThan(600);          // a pile of two books and nothing else
  expect(drawn.w).toBeGreaterThan(drawn.h);
  expect(drawn.clear).toBeGreaterThan(.03);   // nothing behind the books: the panel shows through
  expect(drawn.label).toBe('shelf number 1: The Waves, Journey by Moonlight');
  expect(drawn.bottom).toBeLessThanOrEqual(page.viewportSize().height);   // on the first screen, on a phone too
  // not yours: Report, and nothing else under the heading
  await expect(page.locator('#oneActs').locator('button:visible, a:visible')).toHaveText(['Report']);
  // On this shelf: a row for each spine
  await expect(page.getByRole('heading', { level: 2, name: 'On this shelf' })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  const first = rows(page).first();
  await expect(first.locator('.st b')).toHaveText('The Waves 1931');
  await expect(first.locator('.st > span')).toHaveText('Virginia Woolf · Book');
  await expect(first.locator('.sthumb canvas')).toHaveCount(1);
  // both titles are on the made-up account's own shelf already: "On your shelf", not + Add to my shelf
  await expect(rows(page).locator('.onmine')).toHaveText(['On your shelf', 'On your shelf']);
  await expect(page.locator('#oneItems').getByRole('button', { name: '+ Add to my shelf' })).toHaveCount(0);
  // the list is beside the picture on a wide window, its top in line with the picture's; under it on a phone
  const pic = await page.locator('#oneShelf').boundingBox(), list = await page.locator('#oneOn').boundingBox();
  if (test.info().project.name.startsWith('desktop')){
    expect(list.x).toBeGreaterThanOrEqual(pic.x + pic.width);
    expect(Math.abs(list.y - pic.y)).toBeLessThanOrEqual(1);
  } else expect(list.y).toBeGreaterThanOrEqual(pic.y + pic.height);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

test('+ Add to my shelf puts that same spine on the shelf being built, with no new search', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page, { signedIn: true, ownShelf: false });   // signed in, with no shelf yet
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

test('your own shelf: Edit, Make private, and Delete after a confirm', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  const at = `/u/?tester&shelf=${mine.id}`;
  await open(page, at);
  await expect(page.locator('#oneActs').locator('button:visible, a:visible')).toHaveText(['Edit', 'Make private', 'Delete']);
  await expect(page.locator('#oneActs').getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `../build/?open=${mine.id}`);
  // Make private
  let req = sent(page, 'PATCH', `/rest/v1/shelves?id=eq.${mine.id}`);
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
  // Delete, then yes: it's deleted and you're back on your profile
  await page.getByRole('button', { name: 'Delete' }).click();
  req = sent(page, 'DELETE', `/rest/v1/shelves?id=eq.${mine.id}`);
  await ask.getByRole('button', { name: 'Delete' }).click();
  await req;
  await expect(page).toHaveURL(/\/u\/\?tester$/);
  expect(errors).toEqual([]);
});

test('your own shelf: its name in the heading renames it; nothing says main', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?tester&shelf=${mine.id}`);
  await page.getByRole('heading', { level: 1 }).getByRole('button', { name: 'shelf number 3' }).click();
  const box = page.getByRole('textbox', { name: 'Shelf name' });
  await box.fill('late films');
  const req = sent(page, 'PATCH', `/rest/v1/shelves?id=eq.${mine.id}`);
  await box.press('Enter');
  expect((await req).postDataJSON()).toEqual({ name: 'late films' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('late films');
  await open(page, `/u/?tester&shelf=${SHELVES[0].id}`);
  await expect(page.locator('#oneBy .tag')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /main/i })).toHaveCount(0);
});

test('/u/?name&shelf is their shelf', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira&shelf');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('shelf number 1');   // the one saved last
  await expect(page.locator('#oneItems li')).toHaveCount(2);
  await expect(page.locator('#backLink')).toHaveAttribute('href', '/u/?mira');
});

test('/u/?name&shelf with no shelf yet: yours says how to make it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await open(page, '/u/?tester&shelf');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This shelf has no spines.');
  await expect(page.locator('#oneActs').locator('button:visible, a:visible')).toHaveText(['Make your shelf']);
  await expect(page.getByRole('link', { name: 'Make your shelf' })).toHaveAttribute('href', '../build/');
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeHidden();
});

test('/u/?name&shelf with no shelf yet: a visitor is told so, with nothing to press', async ({ page }) => {
  await mockNetwork(page, { ownShelf: false });
  await open(page, '/u/?tester&shelf');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing shelved here yet.');
  await expect(page.locator('#oneActs')).toBeHidden();
});

test('a shelf that isn\'t there says so, with nothing to press but the way back', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira&shelf=cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This shelf is private or gone.');
  await expect(page.locator('#oneActs')).toBeHidden();
  await expect(page.locator('#oneOn')).toBeHidden();
  await expect(page.locator('#backLink')).toHaveAttribute('href', '/u/?mira');
});

test('a covers shelf whose books have no picture still draws, each with a plain cover', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?mira&shelf=${SHELVES[4].id}`);   // laid out as covers; the made-up spines have no cover pictures
  await expect(page.locator('#oneShelf canvas')).toBeVisible();
  expect(await page.locator('#oneShelf canvas').evaluate(c => c.spots.length)).toBe(2);
  await open(page, '/u/?longusername_twenty1');            // and a profile whose shelf is one
  await expect(page.locator('#featLink canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- Share, by a shelf's name ---------- */
const shareMenu = page => page.getByRole('menu', { name: 'Share', exact: true });
// a PNG's size, from the file
const pngSize = file => { const b = require('fs').readFileSync(file); return [b.subarray(1, 4).toString(), b.readUInt32BE(16), b.readUInt32BE(20)]; };

for (const [whose, at] of [['someone\'s public shelf', `/u/?mira&shelf=${theirs.id}`], ['your own shelf', `/u/?tester&shelf=${mine.id}`]]) {
  test(`${whose}: Share is a small button by the name, with Share to story, Download image and Copy link`, async ({ page }) => {
    const errors = watchErrors(page);
    await mockNetwork(page, { signedIn: true });
    await open(page, at);
    await expect(page.locator('#oneItems li')).toHaveCount(2);
    const share = page.getByRole('button', { name: 'Share', exact: true });
    await expect(share).toBeVisible();
    await expect(share.locator('svg')).toHaveCount(1);
    // small, and on the name's line, after it
    const b = await share.boundingBox(), h = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(b.width).toBeLessThanOrEqual(32);
    expect(b.x).toBeGreaterThanOrEqual(h.x + h.width);
    expect(Math.abs(b.y + b.height / 2 - (h.y + h.height / 2))).toBeLessThanOrEqual(6);
    await share.click();
    await expect(shareMenu(page)).toBeVisible();
    await expect(share).toHaveAttribute('aria-expanded', 'true');
    await expect(shareMenu(page).getByRole('menuitem')).toHaveText(['Share to story', 'Download image', 'Copy link']);
    // Copy link
    await shareMenu(page).getByRole('menuitem', { name: 'Copy link' }).click();
    await expect(shareMenu(page)).toBeHidden();
    await expect(page.locator('#toast')).toHaveText(new RegExp('Link copied\\.|' + at.replace(/[?]/g, '\\?')));
    // Download image: the whole story, 1080 x 1920
    await share.click();
    let download = page.waitForEvent('download');
    await shareMenu(page).getByRole('menuitem', { name: 'Download image' }).click();
    let file = await download;
    expect(file.suggestedFilename()).toBe('shelfstackd-story.png');
    expect(pngSize(await file.path())).toEqual(['PNG', 1080, 1920]);
    await expect(page.locator('#toast')).toHaveText('Downloaded shelfstackd-story.png.');
    // Share to story: this browser has no share sheet for pictures, so it's saved, with what to do next
    await share.click();
    download = page.waitForEvent('download');
    await shareMenu(page).getByRole('menuitem', { name: 'Share to story' }).click();
    file = await download;
    expect(pngSize(await file.path())).toEqual(['PNG', 1080, 1920]);
    await expect(page.locator('#toast')).toHaveText('Saved as shelfstackd-story.png. Add it to your Instagram story.');
    // Esc shuts the menu and goes back to the button
    await share.click();
    await page.keyboard.press('Escape');
    await expect(shareMenu(page)).toBeHidden();
    await expect(share).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('on a phone with a share sheet, Share to story hands the picture to it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  await expect(page.locator('#oneItems li')).toHaveCount(2);
  // a browser that can share files, and a finger for a pointer: put on the page itself, and checked before anything is pressed
  const ready = await page.evaluate(() => {
    window.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__shared.push(d.files.map(f => `${f.name} ${f.type} ${f.size > 1000}`)); } });
    const mm = window.matchMedia.bind(window);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: q => q === '(pointer:coarse)' ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q) });
    return navigator.canShare({ files: [new File(['x'], 'a.png', { type: 'image/png' })] }) && matchMedia('(pointer:coarse)').matches;
  });
  expect(ready).toBe(true);
  let downloads = 0; page.on('download', () => downloads++);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(shareMenu(page)).toBeVisible();
  await shareMenu(page).getByRole('menuitem', { name: 'Share to story' }).click();
  await expect(page.locator('#toast')).toHaveText(/^Making the picture…$|^$/);
  // the page says it's making the picture (a browser can take a few seconds over a PNG this size), then the picture
  // goes to the share sheet: nothing is saved, and the line is taken away
  await expect.poll(() => page.evaluate(() => window.__shared), { timeout: 20000 }).toEqual([['shelfstackd-story.png image/png true']]);
  await expect(page.locator('#toast')).toBeHidden();
  expect(downloads).toBe(0);
});

test('a shelf that isn\'t there has no Share', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira&shelf=cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This shelf is private or gone.');
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeHidden();
});

/* ---------- what a dashed link is for ---------- */
// going somewhere, doing something small and losing something used to look the same (bold capitals, a dashed underline)
test('the way back is plain grey text, a small action is plain ink, one that loses something is grey; nothing is dashed', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const look = loc => loc.evaluate(el => { const s = getComputedStyle(el); return { dashed: s.backgroundImage.includes('repeating-linear-gradient') || s.textDecorationStyle === 'dashed', grey: s.color === 'rgb(107, 107, 107)', capitals: s.textTransform === 'uppercase' }; });
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  const back = page.locator('#backLink');
  await expect(back).toHaveText('Back to @mira');
  expect(await look(back)).toEqual({ dashed: false, grey: true, capitals: false });   // going back: it does nothing
  expect(await back.evaluate(el => getComputedStyle(el).fontWeight)).toBe('400');
  expect(await look(page.getByRole('button', { name: 'Report' }))).toEqual({ dashed: false, grey: false, capitals: false });   // a small action
  await open(page, `/u/?tester&shelf=${mine.id}`);
  expect(await look(page.getByRole('button', { name: 'Make private' }))).toEqual({ dashed: false, grey: false, capitals: false });
  expect(await look(page.getByRole('button', { name: 'Delete' }))).toEqual({ dashed: false, grey: true, capitals: false });    // it loses the shelf
  await back.click();
  await expect(page).toHaveURL(/\/u\/\?tester$/);
});

/* ---------- a title that's already on your shelf isn't offered to it again ---------- */
// the made-up account's own shelf answered with only these titles (the tests' shelves all hold the same two otherwise)
const myShelfHolds = (page, titles) => page.route(u => u.pathname === '/rest/v1/shelf_items' && u.searchParams.get('shelf_id') === 'eq.' + SHELVES[0].id, route => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(titles.map((t, i) => ({ position: i, kind: t[0], title: t[1], year: t[2] }))) });
});
const offered = page => page.locator('#oneItems li').evaluateAll(lis => lis.map(li => li.querySelector('[data-add]') ? '+ Add to my shelf' : (li.querySelector('.onmine') || {}).textContent || ''));

test('someone else\'s shelf: a title already on your shelf says "On your shelf" in grey; one that isn\'t has + Add to my shelf', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await myShelfHolds(page, [['book', 'the waves ', 1931], ['movie', 'Gummo', 1997]]);   // the same title, typed a little differently
  const asked = page.waitForRequest(r => r.url().includes('/rest/v1/shelf_items') && r.url().includes(SHELVES[0].id));
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  expect(new URL((await asked).url()).searchParams.get('select')).toBe('kind,title,year');   // your own shelf (the one saved last), only what's needed to compare
  await expect(rows(page)).toHaveCount(2);
  expect(await offered(page)).toEqual(['On your shelf', '+ Add to my shelf']);   // The Waves is on yours; Journey by Moonlight isn't
  const said = rows(page).first().locator('.onmine');
  expect(await said.evaluate(el => { const s = getComputedStyle(el); return [s.color, s.fontSize, s.textTransform]; })).toEqual(['rgb(107, 107, 107)', '11px', 'none']);
  await expect(rows(page).first().getByRole('button', { name: /add to my shelf/i })).toHaveCount(0);   // only its watchlist button (specs/watchlist.spec.js)
  // where the button would be: at the right of its row (on a touch screen, just before its •••)
  const more = rows(page).first().locator('.wmorewrap'), end = await more.isVisible() ? (await more.boundingBox()).x : (await rows(page).first().boundingBox()).x + (await rows(page).first().boundingBox()).width;
  const at = await said.boundingBox();
  expect(Math.abs(at.x + at.width - end)).toBeLessThanOrEqual(13);
  // the same film in another year is another title
  await myShelfHolds(page, [['book', 'The Waves', 2019], ['movie', 'The Waves', 1931]]);
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  expect(await offered(page)).toEqual(['+ Add to my shelf', '+ Add to my shelf']);
  expect(errors).toEqual([]);
});

test('your own shelf: nothing is offered beside its titles (they\'re on it)', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester&shelf');
  await expect(rows(page)).toHaveCount(2);
  expect(await offered(page)).toEqual(['', '']);
  await expect(page.locator('#oneItems').getByRole('button')).toHaveText(['Log', 'Log']);   // logging one is all there is to do
  await expect(page.locator('#oneItems')).not.toContainText(/add to my shelf|on your shelf/i);
});

test('an older shelf of yours: only the titles that aren\'t on your shelf are offered to it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await myShelfHolds(page, [['book', 'Journey by Moonlight', 1937]]);
  await open(page, `/u/?tester&shelf=${mine.id}`);   // from before there was one shelf each: not the one saved last
  await expect(rows(page)).toHaveCount(2);
  expect(await offered(page)).toEqual(['+ Add to my shelf', '']);
});

test('with no shelf of your own yet, every title is offered', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  await expect(rows(page)).toHaveCount(2);
  expect(await offered(page)).toEqual(['+ Add to my shelf', '+ Add to my shelf']);
});

// Signed out the site is read only: + Add to my shelf is there, and opens the sign-in sheet; once signed in, the
// builder opens with that spine on your shelf. Nothing else a visitor could change is on the page
test('signed out, + Add to my shelf opens the sign-in sheet, and once signed in the spine goes on your shelf', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  const signBack = await putAside(page);
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  await expect(rows(page)).toHaveCount(2);
  expect(await offered(page)).toEqual(['+ Add to my shelf', '+ Add to my shelf']);
  for (const t of ['Edit', 'Make private', 'Make public', 'Delete']) await expect(page.locator('main').getByRole('button', { name: t, exact: true })).toHaveCount(0);
  await expect(page.locator('main').getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await rows(page).nth(1).getByRole('button', { name: '+ Add to my shelf' }).click();
  await expect(page).toHaveURL(new RegExp(`shelf=${theirs.id}$`));   // still here: nothing goes to the builder yet
  await expect(page.locator('#signSheet')).toBeVisible();
  await expect(page.locator('#signSheet .sheetbox p:not(.note)').first()).toHaveText('Sign in to start your shelf.');
  // back from Google, signed in: on to the builder, with the spine on your shelf
  await signBack(); await page.reload();
  await expect(page).toHaveURL(/\/build\/$/);
  await expect.poll(() => titles(page)).toEqual(['Journey by Moonlight']);
  expect(errors).toEqual([]);
});

test('if your own shelf can\'t be read, every title is offered, as before', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await page.route(u => u.pathname === '/rest/v1/shelf_items' && u.searchParams.get('shelf_id') === 'eq.' + SHELVES[0].id, route =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : route.fulfill({ status: 500, headers: CORS, contentType: 'application/json', body: '{"message":"no"}' }));
  await open(page, `/u/?mira&shelf=${theirs.id}`);
  await expect(rows(page)).toHaveCount(2);
  expect(await offered(page)).toEqual(['+ Add to my shelf', '+ Add to my shelf']);
});

