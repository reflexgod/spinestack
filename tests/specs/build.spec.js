// + ADD (the Add dialog, on Put on shelf) and the builder: your shelf (one each), the spines as a list, Style, the
// preview, and Cancel · Save.
const { test, expect } = require('@playwright/test');
const { PAGES, SHELVES, ME, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const dialog = page => page.getByRole('dialog', { name: /add to your shelf/i });
const rows = page => page.locator('#books .book');
const titles = page => page.locator('#books .book .bt').allTextContents();
const spines = d => d.getByRole('radiogroup', { name: 'Which spine' }).getByRole('radio');   // the choices in step 2

// through the dialog: search, pick the first match, wait for its spines, Add to shelf
async function addGummo(page) {
  const d = dialog(page);
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();   // the suggestions come by themselves
  await expect(spines(d)).toHaveCount(2);                      // no scans in the tests: Generated, and Cover
  await expect(spines(d).first()).toHaveAttribute('aria-checked', 'true');
  await d.getByRole('button', { name: 'Add to shelf' }).click();
}

/* ---------- the dialog ---------- */
for (const pg of PAGES) {
  test(`${pg.name}: + ADD opens the dialog with only a search box, and Esc closes it`, async ({ page }) => {
    const net = await mockNetwork(page, { signedIn: true }), errors = watchErrors(page);
    await open(page, pg.path);
    await page.locator('header.top .add').click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole('combobox', { name: 'Film or book name' })).toBeFocused();
    await expect(d.getByRole('radiogroup', { name: 'Search in' }).getByRole('radio')).toHaveCount(3);   // All · Films · Books
    await expect(d.locator('#addSpines')).toBeHidden();
    await expect(d.getByRole('button', { name: 'Add to shelf' })).toBeHidden();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(page).toHaveURL(new RegExp(pg.path.replace(/[?]/g, '\\?') + '$'));   // still on the page it was opened from
    expect(errors, 'console errors').toEqual([]);
    expect(net.unknown, 'requests the tests have no answer for').toEqual([]);
  });
}

test('on the builder: search, pick, Add to shelf puts the spine on the shelf without loading the page again', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page);
  await open(page, '/build/');
  await expect(page.locator('#books .empty')).toBeVisible();   // a new shelf starts empty
  await page.evaluate(() => { window.__same = true; });
  await page.locator('header.top .add').click();
  const d = dialog(page);
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('waves');
  await expect(d.getByRole('option')).toHaveCount(2);   // the film Waves and the book The Waves
  await d.getByRole('radio', { name: 'Books' }).check();
  await expect(d.getByRole('option')).toHaveCount(1);
  await d.getByRole('radio', { name: 'All' }).check();
  await expect(d.getByRole('option')).toHaveCount(2);
  await addGummo(page);
  await expect(d).toBeHidden();
  expect(await titles(page)).toEqual(['Gummo']);   // the film is on the shelf
  expect(await page.evaluate(() => window.__same)).toBe(true);
  await expect(page).toHaveURL(/\/build\/$/);
  expect(errors).toEqual([]);
});

test('from another page: Add to shelf goes to the builder, which opens your shelf with the spine after what was there', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(rows(page)).toHaveCount(3);
  expect(await titles(page)).toEqual(['The Waves', 'Journey by Moonlight', 'Gummo']);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf');
  expect(errors).toEqual([]);
});

test('before you have a shelf, Add to shelf from another page starts it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(rows(page)).toHaveCount(1);
  expect(await titles(page)).toEqual(['Gummo']);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf');
});

test('the Add field on the builder opens the same dialog, searching for what was typed', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/build/');
  await page.getByRole('textbox', { name: 'Add' }).fill('waves');
  await page.keyboard.press('Enter');
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(d.getByRole('combobox', { name: 'Film or book name' })).toHaveValue('waves');
  await expect(d.getByRole('option')).toHaveCount(2);
});

