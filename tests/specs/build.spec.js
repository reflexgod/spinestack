// + SHELF (the Add to your shelf… dialog) and the builder: New shelf / Edit shelf, the spines as a list, Style, the
// preview, and Cancel · Save · Save story.
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
  test(`${pg.name}: + SHELF opens the dialog with only a search box, and Esc closes it`, async ({ page }) => {
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
  await expect(rows(page)).toHaveCount(4);   // the sample shelf
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
  expect(await titles(page)).toEqual(['Gummo']);   // the sample cleared, and the film is on
  expect(await page.evaluate(() => window.__same)).toBe(true);
  await expect(page).toHaveURL(/\/build\/$/);
  expect(errors).toEqual([]);
});

test('from another page: Add to shelf goes to the builder with the spine on the shelf', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await addGummo(page);
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(rows(page)).toHaveCount(1);
  expect(await titles(page)).toEqual(['Gummo']);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New shelf');
  expect(errors).toEqual([]);
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
test('the builder is a new-shelf page: name, who can view, Add, the list, Style shut, the bar', async ({ page }) => {
  const net = await mockNetwork(page, { signedIn: true }), errors = watchErrors(page);
  await open(page, '/build/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New shelf');
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
  // the bar: Cancel, Save, Save story, in that order
  expect(await page.locator('.mkbar > button:visible').allTextContents()).toEqual(['Cancel', 'Save', 'Save story']);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

test('a spine’s Spine, Text and ✕ show only when its row is pressed, one row at a time', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/build/');
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
  await open(page, '/build/');
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

test('Save, signed in: the name and Private are saved, then the shelf’s own page opens', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
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
  expect(errors).toEqual([]);
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

test('?open=<id> is Edit shelf, with the shelf’s name, who can view it, and its spines', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  const mine = SHELVES.find(s => s.owner === ME.id);
  await open(page, '/build/?open=' + mine.id);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit shelf');
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(mine.name);
  await expect(page.getByRole('radio', { name: 'Public' })).toBeChecked();
  expect(await titles(page)).toEqual(['The Waves', 'Journey by Moonlight']);
  await expect(page.getByRole('button', { name: 'Save as a new shelf' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('?embed (the builder over a profile): no bar, no title, no Cancel, and an empty shelf', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await page.setContent('<iframe id="f" style="width:100%;height:700px;border:0"></iframe>');
  await page.goto('/u/?tester');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-act="new"]').first().click();
  const frame = page.frameLocator('#bFrame');
  await expect(frame.locator('#books .empty')).toBeVisible();
  await expect(frame.locator('header.top')).toBeHidden();
  await expect(frame.locator('#pageTitle')).toBeHidden();
  await expect(frame.locator('#cancelBtn')).toBeHidden();
  await expect(frame.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(frame.getByRole('textbox', { name: 'Add' })).toBeVisible();
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
  expect(await titles(page)).toEqual(['Gummo', 'The Waves']);   // + SHELF added to the shelf being made
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
  await expect(rows(page)).toHaveCount(4);   // the sample shelf again
});

test('upload a scan: the link and the ▾ menu both open the file picker, and the picture goes on the shelf', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/build/');
  // "Upload a scan…" in the ▾ next to + SHELF
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
  await expect(rows(page)).toHaveCount(1);   // the sample cleared, and the upload is on
  // it has no title yet, so its row is open with the title box ready
  await expect(rows(page).first().getByRole('textbox', { name: 'Title' })).toBeFocused();
  await page.keyboard.type('Kids');
  expect(await titles(page)).toEqual(['Kids']);
  expect(errors).toEqual([]);
});
