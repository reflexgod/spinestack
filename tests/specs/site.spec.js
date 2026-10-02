// Every page with the top bar, signed out and signed in: the bar is there, the page doesn't scroll sideways, nothing
// is logged as an error, and nothing asks the network for something the tests don't know about.
const { test, expect } = require('@playwright/test');
const { PAGES, mockNetwork, watchErrors, open } = require('../site');

const pathOf = link => link.evaluate(a => new URL(a.href).pathname);
const isPhone = () => test.info().project.name.startsWith('phone');
const MENU = ['Home', 'Profile', 'Shelf', 'Activity', 'Network', 'Settings', 'Sign out'];

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
        for (const [name, to] of [['Shelves', '/shelves/'], ['Members', '/members/'], ['Activity', '/feed/']]) {
          const link = bar.locator('.links').getByRole('link', { name, exact: true });
          await expect(link).toBeVisible();
          expect(await pathOf(link)).toBe(to);
        }
        await expect(bar.getByRole('link', { name: 'Add a film or a book' })).toBeVisible();
        if (!isPhone()) await expect(bar.locator('.add')).toHaveText('Add');   // + ADD (a phone shows just the +)
        const first = bar.locator('.links a').first();
        if (signedIn) {
          // logo · you ▾ · ⚡ · SHELVES · MEMBERS · search · + ADD ▾
          await expect(bar.locator('#acctBtn')).toBeVisible();
          await expect(bar.locator('#acctBtn')).toHaveAccessibleName('@tester, your account');
          if (isPhone()) await expect(bar.locator('#acctBtn .who')).toBeHidden(); else await expect(bar.locator('#acctBtn .who')).toHaveText('@tester');   // a phone shows just the photo
          await expect(bar.locator('#signInBtn')).toBeHidden();
          await expect(first).toHaveAttribute('aria-label', 'Activity');
          await expect(bar.getByRole('link', { name: 'Search' })).toBeVisible();
          await expect(bar.locator('#addMore')).toBeVisible();
        } else {
          // logo · SHELVES · MEMBERS · ⚡ · SIGN IN · + ADD
          await expect(bar.locator('#signInBtn')).toHaveText(/sign in/i);
          await expect(bar.locator('#acctBtn')).toBeHidden();
          await expect(first).toHaveText(/shelves/i);
          await expect(bar.getByRole('link', { name: 'Search' })).toBeHidden();
          await expect(bar.locator('#addMore')).toBeHidden();
        }
        await expect(page.getByText('Sign out', { exact: true }).locator('visible=true')).toHaveCount(0);   // only in the account menu

        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(sideways, 'the page is wider than the window').toBeLessThanOrEqual(0);
        expect(errors, 'console errors').toEqual([]);
        expect(net.unknown, 'requests the tests have no answer for').toEqual([]);
      });
    }
  });
}

