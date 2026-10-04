// Recs (migration 0010, mockNetwork's recs): Recommend on a title opens a sheet: who to (the people you both follow,
// one with 6 waiting can't be picked), a note of 140, Show in feed (on), Send; and Share to WhatsApp for anyone. It's
// on a post's share menu and a fourth choice in + ADD. Without 0010 there's no Recommend anywhere.
const { test, expect } = require('@playwright/test');
const { SB_URL, CORS, MUTUALS, SHELVES, FROM_FRIENDS, WATCHLIST, ME, mockNetwork, watchErrors, open } = require('../site');

const post = (page, text) => page.locator('#items .post').filter({ hasText: text }).first();
const sheet = page => page.locator('.recsheet');
const dialog = page => page.locator('#addDialog');
const sent = (page, table) => page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/' + table);
// window.open, kept instead of opened: where a link would have gone
const keepOpens = page => page.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(String(u)); return null; }; });

test('without 0010: no Recommend on a post or in + ADD; a post still has Share to WhatsApp', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo');
  await p.getByRole('button', { name: /^Share/ }).click();
  await expect(p.getByRole('menuitem')).toHaveText(['Copy link', 'Share to WhatsApp', 'Add to Up next']);
  await page.keyboard.press('Escape');
  await page.locator('header.top .add').click();
  await expect(dialog(page).getByRole('radiogroup', { name: 'What to do with it' }).getByRole('radio')).toHaveCount(3);
  await expect(dialog(page).getByRole('radio', { name: 'Recommend' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a post\'s share menu: Recommend opens the sheet; pick someone you both follow, a note, Send', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true, recs: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo');
  await p.getByRole('button', { name: /^Share/ }).click();
  await expect(p.getByRole('menuitem')).toHaveText(['Copy link', 'Share to WhatsApp', 'Recommend', 'Add to Up next']);
  await p.getByRole('menuitem', { name: 'Recommend' }).click();
  const s = sheet(page);
  await expect(s).toBeVisible();
  await expect(s).toHaveAccessibleName('Recommend Gummo (1997)');
  // who to: the people you both follow; one with 6 waiting can't be picked
  const to = s.getByRole('group', { name: 'To' }).getByRole('radio');
  await expect(to).toHaveCount(MUTUALS.length);
  await expect(s.getByRole('radio', { name: /@mira/ })).toBeEnabled();
  await expect(s.getByRole('radio', { name: /@longusername_twenty1/ })).toBeDisabled();
  await expect(s.locator('.rfull')).toHaveText('6 waiting');
  const send = s.getByRole('button', { name: 'Send' });
  await expect(send).toBeDisabled();   // until someone is picked
  await expect(s.getByRole('checkbox', { name: 'Show in feed' })).toBeChecked();
  const note = s.getByRole('textbox', { name: /Note/ });
  await expect(note).toHaveAttribute('maxlength', '140');
  await note.fill('The bathtub scene.');
  await expect(s.locator('.rcount')).toHaveText('18 / 140');
  await s.getByRole('radio', { name: /@mira/ }).check();
  await expect(send).toBeEnabled();
  const req = sent(page, 'recs');
  await send.click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg',
    receiver: MUTUALS[0].id, note: 'The bathtub scene.', in_feed: true });
  await expect(s).toHaveCount(0);
  await expect(page.locator('#toast')).toHaveText('Sent to @mira.');
  expect(errors).toEqual([]);
});

test('the sheet says what the database says: already sent, or not following back; Esc and Cancel shut it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, recs: true });
  let answer = { status: 409, body: { code: '23505', message: 'duplicate key' } };
  await page.route(u => u.origin === SB_URL && u.pathname === '/rest/v1/recs', route => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: answer.status, headers: CORS, contentType: 'application/json', body: JSON.stringify(answer.body) }));
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo');
  await p.getByRole('button', { name: /^Share/ }).click();
  await p.getByRole('menuitem', { name: 'Recommend' }).click();
  const s = sheet(page);
  await s.getByRole('radio', { name: /@mira/ }).check();
  await s.getByRole('button', { name: 'Send' }).click();
  await expect(s.locator('.rsay')).toHaveText('You’ve recommended it to @mira already.');
  answer = { status: 400, body: { code: 'P0001', message: '@mira has 6 recs waiting. Try again once they’ve looked at some.' } };
  await s.getByRole('button', { name: 'Send' }).click();
  await expect(s.locator('.rsay')).toHaveText('@mira has 6 recs waiting. Try again once they’ve looked at some.');
  await page.keyboard.press('Escape');
  await expect(s).toHaveCount(0);
  await expect(p.getByRole('button', { name: /^Share/ })).toBeFocused();   // back where it was
  await p.getByRole('button', { name: /^Share/ }).click();
  await p.getByRole('menuitem', { name: 'Recommend' }).click();
  await sheet(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet(page)).toHaveCount(0);
});

