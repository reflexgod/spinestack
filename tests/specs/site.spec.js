// Every page with the top bar, signed out and signed in: the bar is there, the page doesn't scroll sideways, nothing
// is logged as an error, and nothing asks the network for something the tests don't know about.
const { test, expect } = require('@playwright/test');
const { PAGES, SHELVES, STORY, CAPTION, MADE_WITH, mockNetwork, watchErrors, open } = require('../site');

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
        // the places are in one order, signed in or out: ⚡ · SHELVES · MEMBERS · search (they used to change places)
        const places = await bar.locator('.links a').evaluateAll(as => as.map(a => ({ name: a.getAttribute('aria-label') || a.textContent.trim(), left: a.getBoundingClientRect().left, shown: a.getBoundingClientRect().width > 0 })));
        expect(places.map(p => p.name)).toEqual(['Activity', 'Shelves', 'Members', 'Search']);
        expect(places.every(p => p.shown)).toBe(true);
        expect(places.map(p => p.left)).toEqual(places.map(p => p.left).sort((a, b) => a - b));
        const search = bar.getByRole('link', { name: 'Search' });
        await expect(search).toBeVisible();
        expect(await pathOf(search)).toBe('/members/');
        if (signedIn) {
          // logo · you ▾ · ⚡ · SHELVES · MEMBERS · search · + ADD ▾
          await expect(bar.locator('#acctBtn')).toBeVisible();
          await expect(bar.locator('#acctBtn')).toHaveAccessibleName('@tester, your account');
          if (isPhone()) await expect(bar.locator('#acctBtn .who')).toBeHidden(); else await expect(bar.locator('#acctBtn .who')).toHaveText('@tester');   // a phone shows just the photo
          await expect(bar.locator('#signInBtn')).toBeHidden();
          await expect(bar.locator('#addMore')).toBeVisible();
        } else {
          // logo · ⚡ · SHELVES · MEMBERS · search · SIGN IN · + ADD
          await expect(bar.locator('#signInBtn')).toHaveText(/sign in/i);
          await expect(bar.locator('#acctBtn')).toBeHidden();
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

test('the ▾ next to + ADD has one item: Upload a scan', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const menu = page.getByRole('menu', { name: 'More ways to add' });
  await page.locator('#addMore').click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText(['Upload a scan']);
  expect(await menu.getByRole('menuitem').evaluate(a => new URL(a.href).pathname + new URL(a.href).hash)).toBe('/build/#upload');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

/* ---------- home ---------- */
test('signed-out home: a real shelf, large, then one line and Make a shelf in black, from the left; how it works; then the newest shelves', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/');
  const hero = page.locator('.hero'), h1 = page.getByRole('heading', { level: 1 }), main = await page.locator('main').boundingBox();
  // it leads with a shelf, not words: the newest public one, large, a link to it, with its name and who made it
  const lead = hero.locator('#leadLink'), stand = await hero.locator('#stand').boundingBox();
  await expect(lead).toBeVisible();
  await expect(lead).toHaveAttribute('href', `u/?tester&shelf=${SHELVES[0].id}`);
  await expect(lead).toHaveAccessibleName('a much longer shelf name that has to be cut short by @tester');
  await expect(hero.locator('#leadCap')).toHaveText('a much longer shelf name that has to be cut short by @tester');
  expect(Math.abs(stand.width - main.width)).toBeLessThanOrEqual(1);   // across the column
  const pic = await hero.locator('#leadLink .cut').boundingBox();
  expect(pic.height).toBeGreaterThan(isPhone() ? 250 : 350);           // large: a card's picture is 225px tall at most
  expect(pic.y).toBeGreaterThanOrEqual(stand.y); expect(pic.y + pic.height).toBeLessThanOrEqual(stand.y + stand.height);
  expect(Math.abs(pic.x + pic.width / 2 - (stand.x + stand.width / 2))).toBeLessThanOrEqual(1);
  // cut to its books: the story's caption (at the top of the picture) and its "made with" line are outside the cut
  const cut = await hero.locator('#leadLink img').evaluate(im => { const c = im.parentElement.getBoundingClientRect(), r = im.getBoundingClientRect(); return { top: (c.top - r.top) / r.height, bottom: (c.bottom - r.top) / r.height }; });
  expect(cut.top).toBeGreaterThan(CAPTION[3] / 640);
  expect(cut.bottom).toBeLessThan(MADE_WITH[1] / 640);
  expect(cut.top).toBeLessThanOrEqual(STORY.row[1] / 640); expect(cut.bottom).toBeGreaterThanOrEqual(STORY.row[3] / 640);   // and all of the books are in it
  expect(await hero.locator('#stand').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');   // on the story's own background
  // one line, under the shelf, from the left like the rest of the site; no second, grey line
  await expect(h1).toHaveText('Shelve the films and books you love, with their real spines.');
  const line = await h1.boundingBox();
  expect(Math.abs(line.x - main.x)).toBeLessThanOrEqual(1);
  expect(await h1.evaluate(el => getComputedStyle(el).textAlign)).toMatch(/^(start|left)$/);
  expect(line.y).toBeGreaterThan(stand.y + stand.height);
  await expect(hero.locator('p')).toHaveCount(0);
  // Make a shelf: the one black button (the bar's + is outlined here), at the left, on the first screen
  const make = hero.getByRole('link', { name: 'Make a shelf' });
  await expect(make).toBeVisible();
  await expect(make).toHaveAttribute('href', 'build/');
  const bg = el => getComputedStyle(el).backgroundColor, at = await make.boundingBox();
  expect(await make.evaluate(bg)).toBe('rgb(0, 0, 0)');
  expect(await page.locator('header.top .add').evaluate(bg)).toBe('rgb(255, 255, 255)');
  expect(Math.abs(at.x - main.x)).toBeLessThanOrEqual(1);
  expect(at.y + at.height).toBeLessThanOrEqual(page.viewportSize().height);
  await expect(page.getByText(/lets you/i)).toHaveCount(0);   // the six tiles are gone
  // how it works, short, here (it was in every page's footer)
  await expect(page.locator('#out h2:visible')).toHaveText([/^How it works/, /^Just shelved/, /^Recently active/]);
  await expect(page.locator('main .how li')).toHaveText(['Type a film or a book.', 'We find a scan of its DVD or book cover and cut out the spine.', 'No clean scan? You get a spine made from the poster or cover.']);
  await expect(page.locator('#outGrid li')).toHaveCount(12);
  await expect(page.locator('#outGrid li').first().locator('.cap')).toHaveText('shelf number 1');   // the newest is the one above
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

test('signed-in home: New from people you follow has their logs too, drawn as the feed draws them', async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(new Date('2026-09-30T14:00:00Z'));   // two hours after the newest made-up shelf, so the times are known
  await mockNetwork(page, { signedIn: true });
  const asked = page.waitForRequest(r => r.url().includes('/rest/v1/rpc/activity'));
  let feeds = []; page.on('request', r => { if (r.url().includes('/rest/v1/rpc/feed')) feeds.push(r.postDataJSON().scope); });
  await open(page, '/');
  expect((await asked).postDataJSON()).toEqual({ scope: 'following', before: null, before_id: null, n: 6 });   // shelves and logs together
  expect(feeds).toEqual(['everyone']);   // feed() is only asked for Just shelved
  // the newest six from @mira, whom the made-up account follows: two of them logs
  const lines = (await page.locator('#folRow .line').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
  expect(lines).toEqual(['@mira watched Gummo · today', '@mira shelved shelf number 1 · 1d', '@mira updated untitled shelf · 4d', '@mira read The Waves · 1w', '@mira shelved shelf number 7 · 1w',
    '@mira updated a much longer shelf name that has to be cut short · 1w']);
  // a log: its cover small and worn, the caption beside it, as on the feed
  const log = page.locator('#folRow .item.log').first(), cover = log.locator('.cover canvas');
  await expect(cover).toHaveAttribute('aria-label', 'Gummo (1997), watched by @mira');
  const c = await cover.boundingBox(), say = await log.locator('.say').boundingBox(), line = await log.locator('.line').boundingBox();
  expect([Math.round(c.width), Math.round(c.height)]).toEqual([72, 108]);
  expect(Math.abs(c.x - line.x)).toBeLessThanOrEqual(1);
  await expect(log.locator('.say')).toHaveText('The bathtub scene. Still thinking about it.');
  expect(say.x).toBeGreaterThan(c.x + c.width);
  expect(+(await cover.getAttribute('data-wear'))).toBeGreaterThan(0);
  await expect(log.locator('.line a')).toHaveAttribute('href', 'u/?mira');
  await expect(log.locator('.fa')).toHaveAttribute('href', 'u/?mira');
  // a shelf: the feed's line, with its card under it, a link to the shelf
  const shelf = page.locator('#folRow .item:not(.log)').first(), card = await shelf.locator('.pic').boundingBox();
  await expect(shelf.locator('.line a').nth(1)).toHaveAttribute('href', `u/?mira&shelf=${SHELVES[1].id}`);
  await expect(shelf.locator('.pic')).toHaveAttribute('href', `u/?mira&shelf=${SHELVES[1].id}`);
  expect([Math.round(card.width), Math.round(card.height)]).toEqual([150, 225]);
  // two across on a wide window, one on a phone; never wider than the page
  const first = await page.locator('#folRow li').nth(0).boundingBox(), second = await page.locator('#folRow li').nth(1).boundingBox();
  if (isPhone()) expect(second.y).toBeGreaterThan(first.y + first.height - 1); else { expect(Math.abs(second.y - first.y)).toBeLessThanOrEqual(1); expect(second.x).toBeGreaterThan(first.x + first.width); }
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('signed-in home on a database without logs (0007 not run on it): the shelves of people you follow, from feed()', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, logs: false });
  const asked = [];
  page.on('request', r => { if (r.url().includes('/rest/v1/rpc/')) asked.push(new URL(r.url()).pathname.split('/').pop() + ' ' + r.postDataJSON().scope); });
  await open(page, '/');
  await expect(page.locator('#folRow li')).toHaveCount(6);
  await expect(page.locator('#folRow .item.log')).toHaveCount(0);
  for (const t of await page.locator('#folRow .line').allTextContents()) expect(t).toMatch(/^@mira (shelved|updated) /);
  await expect(page.locator('#folRow .pic')).toHaveCount(6);
  expect(asked.filter(a => / following$/.test(a))).toEqual(['activity following', 'feed following']);   // asked once, then the feed of 0006
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

// An ellipsis stays on home's welcome line, and on lines that say something is under way ("Loading…"). On a
// placeholder or a menu item it reads as text that didn't fit.
test('no placeholder or menu item ends in an ellipsis; home\'s welcome line keeps its one', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/build/');
  const cut = /…|\.\.\./, placeholders = () => page.locator('input[placeholder], textarea[placeholder]').evaluateAll(els => els.map(e => e.placeholder));
  expect((await placeholders()).length).toBeGreaterThan(1);
  for (const p of await placeholders()) expect(p).not.toMatch(cut);
  await expect(page.getByRole('textbox', { name: 'Add' })).toHaveAttribute('placeholder', 'find a film or book');
  await page.locator('#addMore').click();
  for (const t of await page.getByRole('menu', { name: 'More ways to add' }).getByRole('menuitem').allTextContents()) expect(t).not.toMatch(cut);
  await page.keyboard.press('Escape');
  await page.locator('header.top .add').click();   // the Add dialog
  await expect(page.locator('#addQ')).toHaveAttribute('placeholder', 'Gummo, The Waves, Kids');   // it had three full stops
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText(/have been shelving…$/);
});
