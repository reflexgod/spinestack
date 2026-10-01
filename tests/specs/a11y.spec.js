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
  await open(page, '/build/');
  await page.locator('#books .bopen').first().click();
  await page.locator('#stylePanel summary').click();
  await expect(page.locator('#layout')).toBeVisible();
  await clean(page);
});

// the Add to your shelf… dialog, at each step
for (const step of ['the search results', 'the spine choices']) {
  test(`axe: the Add to your shelf… dialog, ${step}`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, '/');
    await page.locator('header.top .add').click();
    const d = page.getByRole('dialog', { name: /add to your shelf/i });
    await d.getByRole('textbox', { name: 'Film or book name' }).fill('gummo');
    await page.keyboard.press('Enter');
    await expect(d.locator('#addRows tr')).toHaveCount(2);
    if (step === 'the spine choices') {
      await d.locator('#addRows tr').first().click();
      await expect(d.getByRole('button', { name: 'Add to shelf' })).toBeEnabled();
    }
    await clean(page);
  });
}
