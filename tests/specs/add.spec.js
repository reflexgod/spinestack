// The Add to your shelf… dialog's search: suggestions as you type, the keyboard, the order of the results, the
// loading and nothing-found lines; what it says when the day's spine searches are used up; and the builder's
// smaller touches (the count and its limit, the empty shelf, the note under the preview).
const { test, expect } = require('@playwright/test');
const { PAGES, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const dialog = page => page.getByRole('dialog', { name: /add to your shelf/i });
const box = d => d.getByRole('combobox', { name: 'Film or book name' });
const options = d => d.getByRole('option');
const names = d => d.locator('#addRows .t').evaluateAll(els => els.map(e => e.firstChild.textContent.trim()));
async function openDialog(page, opt, path = '/') {
  const net = await mockNetwork(page, opt);
  await open(page, path);
  await page.locator('header.top .add').click();
  await expect(dialog(page)).toBeVisible();
  return net;
}

/* ---------- 1. the search ---------- */
test('suggestions come while typing, with one search for a word typed quickly', async ({ page }) => {
  const errors = watchErrors(page), net = await openDialog(page, { signedIn: true }), d = dialog(page);
  await box(d).pressSequentially('gummo', { delay: 30 });   // faster than the 300 ms wait
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
  // the same title (a book and a film), then one starting with it, then ones containing it
  expect(await names(d)).toEqual(['Kids', 'Kids', 'Kids in America', 'Spy Kids', 'Just Kids', 'The Kids Are All Right']);
  await expect(options(d).first()).toContainText('Book');
  await expect(options(d).nth(1)).toContainText('Film');
  await d.getByRole('radio', { name: 'Films' }).check();
  await expect(options(d)).toHaveCount(5);
  expect(await names(d)).toEqual(['Kids', 'Kids in America', 'Spy Kids', 'The Kids Are All Right', 'Honey, I Shrunk the Kids']);
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
  await page.keyboard.press('Enter');   // before the 300 ms are up
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

for (const pg of [...PAGES, { name: 'privacy', path: '/privacy.html' }]) {
  test(`${pg.name}: the footer credits Brave`, async ({ page }) => {
    await mockNetwork(page);
    await open(page, pg.path);
    const credit = page.getByRole('link', { name: 'Search by Brave' });
    await expect(credit).toBeVisible();
    await expect(credit).toHaveAttribute('href', 'https://search.brave.com/');
  });
}

/* ---------- 4. the builder's smaller touches ---------- */
test('the preview is not hidden by the Save bar', async ({ page }) => {
  test.skip(isPhone(), 'on a phone the preview is in the page, not beside it');
  await mockNetwork(page);
  await open(page, '/build/');
  const stage = await page.locator('#stage').boundingBox(), bar = await page.locator('.mkbar').boundingBox();
  expect(stage.height).toBeGreaterThan(200);
  expect(stage.y + stage.height).toBeLessThanOrEqual(bar.y);
});

test('the Name box suggests a name, the count shows the limit, and an empty shelf says so', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/build/');
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'e.g. 2am films');
  await expect(page.locator('#books .empty')).toContainText('Your shelf is empty.');
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
  await mockNetwork(page);
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
