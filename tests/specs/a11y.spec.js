// axe on every page: nothing it rates serious or critical.
const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { PAGES, OTHER_PAGES, mockNetwork, open } = require('../site');

// what axe finds on the page as it is now, the serious and critical ones only
async function serious(page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.impact} ${v.id}: ${v.help}\n` + v.nodes.map(n => `    ${n.target.join(' ')}  ${n.failureSummary.replace(/\s+/g, ' ')}`).join('\n'));
}
const clean = async page => { const bad = await serious(page); expect(bad, bad.join('\n')).toEqual([]); };

const runs = [
  ...PAGES.map(p => ({ ...p, signedIn: false })),
  ...PAGES.map(p => ({ ...p, signedIn: true })),
  { name: 'own profile', path: '/u/?tester', signedIn: true },
  ...OTHER_PAGES.map(p => ({ ...p, signedIn: false })),
];

for (const run of runs) {
  test(`axe: ${run.name}, ${run.signedIn ? 'signed in' : 'signed out'}`, async ({ page }) => {
    await mockNetwork(page, { signedIn: run.signedIn });
    await open(page, run.path);
    await clean(page);
  });
}

for (const [name, button] of [['the account menu', '#acctBtn'], ['the ▾ menu', '#addMore']]) {
  test(`axe: home with ${name} open`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, '/');
    await page.locator(button).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await clean(page);
  });
}

// the builder with things open: a row's controls and Style
test('axe: the builder with a row and Style open', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/build/?sample');
  await page.locator('#books .bopen').first().click();
  await page.locator('#stylePanel summary').click();
  await expect(page.locator('#layout')).toBeVisible();
  await clean(page);
});

// the Add to your shelf dialog, at each step
for (const step of ['the search results', 'the spine choices']) {
  test(`axe: the Add to your shelf dialog, ${step}`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, '/');
    await page.locator('header.top .add').click();
    const d = page.getByRole('dialog', { name: /^add to (your|the) shelf$/i });
    await d.getByRole('combobox', { name: 'Film or book name' }).fill('kids');
    await expect(d.getByRole('option')).toHaveCount(6);
    if (step === 'the spine choices') {
      await d.getByRole('option').first().click();
      await expect(d.getByRole('button', { name: 'Add to shelf' })).toBeEnabled();
    }
    await clean(page);
  });
}

// Settings: each tab, and the Photo tab with a photo being cut
for (const tab of ['Photo', 'Account']) {
  test(`axe: settings, the ${tab} tab`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, '/settings/');
    await page.getByRole('tab', { name: tab }).click();
    if (tab === 'Photo') {
      await page.locator('#photoFile').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: require('../site').PICTURE });
      await expect(page.locator('#cropBox .cropper-container')).toBeVisible();
    }
    await clean(page);
  });
}

// a profile's other tabs
for (const [name, path] of [['Activity', '/u/?mira#activity'], ['Network', '/u/?mira#network'], ['your own Activity', '/u/?tester#activity']]) {
  test(`axe: a profile, ${name}`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, path);
    await clean(page);
  });
}

// members with people found
test('axe: members, with people found', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/members/?q=m');
  await expect(page.locator('#found .person')).toHaveCount(1);
  await clean(page);
});

// a shelf's own page, someone's and yours
for (const [name, at] of [['someone\'s', '/u/?mira&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000001'], ['your own', '/u/?tester&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000003']]) {
  test(`axe: a shelf's page, ${name}`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, at);
    await expect(page.locator('#oneItems li')).toHaveCount(2);
    await clean(page);
  });
}

test('axe: your profile, with your shelf, your watchlist and From friends', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester');
  await expect(page.locator('#friends li')).toHaveCount(2);
  await clean(page);
});

test('axe: + ADD on Log it, with a title picked', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  const d = page.getByRole('dialog');
  await d.getByRole('radio', { name: 'Log it' }).check();
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  await expect(d.getByRole('button', { name: 'Post' })).toBeVisible();
  await clean(page);
});

test('axe: + ADD on Watchlist, signed out', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Watchlist' }).check();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Sign in' })).toBeVisible();
  await clean(page);
});

test('axe: a shelf\'s page with Share open', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000001');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Share', exact: true })).toBeVisible();
  await clean(page);
});