test('Share to WhatsApp: a post\'s, and the sheet\'s, open WhatsApp with the words and the address', async ({ page }) => {
  await keepOpens(page);
  await mockNetwork(page, { signedIn: true, social: true, recs: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo');
  await p.getByRole('button', { name: /^Share/ }).click();
  await p.getByRole('menuitem', { name: 'Share to WhatsApp' }).click();
  const [u] = await page.evaluate(() => window.__opened);
  expect(u).toMatch(/^https:\/\/wa\.me\/\?text=/);
  const text = decodeURIComponent(u.split('?text=')[1]);
  expect(text).toMatch(/^@mira watched Gummo \(1997\) on shelfstackd: http:\/\/\S+\/p\/\?bbbbbbbb-bbbb-4bbb-8bbb-000000000000$/);
  // the sheet's is a link, for anyone, even with nobody to send it to
  await p.getByRole('button', { name: /^Share/ }).click();
  await p.getByRole('menuitem', { name: 'Recommend' }).click();
  const wa = sheet(page).getByRole('link', { name: 'Share to WhatsApp' });
  await expect(wa).toHaveAttribute('target', '_blank');
  expect(decodeURIComponent((await wa.getAttribute('href')).split('?text=')[1])).toMatch(/^Gummo \(1997\): a film I think you’d like\. http/);
});

test('+ ADD: Recommend is a fourth choice; the title picked goes to the sheet', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true, recs: true });
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  const d = dialog(page);
  await expect(d.getByRole('radiogroup', { name: 'What to do with it' }).getByRole('radio')).toHaveCount(4);
  await d.getByRole('radio', { name: 'Recommend' }).check();
  await expect(d).toHaveAccessibleName('Recommend a film or a book');
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  await expect(d).toBeHidden();
  await expect(sheet(page)).toHaveAccessibleName('Recommend Gummo (1997)');
  expect(errors).toEqual([]);
});

test('signed out, Recommend isn\'t offered on a post', async ({ page }) => {
  await mockNetwork(page, { social: true, recs: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo');
  await p.getByRole('button', { name: /^Share/ }).click();
  await expect(p.getByRole('menuitem', { name: 'Recommend' })).toHaveCount(0);
});

// on the profile: a shelf's spines, your Up next and From friends each have Recommend, signed in and with 0010
test('Recommend on a shelf\'s spines, on your Up next and on From friends; none without 0010', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true, recs: true });
  await open(page, `/u/?mira&shelf=${SHELVES[1].id}`);
  const first = page.locator('#oneItems li').first();
  await expect(first.getByRole('button', { name: 'Recommend' })).toBeVisible();
  const title = await first.locator('.st b').evaluate(b => b.firstChild.textContent.trim());
  await first.getByRole('button', { name: 'Recommend' }).click();
  await expect(sheet(page).locator("h2")).toContainText(`Recommend ${title}`);
  await page.keyboard.press('Escape');
  // your own profile: From friends, then the Up next tab
  await open(page, '/u/?tester');
  const ff = page.locator('#friends li').filter({ hasText: FROM_FRIENDS[0].title });
  await ff.getByRole('button', { name: 'Recommend' }).click();
  await expect(sheet(page)).toHaveAccessibleName(new RegExp(`^Recommend ${FROM_FRIENDS[0].title}`));
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Up next' }).click();
  const mine = WATCHLIST.find(w => w.owner === ME.id);
  const tile = page.locator('#wGrid li').filter({ hasText: mine.title });
  await tile.getByRole('button', { name: 'Recommend' }).click();
  await expect(sheet(page)).toHaveAccessibleName(new RegExp(`^Recommend ${mine.title}`));
  expect(errors).toEqual([]);
});

test('without 0010, the profile has no Recommend', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/u/?tester');
  await expect(page.locator('#friends li').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recommend' })).toHaveCount(0);
  await open(page, `/u/?mira&shelf=${SHELVES[1].id}`);
  await expect(page.locator('#oneItems li').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recommend' })).toHaveCount(0);
});