/* ---------- the builder ---------- */
test('the builder is your shelf\'s page: name, who can view, Add, the list, Style shut, the bar', async ({ page }) => {
  const net = await mockNetwork(page, { signedIn: true }), errors = watchErrors(page);
  await open(page, '/build/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf');
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Who can view' }).getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: 'Public' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Add' })).toBeVisible();
  await expect(page.locator('#upload')).toHaveText('upload a scan');
  await expect(page.locator('#story')).toBeVisible();
  // gone: the explainer, the tagline, My shelves, the old search section
  for (const text of ['The real spine, not a mockup.', 'My shelves', 'Find a spine']) await expect(page.getByText(text)).toHaveCount(0);
  // Style: one panel, shut, with what's picked on its line
  const style = page.locator('#stylePanel');
  await expect(style).not.toHaveAttribute('open', '');
  await expect(style.locator('#styleLine')).toHaveText('Spines · Clean · Paper');
  await expect(page.locator('#layout')).toBeHidden();
  await style.locator('summary').click();
  for (const name of ['Layout', 'Filter', 'Background', 'Edition']) await expect(style.getByRole('group', { name }).or(style.getByRole('radiogroup', { name }))).toHaveCount(1);
  await expect(style.getByRole('textbox', { name: 'Caption' })).toBeVisible();
  await style.getByRole('button', { name: 'Stacked' }).click();
  await style.getByRole('checkbox', { name: 'Wood shelf' }).check();
  await expect(style.locator('#styleLine')).toHaveText('Stacked · Clean · Paper · Wood shelf');
  // the bar: Cancel and Save, nothing else (the story is shared from the saved shelf's page); Save is the black button
  expect(await page.locator('.mkbar > button:visible').allTextContents()).toEqual(['Cancel', 'Save']);
  await expect(page.getByText(/share sheet|Share to Instagram|Save story/i)).toHaveCount(0);
  expect(await page.locator('.mkbar > button.primary:visible').allTextContents()).toEqual(['Save']);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

test('a spine’s Spine, Text and ✕ show only when its row is pressed, one row at a time', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/build/?sample');   // four spines to work with
  const row = n => rows(page).nth(n), remove = n => row(n).getByRole('button', { name: /^Remove/ });
  await expect(page.locator('#books .bbody:visible')).toHaveCount(0);
  await row(0).locator('.bopen').click();
  await expect(remove(0)).toBeVisible();
  await expect(row(0).getByLabel('Spine', { exact: true })).toBeVisible();
  await expect(row(0).getByLabel('Text', { exact: true })).toBeVisible();
  await row(1).locator('.bopen').click();
  await expect(remove(1)).toBeVisible();
  await expect(remove(0)).toBeHidden();
  await expect(page.locator('#books .bbody:visible')).toHaveCount(1);
  await row(1).locator('.bopen').click();   // pressed again: shut
  await expect(page.locator('#books .bbody:visible')).toHaveCount(0);
  // ✕ takes the spine off
  await row(0).locator('.bopen').click();
  await remove(0).click();
  await expect(rows(page)).toHaveCount(3);
});

test('reordering: ↑ ↓ from the keyboard, and dragging a row by its dots', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/build/?sample');
  const before = await titles(page);
  await rows(page).nth(0).locator('.bopen').click();
  await rows(page).nth(0).getByRole('button', { name: 'Move down' }).press('Enter');
  expect(await titles(page)).toEqual([before[1], before[0], before[2], before[3]]);
  await expect(rows(page).nth(1).getByRole('button', { name: 'Move up' })).toBeVisible();   // the row stays open where it went
  test.skip(isPhone(), 'the drag is done with a mouse here');
  await expect(page.locator('#books .grip').first()).toBeVisible();   // SortableJS is in
  const from = await rows(page).nth(3).locator('.grip').boundingBox(), to = await rows(page).nth(0).locator('.grip').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 6 });
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 20 });
  await page.waitForTimeout(250);   // the rows finish sliding before the drop
  await page.mouse.up();
  await expect.poll(() => titles(page)).toEqual([before[3], before[1], before[0], before[2]]);
});

