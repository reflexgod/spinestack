// make/: a shelf with no account, in a fresh browser at 1280px and 390px. Search, add up to 12, pick a style,
// download or share the picture; the shelf stays on this device; only Save to a profile asks to sign in, and it
// moves the shelf into the new account; a profile is offered, as optional, once the picture is made.
const { test, expect } = require('@playwright/test');
const { SB_URL, mockNetwork, watchErrors, open, putAside } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const dialog = page => page.getByRole('dialog', { name: /^add to (your|the) shelf$/i });
const titles = page => page.locator('#books .book .bt').allTextContents();
const KEY = 'shelfstackd-make';

async function addTitle(page, typed, option) {
  await page.getByRole('textbox', { name: 'Add' }).fill(typed);
  const d = dialog(page);
  await d.getByRole('option', { name: option }).first().click();
  await expect(d.getByRole('radiogroup', { name: 'Which spine' }).getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');
  await d.getByRole('button', { name: 'Add to shelf' }).click();
  await expect(d).toBeHidden();
}
// a shelf of n plain spines already kept on this device, as the page keeps it
const seed = (page, n) => page.addInitScript(([key, n]) => {
  if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
  const items = Array.from({ length: n }, (_, i) => ({ item_id: 'b' + i, kind: 'book', title: 'Kept book ' + (i + 1), author: 'Someone', year: '1990', spine_src: null, cover_src: null,
    look: { style: 'solid', font: 'oswald', bg: '#1C1B21', fg: '#E8D23C', accent: '#E8D23C', wf: 1, hf: 1, jit: 0, at: 1 } }));
  localStorage.setItem(key, JSON.stringify({ at: Date.now(), settings: { caption: 'kept', theme: 'paper', layout: 'row', varied: true, filter: 'clean', intensity: 70 }, name: 'kept', isPublic: true, items }));
}, [KEY, n]);

test('a fresh browser: no sign-in anywhere, search, add, a style, download; the shelf is still there after a reload', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page);
  let supabase = 0; page.on('request', r => { if (r.url().startsWith(SB_URL)) supabase++; });
  await open(page, '/make/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make a shelf');
  for (const hidden of ['#sheet', '#gate', '#cancelBtn']) await expect(page.locator(hidden)).toBeHidden();
  await expect(page.getByText(/sign in to|continue with google/i).filter({ visible: true })).toHaveCount(0);   // nothing on the page asks for an account
  // + ADD opens the dialog here, on Put on shelf alone (no Log it or Up next: those need an account)
  await page.locator('header.top .add').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('radiogroup', { name: 'What to do with it' })).toBeHidden();
  await page.keyboard.press('Escape');
  await addTitle(page, 'gummo', /Gummo/);
  await addTitle(page, 'waves', /The Waves/);
  expect(await titles(page)).toEqual(['Gummo', 'The Waves']);
  // a style
  await page.locator('#stylePanel summary').click();
  await page.locator('#stylePanel').getByRole('button', { name: 'Stacked' }).click();
  await page.locator('#stylePanel').getByRole('button', { name: 'Ink' }).click();
  await expect(page.locator('#styleLine')).toHaveText('Stacked · Clean · Ink');
  await expect(page.locator('#theme button[data-v="wall"]')).toBeHidden();   // your own picture needs an upload, so not here
  await page.getByRole('textbox', { name: 'Name' }).fill('films for the train');
  // download: the picture, 1080 x 1920
  await expect(page.locator('#afterNote')).toBeHidden();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
  expect(file.suggestedFilename()).toBe('films-for-the-train.png');
  const png = require('fs').readFileSync(await file.path());
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
  // then, and only then, a profile, as something optional
  await expect(page.locator('#afterNote')).toBeVisible();
  await expect(page.locator('#afterNote')).toContainText('Make a profile to follow friends and log what you watch and read.');
  // kept on this device
  await page.waitForTimeout(700);
  await page.reload(); await page.waitForLoadState('networkidle');
  await expect.poll(() => titles(page)).toEqual(['Gummo', 'The Waves']);
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('films for the train');
  await expect(page.locator('#styleLine')).toHaveText('Stacked · Clean · Ink');
  await expect(page.locator('#afterNote')).toBeVisible();
  expect(supabase, 'the account library and database are never asked').toBe(0);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

test('12 spines at most', async ({ page }) => {
  await mockNetwork(page);
  await seed(page, 11);
  await open(page, '/make/');
  await expect(page.locator('#books .book')).toHaveCount(11);
  await expect(page.locator('#count')).toHaveText('(11 of 12)');
  await addTitle(page, 'gummo', /Gummo/);
  await expect(page.locator('#count')).toHaveText('(12 of 12)');
  await expect(page.getByRole('textbox', { name: 'Add' })).toBeDisabled();
  await expect(page.locator('#findNote')).toHaveText('A shelf holds 12 spines. Remove one to add another.');
});

test('Share, on a phone that can share pictures: the sheet, then the phone\'s share sheet with the PNG', async ({ page }) => {
  test.skip(!isPhone(), 'phones share; a computer downloads');
  await page.addInitScript(() => {
    window.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__shared.push(d.files.map(f => `${f.name} ${f.type}`)); } });
  });
  await mockNetwork(page);
  await seed(page, 3);
  await open(page, '/make/');
  await expect(page.locator('#books .book')).toHaveCount(3);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const sheet = page.locator('#storySheet');
  await expect(sheet).toBeVisible({ timeout: 15000 });   // the picture waits for the paper textures
  await sheet.getByRole('button', { name: 'Share', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([['kept.png image/png']]);
  await expect(page.locator('#afterNote')).toBeVisible();
});

test('Save to a profile: the only sign-in, and the shelf moves into the new account', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, signup: true, ownShelf: false });
  const signBack = await putAside(page);
  await seed(page, 2);
  await open(page, '/make/');
  await page.getByRole('button', { name: 'Save to a profile' }).click();
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#signinPane h2')).toHaveText('Save to a profile');
  // Google, then back here (signed in now)
  await page.route(u => u.pathname === '/auth/v1/authorize', r => r.fulfill({ status: 302, headers: { Location: new URL('/make/', page.url()).href } }));
  await signBack();
  await page.locator('#googleBtn').click();
  await expect(page.locator('#uname')).toBeVisible();
  await page.locator('#uname').fill('tester');
  await expect(page.locator('#unameNote')).toHaveText('@tester is free.');
  await page.locator('#adult').check();
  const saved = page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/rpc/save_shelf');
  await page.locator('#nameBtn').click();
  const body = (await saved).postDataJSON();
  expect(body.items.map(i => i.title)).toEqual(['Kept book 1', 'Kept book 2']);
  await expect(page).toHaveURL(/\/u\/\?tester&shelf=/);
  expect(await page.evaluate(k => localStorage.getItem(k), KEY), 'moved: no longer kept on this device').toBeNull();
  expect(errors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
});

test('signed out elsewhere: + ADD and Make a shelf go to make/, not to a sign-in', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await expect(page).toHaveURL(/\/make\/$/);
  await open(page, '/');
  await expect(page.locator('#start')).toHaveAttribute('href', 'make/');
  await open(page, '/shelves/');
  await expect(page.locator('main').getByRole('link', { name: 'Make a shelf' })).toHaveAttribute('href', '../make/');
});