/* ---------- the account menu and the ▾ next to + ADD ---------- */
test.describe('account menu', () => {
  for (const pg of PAGES) {
    test(`${pg.name}: its items, Sign out last; Esc and a click outside close it`, async ({ page }) => {
      const net = await mockNetwork(page, { signedIn: true }), errors = watchErrors(page);
      await open(page, pg.path);
      const btn = page.locator('#acctBtn'), menu = page.getByRole('menu', { name: 'Account' });
      await expect(menu).toBeHidden();
      await btn.click();
      await expect(menu).toBeVisible();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');
      const items = menu.getByRole('menuitem');
      await expect(items).toHaveText(MENU);
      await expect(items.last()).toHaveText('Sign out');
      // the divider sits between Network and Settings
      expect(await menu.evaluate(m => [...m.children].map(c => c.tagName === 'HR' ? '--' : c.textContent))).toEqual([...MENU.slice(0, 5), '--', ...MENU.slice(5)]);
      expect(await pathOf(items.nth(1))).toBe('/u/');
      expect(await items.nth(2).getAttribute('href')).toMatch(/\/u\/\?tester&shelf$/);   // your shelf, on its own page
      expect(await pathOf(items.nth(5))).toBe('/settings/');
      // all of it inside the window
      const box = await menu.boundingBox(), size = page.viewportSize();
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(size.height);

      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
      await btn.click();
      await expect(menu).toBeVisible();
      await page.locator('footer').click({ position: { x: 5, y: 5 } });
      await expect(menu).toBeHidden();
      expect(errors, 'console errors').toEqual([]);
      expect(net.unknown, 'requests the tests have no answer for').toEqual([]);
    });
  }

  test('a mouse opens it by pointing at you, and it closes when the pointer leaves', async ({ page }) => {
    test.skip(isPhone(), 'no pointer to hover with on a phone');
    await mockNetwork(page, { signedIn: true });
    await open(page, '/');
    const menu = page.getByRole('menu', { name: 'Account' });
    await page.locator('#acctBtn').hover();
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Profile' }).hover();   // across the gap, into the menu: still open
    await expect(menu).toBeVisible();
    await page.locator('main').hover({ position: { x: 20, y: 300 } });
    await expect(menu).toBeHidden();
  });

  test('a tap opens it and a second tap closes it', async ({ page }) => {
    test.skip(!isPhone(), 'touch only');
    await mockNetwork(page, { signedIn: true });
    await open(page, '/');
    const menu = page.getByRole('menu', { name: 'Account' });
    await page.locator('#acctBtn').tap();
    await expect(menu).toBeVisible();
    await page.locator('#acctBtn').tap();
    await expect(menu).toBeHidden();
  });

  test('the keyboard: Enter opens it on its first item, arrows move, Esc gives focus back', async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, '/');
    const btn = page.locator('#acctBtn'), items = page.getByRole('menu', { name: 'Account' }).getByRole('menuitem');
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(btn).toBeFocused();
  });

  test('Sign out signs out', async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, '/');
    await page.locator('#acctBtn').click();
    const logout = page.waitForRequest(r => r.url().includes('/auth/v1/logout'));
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    expect(new URL((await logout).url()).searchParams.get('scope'), 'this device only, not every device').toBe('local');
    await expect(page.locator('#signInBtn')).toHaveText(/sign in/i);
    await expect(page.locator('#acctBtn')).toBeHidden();
    await expect(page.locator('#start')).toBeVisible();   // signed-out home
  });

  test('Sign out on the builder signs out without leaving it', async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, '/build/');
    await page.locator('#acctBtn').click();
    const logout = page.waitForRequest(r => r.url().includes('/auth/v1/logout'));
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    expect(new URL((await logout).url()).searchParams.get('scope')).toBe('local');
    await expect(page.locator('#signInBtn')).toHaveText(/sign in/i);
    await expect(page).toHaveURL(/\/build\/$/);
  });

  test('signed in with no username yet: home sends you to the builder, which asks for one and offers the way out', async ({ page }) => {
    await mockNetwork(page, { signedIn: true, named: false });
    await open(page, '/');
    await expect(page).toHaveURL(/\/build\/$/);
    await expect(page.locator('#signInBtn')).toHaveText(/finish sign-up/i);
    await expect(page.locator('#acctBtn')).toBeHidden();
    await expect(page.locator('#namePane')).toBeVisible();
    await expect(page.locator('#nameOut')).toBeVisible();   // no account menu yet, so Sign out is here
  });

  test('signed out, there is no account menu', async ({ page }) => {
    await mockNetwork(page);
    await open(page, '/');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test('every sign-out is for this device only', () => {
  test.skip(isPhone(), 'reads files, no browser: once is enough');
  const fs = require('fs'), path = require('path'), { ROOT } = require('../site');
  for (const f of ['index.html', 'build/index.html', 'feed/index.html', 'u/index.html', 'settings/index.html', 'shelves/index.html', 'members/index.html', 'admin.html']) {
    const calls = fs.readFileSync(path.join(ROOT, f), 'utf8').match(/auth\.signOut\([^)]*\)/g) || [];
    expect(calls.length, f).toBeGreaterThan(0);
    for (const c of calls) expect(c, f).toBe("auth.signOut({scope: 'local'})");
  }
});

test('the ▾ next to + ADD has one item: Upload a scan…', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const menu = page.getByRole('menu', { name: 'More ways to add' });
  await page.locator('#addMore').click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText(['Upload a scan…']);
  expect(await menu.getByRole('menuitem').evaluate(a => new URL(a.href).pathname + new URL(a.href).hash)).toBe('/build/#upload');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

/* ---------- home ---------- */
test('signed-out home: one line, a small grey one under it, Make a shelf, then the newest shelves', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf, but the real spines.');
  const hero = page.locator('.hero');
  await expect(hero.locator('p')).toHaveCount(1);
  expect(await hero.locator('p').evaluate(el => { const s = getComputedStyle(el); return [s.fontSize, s.color]; })).toEqual(['11px', 'rgb(107, 107, 107)']);
  const make = hero.getByRole('link', { name: 'Make a shelf' });
  await expect(make).toBeVisible();
  await expect(make).toHaveAttribute('href', 'build/');
  await expect(page.getByText(/lets you/i)).toHaveCount(0);   // the six tiles are gone
  await expect(page.locator('#out h2:visible')).toHaveText([/^Just shelved/, /^Recently active/]);
  await expect(page.locator('#heroRow li')).toHaveCount(6);
  await expect(page.locator('#outGrid li')).toHaveCount(12);
  await expect(page.locator('#stackers li')).toHaveCount(3);
  await page.locator('#signInBtn').click();   // SIGN IN in the bar opens the sheet
  await expect(page.locator('#signSheet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#signSheet')).toBeHidden();
  await make.click();
  await expect(page).toHaveURL(/\/build\/$/);
});

test('signed-in home: a welcome by name, the row from people you follow with All activity, then Just shelved', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome back, @tester. Here’s what people you follow have been shelving…');
  await expect(page.locator('#hello a')).toHaveAttribute('href', 'u/?tester');
  await expect(page.locator('main').getByRole('link', { name: /new shelf/i })).toHaveCount(0);   // + ADD in the bar is the way to a new shelf
  await expect(page.locator('#in h2')).toHaveText([/^New from people you follow/, /^Just shelved/]);
  const all = page.locator('#in').getByRole('link', { name: 'All activity' });
  await expect(all).toHaveAttribute('href', 'feed/?following');
  await expect(all.locator('svg')).toHaveCount(1);   // ⚡
  const h2 = await page.locator('#in h2').first().boundingBox(), link = await all.boundingBox();
  expect(Math.abs(h2.x + h2.width - (link.x + link.width))).toBeLessThanOrEqual(1);   // at the right of the heading
  await expect(page.locator('#folRow li')).toHaveCount(6);
  await expect(page.locator('#inGrid li')).toHaveCount(12);
});

// the copy: no em dashes, and no line that lists three things
for (const signedIn of [false, true]) {
  test(`home's copy has no em dash and no rule-of-three line, signed ${signedIn ? 'in' : 'out'}`, async ({ page }) => {
    await mockNetwork(page, { signedIn });
    await open(page, '/');
    const text = await page.locator('main').innerText();
    expect(text).not.toContain('—');
    for (const line of text.split('\n')) expect(line, line).not.toMatch(/\w[^.,\n]*, [^.,\n]+,? (and|or) /);   // a, b and c
    expect(await page.locator('meta[name="description"]').getAttribute('content')).not.toMatch(/—|, [^,]+, /);
  });
}

test('old builder links at the root go on to /build/', async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/?open=aaaaaaaa-aaaa-4aaa-8aaa-000000000000#shelf');
  await expect(page).toHaveURL(/\/build\/(\?open=aaaaaaaa-aaaa-4aaa-8aaa-000000000000)?#shelf$/);
  await page.goto('/#how');
  await expect(page).toHaveURL(/\/build\/#how$/);
});