test('Save, signed out, asks you to sign in', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('Save, signed in, before you have a shelf: the name and Private are saved, then the shelf’s own page opens', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await page.getByRole('textbox', { name: 'Name' }).fill('my films');
  await page.getByText('Private', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Private' })).toBeChecked();
  const saved = page.waitForRequest(r => r.url().includes('/rpc/save_shelf'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const { shelf, items } = (await saved).postDataJSON();
  expect(shelf.is_public).toBe(false);
  expect(shelf.caption).toBe('my films');   // a new shelf's name is the caption on its story too
  expect(items.map(i => i.title)).toEqual(['Gummo']);
  await expect(page).toHaveURL(new RegExp(`/u/\\?tester&shelf=${shelf.id}$`));
  // on the shelf's page: said once, with where sharing is
  await expect(page.locator('#toast')).toHaveText('Saved. Share it from the ↗ icon.');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#toast')).toBeHidden();
  expect(errors).toEqual([]);
});

test('signed in with a shelf: the builder opens it, and Save saves over it (never a second shelf)', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  const mine = SHELVES.find(s => s.owner === ME.id);   // the one saved last: no main shelf is set
  await open(page, '/build/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf');
  expect(await titles(page)).toEqual(['The Waves', 'Journey by Moonlight']);
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(mine.name);
  await expect(page.getByRole('button', { name: /new shelf/i })).toHaveCount(0);
  await page.locator('header.top .add').click();
  await addGummo(page);
  const saved = page.waitForRequest(r => r.url().includes('/rpc/save_shelf'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const { shelf, items } = (await saved).postDataJSON();
  expect(shelf.id).toBe(mine.id);
  expect(items.map(i => i.title)).toEqual(['The Waves', 'Journey by Moonlight', 'Gummo']);
  await expect(page).toHaveURL(new RegExp(`/u/\\?tester&shelf=${mine.id}$`));
  expect(errors).toEqual([]);
});

test('spines put on a shelf before signing in go on your shelf once you are, after what was there', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/privacy.html');
  // signed out on this device for now: the session is put aside, and the builder loads without it
  const session = await page.evaluate(() => { const k = Object.keys(localStorage).find(x => /^sb-.+-auth-token$/.test(x)); const v = [k, localStorage.getItem(k)]; localStorage.removeItem(k); return v; });
  await open(page, '/build/');
  await expect(page.locator('#books .empty')).toBeVisible();
  await page.locator('header.top .add').click();
  await addGummo(page);
  await page.waitForFunction(() => !!sessionStorage.getItem('spinestack-draft'));
  await page.waitForTimeout(700);
  // signed in again (as coming back from Google): your shelf opens, with Gummo after its spines, not saved yet
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), session);
  await open(page, '/build/');
  await expect.poll(() => titles(page)).toEqual(['The Waves', 'Journey by Moonlight', 'Gummo']);
  await expect(page.locator('#toast')).toHaveText('Gummo is on your shelf now. Save to keep it.');
});

test('a name that isn’t the caption is kept as the shelf’s own name', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await page.locator('#stylePanel summary').click();
  await page.getByRole('textbox', { name: 'Caption' }).fill('watch these');
  await page.getByRole('textbox', { name: 'Name' }).fill('my films');
  const named = page.waitForRequest(r => r.method() === 'PATCH' && r.url().includes('/rest/v1/shelves'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await named).postDataJSON()).toEqual({ name: 'my films' });
});

test('?open=<id>, an old link, opens that shelf of yours, with its name, who can view it, and its spines', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  const older = SHELVES.filter(s => s.owner === ME.id)[1];   // from before there was one shelf each
  await open(page, '/build/?open=' + older.id);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf');
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(older.caption);
  await expect(page.getByRole('radio', { name: 'Public' })).toBeChecked();
  expect(await titles(page)).toEqual(['The Waves', 'Journey by Moonlight']);
  await expect(page.getByRole('button', { name: /new shelf/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('your own profile: Edit under your shelf opens it in the builder', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  const mine = SHELVES.find(s => s.owner === ME.id);
  await open(page, '/u/?tester');
  await expect(page.locator('#builder, iframe')).toHaveCount(0);   // no builder laid over the profile any more
  await expect(page.getByRole('link', { name: /new shelf/i })).toHaveCount(0);
  await page.locator('#hero').getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf');
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(mine.name);
  expect(await titles(page)).toEqual(['The Waves', 'Journey by Moonlight']);
  expect(errors).toEqual([]);
});

test('your own profile with no shelf yet: "Your shelf is empty." and Make your shelf, which goes to the builder', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await open(page, '/u/?tester');
  await expect(page.locator('#hero')).toContainText('Your shelf is empty.');
  await expect(page.locator('#nSpines')).toHaveText('0');
  await page.locator('#hero').getByRole('link', { name: 'Make your shelf' }).click();
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(page.locator('#books .empty')).toContainText('Your shelf is empty.');
});

test('old ?embed links come to the builder itself, at the root and at /build/', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const mine = SHELVES.find(s => s.owner === ME.id);
  await page.goto('/build/?embed&open=' + mine.id);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf');
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(page.locator('header.top')).toBeVisible();
  await page.goto('/?embed&new');
  await expect(page).toHaveURL(/\/build\/$/);
  await expect.poll(() => titles(page)).toEqual(['The Waves', 'Journey by Moonlight']);   // a new shelf, then; your shelf now
});

test('your shelf, being changed, is still being changed after another page; an old ?open link to another opens that one', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const older = SHELVES.filter(s => s.owner === ME.id)[1];
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await page.waitForFunction(() => !!sessionStorage.getItem('spinestack-draft'));
  await page.waitForTimeout(700);
  await open(page, '/build/?new');            // an old + new shelf link: it's your shelf, still being changed
  expect(await titles(page)).toEqual(['The Waves', 'Journey by Moonlight', 'Gummo']);
  await page.waitForFunction(() => !!sessionStorage.getItem('spinestack-draft'));
  await page.waitForTimeout(700);
  await open(page, '/build/?open=' + older.id);   // another saved shelf was asked for: it opens, not the draft
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(older.caption);
  expect(await titles(page)).toEqual(['The Waves', 'Journey by Moonlight']);
});

