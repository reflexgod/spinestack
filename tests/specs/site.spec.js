// Every page with the top bar, signed out and signed in: the bar is there, the page doesn't scroll sideways, nothing
// is logged as an error, and nothing asks the network for something the tests don't know about.
const { test, expect } = require('@playwright/test');
const { PAGES, mockNetwork, watchErrors, open } = require('../site');

const pathOf = link => link.evaluate(a => new URL(a.href).pathname);

for (const signedIn of [false, true]) {
  test.describe(signedIn ? 'signed in' : 'signed out', () => {
    for (const pg of [...PAGES, ...(signedIn ? [{ name: 'own profile', path: '/u/?tester' }] : [])]) {
      test(`${pg.name}: top bar, no sideways scroll, no errors`, async ({ page }) => {
        const net = await mockNetwork(page, { signedIn }), errors = watchErrors(page);
        await open(page, pg.path);

        const bar = page.locator('header.top');
        await expect(bar).toBeVisible();
        const logo = bar.getByRole('link', { name: 'shelfstackd, home' });
        await expect(logo).toBeVisible();
        expect(await pathOf(logo)).toBe('/');
        for (const [name, to] of [['Shelves', '/shelves/'], ['Members', '/members/'], ['Feed', '/feed/']]) {
          const link = bar.locator('.links a', { hasText: name });
          await expect(link).toBeVisible();
          expect(await pathOf(link)).toBe(to);
        }
        await expect(bar.locator('.add')).toBeVisible();
        await expect(bar.locator('#acctBtn')).toHaveText(signedIn ? '@tester' : /sign in/i);

        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(sideways, 'the page is wider than the window').toBeLessThanOrEqual(0);
        expect(errors, 'console errors').toEqual([]);
        expect(net.unknown, 'requests the tests have no answer for').toEqual([]);
      });
    }
  });
}

test('signed-out home: the welcome, the newest shelves, and Get started opens sign-in', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('#heroRow li')).toHaveCount(6);
  await expect(page.locator('#outGrid li')).toHaveCount(12);
  await expect(page.locator('#stackers li')).toHaveCount(3);
  await page.locator('#start').click();
  await expect(page.locator('#signSheet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#signSheet')).toBeHidden();
});

test('signed-in home: a welcome by name and the two shelf sections', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome back, @tester.');
  await expect(page.locator('#folRow li')).toHaveCount(6);
  await expect(page.locator('#inGrid li')).toHaveCount(12);
});

test('old builder links at the root go on to /build/', async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/?open=aaaaaaaa-aaaa-4aaa-8aaa-000000000000#shelf');
  await expect(page).toHaveURL(/\/build\/(\?open=aaaaaaaa-aaaa-4aaa-8aaa-000000000000)?#shelf$/);
  await page.goto('/#how');
  await expect(page).toHaveURL(/\/build\/#how$/);
});

/* ---------- waiting for their stage ---------- */

// Stage 1 (nav and account menu) builds this menu; the check is switched on then.
test.fixme('account menu: Sign out is the last item', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/');
  await page.getByRole('button', { name: /@tester/ }).click();
  const items = page.getByRole('menu').getByRole('menuitem');
  await expect(items.last()).toHaveText('Sign out');
});

// Stage 2 (+ SHELF popup) builds this dialog; the check is switched on then.
test.fixme('+ SHELF opens a dialog, and Esc closes it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/');
  await page.locator('header.top .add').click();
  const dialog = page.getByRole('dialog', { name: /add to your shelf/i });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