test('the shelf being made is still there after leaving the page and coming back', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await page.getByRole('textbox', { name: 'Name' }).fill('my films');
  await page.waitForFunction(() => !!sessionStorage.getItem('spinestack-draft'));
  await page.waitForTimeout(700);   // the draft is kept shortly after the last change
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  const d = dialog(page);
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('waves');
  await d.getByRole('option', { name: /The Waves/ }).click();
  await expect(spines(d)).toHaveCount(2);
  await d.getByRole('button', { name: 'Add to shelf' }).click();
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(rows(page)).toHaveCount(2);
  expect(await titles(page)).toEqual(['Gummo', 'The Waves']);   // + ADD added to the shelf being made
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('my films');
});

test('Cancel asks first, then drops the shelf being made', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await page.waitForFunction(() => !!sessionStorage.getItem('spinestack-draft'));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Discard changes?' }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);   // signed out: home
  await open(page, '/build/');
  await expect(page.locator('#books .empty')).toBeVisible();   // an empty shelf again
});

test('upload a scan: the link and the ▾ menu both open the file picker, and the picture goes on the shelf', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await open(page, '/build/');
  // "Upload a scan…" in the ▾ next to + ADD
  await page.locator('#addMore').click();
  const fromMenu = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Upload a scan…' }).click();
  await fromMenu;
  await expect(page).toHaveURL(/\/build\/$/);
  // "or upload a scan" under Add
  const fromLink = page.waitForEvent('filechooser');
  await page.locator('#upload').click();
  const chooser = await fromLink;
  const png = await page.evaluate(async () => {   // a plain 300 x 400 picture: not a wrap, so it becomes a made spine
    const c = document.createElement('canvas'); c.width = 300; c.height = 400;
    const x = c.getContext('2d'); x.fillStyle = '#24456B'; x.fillRect(0, 0, 300, 400); x.fillStyle = '#F3E9D2'; x.fillRect(40, 60, 220, 90);
    return c.toDataURL('image/png').split(',')[1];
  });
  await chooser.setFiles({ name: 'download.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(rows(page)).toHaveCount(1);   // the upload is on the shelf
  // it has no title yet, so its row is open with the title box ready
  await expect(rows(page).first().getByRole('textbox', { name: 'Title' })).toBeFocused();
  await page.keyboard.type('Kids');
  expect(await titles(page)).toEqual(['Kids']);
  expect(errors).toEqual([]);
});

test('the order: Add, the spines, Style; then Name and Who can view right above Cancel · Save', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/build/');
  const top = async sel => (await page.locator(sel).boundingBox()).y, bottom = async sel => { const b = await page.locator(sel).boundingBox(); return b.y + b.height; };
  expect(await top('#search')).toBeLessThan(await top('#shelf'));
  expect(await bottom('#shelf')).toBeLessThanOrEqual(await top('#stylePanel'));
  // the name and who can view it come after everything else in the page, with the bar right after them
  const order = await page.evaluate(() => ['#stylePanel', '#shelfName', 'input[name=vis]', '#cancelBtn', '#saveShelf'].map(s => document.querySelector(s))
    .map((el, i, all) => i === 0 || (all[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) > 0));
  expect(order).toEqual([true, true, true, true, true]);
  // they're in the bottom area, which stays in view: side by side, the buttons beside them (under them on a phone)
  await expect(page.locator('.mkbar #shelfName')).toBeInViewport();
  await expect(page.locator('.mkbar fieldset.who')).toBeInViewport();
  const name = await page.locator('#shelfName').boundingBox(), who = await page.locator('fieldset.who').boundingBox(), save = await page.locator('#saveShelf').boundingBox();
  expect(Math.abs((name.y + name.height) - (who.y + who.height))).toBeLessThanOrEqual(2);
  expect(who.x).toBeGreaterThan(name.x + name.width);
  if (isPhone()) expect(save.y).toBeGreaterThanOrEqual(name.y + name.height); else expect(save.x).toBeGreaterThan(who.x + who.width);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  // the preview: beside the form on a wide window; on a phone, after the spines and before Style
  const preview = await page.locator('.phone').boundingBox();
  if (isPhone()) {
    expect(preview.y).toBeGreaterThanOrEqual(await bottom('#shelf'));
    expect(preview.y + preview.height).toBeLessThanOrEqual(await top('#stylePanel'));
  } else expect(preview.x).toBeGreaterThan((await page.locator('#shelf').boundingBox()).x + 300);
});

/* ---------- dragging a spine on the preview ---------- */
// a point on the preview, as fractions of its width and height (the sample shelf's four spines stand across the
// middle: the first at about a quarter of the way across, the last at about three quarters)
const onPreview = async (page, fx, fy) => { const b = await page.locator('#story').boundingBox(); return { x: b.x + b.width * fx, y: b.y + b.height * fy }; };

test('dragging a spine on the preview with a mouse moves it, and the list follows', async ({ page }) => {
  test.skip(isPhone(), 'a mouse');
  const errors = watchErrors(page);
  await mockNetwork(page);
  await open(page, '/build/?sample');
  const before = await titles(page);
  const from = await onPreview(page, .26, .6), to = await onPreview(page, .9, .6);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y, { steps: 3 });
  await expect(page.locator('#spineBox')).toBeVisible();   // the spine being dragged is outlined
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('#spineBox')).toBeHidden();
  expect(await titles(page)).toEqual([before[1], before[2], before[3], before[0]]);   // the first spine is now the last
  // and back one place, from the right end
  const end = await onPreview(page, .74, .6), mid = await onPreview(page, .5, .6);
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 15 });
  await page.mouse.up();
  const after = await titles(page);
  expect(after.indexOf(before[0])).toBeLessThan(3);
  expect(after.slice().sort()).toEqual(before.slice().sort());   // the same four, in another order
  expect(errors).toEqual([]);
});

test('with a finger: holding a spine and then dragging moves it; a quick swipe across the preview does not', async ({ page }) => {
  test.skip(!isPhone(), 'a finger');
  await mockNetwork(page);
  await open(page, '/build/?sample');
  await page.locator('#story').scrollIntoViewIfNeeded();
  const before = await titles(page), stage = page.locator('#stage');
  const touch = (type, pt) => stage.dispatchEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
  const from = await onPreview(page, .26, .6), to = await onPreview(page, .9, .6);
  // a swipe: down and straight away moving
  await page.locator('#story').dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: from.x, clientY: from.y, button: 0, buttons: 1 });
  await touch('pointermove', { x: from.x + 40, y: from.y });
  await touch('pointermove', to);
  await touch('pointerup', to);
  expect(await titles(page)).toEqual(before);
  // held first, then dragged
  await page.locator('#story').dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: from.x, clientY: from.y, button: 0, buttons: 1 });
  await page.waitForTimeout(350);
  await expect(page.locator('#spineBox')).toBeVisible();
  await touch('pointermove', { x: (from.x + to.x) / 2, y: from.y });
  await touch('pointermove', to);
  await touch('pointerup', to);
  expect(await titles(page)).toEqual([before[1], before[2], before[3], before[0]]);
});

/* ---------- the caption on the preview ---------- */
// how much lettering is in the band where the caption goes (story pixels 80 to 700 across, 240 to 300 down):
// {dark: pixels of black ink, faint: pixels of the light grey "your shelf"}
const captionBand = (page, src) => page.evaluate(async src => {
  let c = document.querySelector('#story');
  if (src){ const im = new Image(); im.src = src; await im.decode(); c = document.createElement('canvas'); c.width = 1080; c.height = 1920; c.getContext('2d').drawImage(im, 0, 0, 1080, 1920); }
  const d = c.getContext('2d').getImageData(80, 240, 620, 60).data; let dark = 0, faint = 0;
  for (let i = 0; i < d.length; i += 4){ const v = (d[i] + d[i + 1] + d[i + 2]) / 3; if (v < 90) dark++; else if (v < 235) faint++; }
  return { dark, faint };
}, src);

test('the caption on the preview follows the Name; with no name it is a faint "your shelf" that is not in the picture saved with the shelf', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await page.waitForTimeout(300);
  // no name: no caption, only the hint, lightly
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('');
  const hint = await captionBand(page);
  expect(hint.dark).toBe(0);
  expect(hint.faint).toBeGreaterThan(200);
  // a name: it's the caption, in ink, and Style's Caption box has it too
  await page.getByRole('textbox', { name: 'Name' }).fill('2am films');
  await expect.poll(async () => (await captionBand(page)).dark).toBeGreaterThan(500);
  await page.locator('#stylePanel summary').click();
  await expect(page.getByRole('textbox', { name: 'Caption' })).toHaveValue('2am films');
  // the name cleared: back to the hint
  await page.getByRole('textbox', { name: 'Name' }).fill('');
  await expect.poll(async () => (await captionBand(page)).dark).toBe(0);
  await expect(page.getByRole('textbox', { name: 'Caption' })).toHaveValue('');
  // saved like that, the shelf's picture has nothing where the hint was
  const sent = page.waitForRequest(r => r.method() === 'POST' && r.url().includes('/u/preview?shelf='));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const req = await sent, picture = `data:${req.headers()['content-type']};base64,${req.postDataBuffer().toString('base64')}`;
  await page.waitForURL(/\/u\/\?tester&shelf=/);
  const saved = await page.evaluate(async src => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 1080, 1920);
    const d = x.getImageData(80, 240, 620, 60).data; let marks = 0;
    for (let i = 0; i < d.length; i += 4) if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 235) marks++;
    return marks;
  }, picture);
  expect(saved).toBe(0);
  expect(errors).toEqual([]);
});

test('a shelf saved with no name has no caption', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await open(page, '/build/');
  await page.locator('header.top .add').click();
  await addGummo(page);
  const saved = page.waitForRequest(r => r.url().includes('/rpc/save_shelf'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).postDataJSON().shelf.caption).toBe('');
});

/* ---------- a new shelf starts empty ---------- */
test('the builder starts empty: "Your shelf is empty." and three titles to try, each a search in the Add dialog', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page);
  await open(page, '/build/');
  await expect(rows(page)).toHaveCount(0);
  const empty = page.locator('#books .empty');
  await expect(empty.locator('p').first()).toHaveText('Your shelf is empty.');
  await expect(empty.locator('.try')).toHaveText(/^Try:/);
  const chips = empty.getByRole('button');
  await expect(chips).toHaveText(['Gummo', 'The Waves', 'Kids']);
  await expect(page.locator('#sampleNote')).toBeHidden();
  await expect(page.locator('#count')).toHaveText('(0 of 20)');
  await expect(page.getByRole('button', { name: 'Clear' })).toBeHidden();
  // a chip runs that search in the dialog
  await chips.nth(1).click();
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(d.getByRole('combobox', { name: 'Film or book name' })).toHaveValue('The Waves');
  await expect(d.getByRole('option', { name: /The Waves/ })).toBeVisible();
  expect(net.asked).toContain('The Waves');
  await d.getByRole('option', { name: /The Waves/ }).click();
  await d.getByRole('button', { name: 'Add to shelf' }).click();
  expect(await titles(page)).toEqual(['The Waves']);
  await expect(empty).toHaveCount(0);
  // taken off again: the chips are back
  await rows(page).first().locator('.bopen').click();
  await rows(page).first().getByRole('button', { name: /^Remove/ }).click();
  await expect(chips).toHaveCount(3);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('the sample shelf is only at ?sample, for the tests and the picture of a shelf', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/build/?sample');
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('#sampleNote')).toBeVisible();
});

