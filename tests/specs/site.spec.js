// Every page with the top bar, signed out and signed in: the bar is there, the page doesn't scroll sideways, nothing
// is logged as an error, and nothing asks the network for something the tests don't know about.
const { test, expect } = require('@playwright/test');
const { PAGES, SHELVES, PEOPLE, FRIEND_SHELVES, FRIEND_LOGS, LOGS, ITEMS_BY_SHELF, feedRow, mockNetwork, watchErrors, open, putAside } = require('../site');

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
        for (const [name, to] of [['Shelves', '/shelves/'], ['Members', '/members/'], ['Feed', '/feed/']]) {
          const link = bar.locator('.links').getByRole('link', { name, exact: true });
          await expect(link).toBeVisible();
          expect(await pathOf(link)).toBe(to);
        }
        await expect(bar.getByRole('link', { name: 'Add a film or a book' })).toBeVisible();
        if (!isPhone()) await expect(bar.locator('.add')).toHaveText('Add');   // + ADD (a phone shows just the +)
        // the places are in one order, signed in or out: FEED · SHELVES · MEMBERS · search (they used to change places)
        const places = await bar.locator('.links a').evaluateAll(as => as.map(a => ({ name: a.getAttribute('aria-label') || a.textContent.trim(), left: a.getBoundingClientRect().left, shown: a.getBoundingClientRect().width > 0 })));
        expect(places.map(p => p.name)).toEqual(['Feed', 'Shelves', 'Members', 'Search']);
        await expect(bar.locator('.links a', { hasText: 'Feed' })).toHaveCSS('text-transform', 'uppercase');   // a word in capitals, no ⚡
        expect(places.every(p => p.shown)).toBe(true);
        expect(places.map(p => p.left)).toEqual(places.map(p => p.left).sort((a, b) => a - b));
        const search = bar.getByRole('link', { name: 'Search' });
        await expect(search).toBeVisible();
        expect(await pathOf(search)).toBe('/members/');
        if (signedIn) {
          // logo · you ▾ · FEED · SHELVES · MEMBERS · search · + ADD ▾
          await expect(bar.locator('#acctBtn')).toBeVisible();
          await expect(bar.locator('#acctBtn')).toHaveAccessibleName('@tester, your account');
          if (isPhone()) await expect(bar.locator('#acctBtn .who')).toBeHidden(); else await expect(bar.locator('#acctBtn .who')).toHaveText('@tester');   // a phone shows just the photo
          await expect(bar.locator('#signInBtn')).toBeHidden();
          await expect(bar.locator('#addMore')).toBeVisible();
        } else {
          // logo · FEED · SHELVES · MEMBERS · search · SIGN IN · + ADD
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
/* The spine wall: what's in it, as the page has it. Each link is one shelf, with that shelf's spines in it */
const wallOf = page => page.locator('#spines a').evaluateAll(as => as.map(a => ({ href: a.getAttribute('href'), name: a.getAttribute('aria-label'),
  titles: [...a.querySelectorAll('canvas')].map(c => c.title.replace(/ \(\d{4}\) · @.*$/, '')) })));
// the titles a made-up shelf has, in its order
const titlesOf = (i, from = 0) => ITEMS_BY_SHELF.get(SHELVES[i].id).slice(from).map(r => r.title);
// the strip and the spines in it: where they are, and how large each is drawn against its own pixels
const strip = page => page.locator('#spines').evaluate(el => {
  const b = el.getBoundingClientRect(), s = getComputedStyle(el);
  return { x: b.left, y: b.top, w: b.width, h: b.height, bottom: b.bottom - parseFloat(s.borderBottomWidth), line: [s.borderBottomWidth, s.borderBottomStyle, s.borderBottomColor].join(' '),
    scroll: el.scrollWidth - el.clientWidth, spines: [...el.querySelectorAll('canvas')].map(c => { const r = c.getBoundingClientRect(); return { x: r.left, w: r.width, h: r.height, bottom: r.bottom, ratio: c.width / c.height }; }),
    links: [...el.querySelectorAll('a')].map(a => { const r = a.getBoundingClientRect(); return { x: r.left, w: r.width }; }) };
});

test('signed-out home: a wall of the newest spines from different shelves on a shelf line, then one line and Make a shelf in black, and nothing else before the newest shelves', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page);
  const asked = page.waitForRequest(r => r.url().includes('/rest/v1/shelf_items?'));
  await open(page, '/');
  const hero = page.locator('.hero'), h1 = page.getByRole('heading', { level: 1 }), main = await page.locator('main').boundingBox();
  // the spines of the twelve newest public shelves are read at once
  expect(new URL((await asked).url()).searchParams.get('shelf_id')).toBe(`in.(${SHELVES.slice(0, 12).map(x => x.id).join(',')})`);
  // newest shelf first. Three people have shelves here: three spines from each (the ones put on last), then more from the
  // same shelves in turn until there are 24. Each shelf's spines stand together, in their order on it, one link to it
  const wall = await wallOf(page);
  expect(wall.map(g => g.href)).toEqual([0, 1, 2, 3, 4].map(i => `u/?${['tester', 'mira', 'longusername_twenty1'][i % 3]}&shelf=${SHELVES[i].id}`));
  expect(wall.map(g => g.titles)).toEqual([titlesOf(0), titlesOf(1), titlesOf(2), titlesOf(3), titlesOf(4)]);
  expect(wall.flatMap(g => g.titles)).toHaveLength(24);
  expect(wall[0].name).toBe(`${titlesOf(0).join(', ')}: a much longer shelf name that has to be cut short by @tester`);
  await expect(page.locator('#spines canvas').first()).toHaveAttribute('title', 'Gummo (1997) · @tester');   // a spine says what it is
  await expect(page.locator('#sample')).toBeHidden();
  // one strip across the column, 280px tall at most (200px on a phone), the spines standing on its thin line
  const st = await strip(page), tallest = Math.max(...st.spines.map(x => x.h));
  expect(Math.abs(st.w - main.width)).toBeLessThanOrEqual(1);
  expect(st.h).toBeLessThanOrEqual(isPhone() ? 200 : 280);
  expect(st.line).toBe('1px solid rgb(0, 0, 0)');
  for (const x of st.spines) {
    expect(Math.abs(x.bottom - st.bottom)).toBeLessThanOrEqual(1);
    expect(x.w / x.h).toBeCloseTo(x.ratio, 1);   // never stretched
  }
  if (isPhone()) {
    expect(Math.round(tallest)).toBeGreaterThanOrEqual(188);   // as tall as the strip allows, and the rest scroll sideways inside it
    expect(st.scroll).toBeGreaterThan(100);
    for (const l of st.links) expect(l.w).toBeGreaterThanOrEqual(44);   // a press on a shelf's spines is the shelf's
    await page.locator('#spines').evaluate(el => el.scrollBy(2000, 0));
    await expect.poll(() => page.locator('#spines a').last().evaluate(a => a.getBoundingClientRect().right <= a.parentElement.getBoundingClientRect().right + 1)).toBe(true);
  } else {
    expect(st.scroll).toBeLessThanOrEqual(0);            // all of them across the column, as large as that allows
    expect(tallest).toBeGreaterThanOrEqual(200);
    expect(st.spines[st.spines.length - 1].x + st.spines[st.spines.length - 1].w).toBeGreaterThan(st.x + st.w - 40);
  }
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  // one line, under the wall, from the left like the rest of the site; no second, grey line
  await expect(h1).toHaveText('Shelve the films and books you love, with their real spines.');
  const line = await h1.boundingBox();
  expect(Math.abs(line.x - main.x)).toBeLessThanOrEqual(1);
  expect(await h1.evaluate(el => getComputedStyle(el).textAlign)).toMatch(/^(start|left)$/);
  expect(line.y).toBeGreaterThan(st.y + st.h);
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
  // no How it works: under the wall, the one line and Make a shelf, then Just shelved
  await expect(page.locator('#out h2:visible')).toHaveText([/^Just shelved/, /^Recently active/]);
  await expect(page.locator('main ol')).toHaveCount(0);
  expect(await page.locator('#out > section:visible').evaluateAll(s => s.map(x => x.id || x.className))).toEqual(['hero', 'outJust', 'stackersSec']);
  expect(await page.locator('.hero > :visible').evaluateAll(els => els.map(e => e.tagName.toLowerCase()))).toEqual(['figure', 'h1', 'a']);
  await expect(page.locator('#outGrid li')).toHaveCount(12);
  await expect(page.locator('#outGrid li').first().locator('.cap')).toHaveText('a much longer shelf name that has to be cut short');   // the newest, now there's no one shelf above
  await expect(page.locator('#stackers li')).toHaveCount(3);
  await page.locator('#signInBtn').click();   // SIGN IN in the bar opens the sheet
  await expect(page.locator('#signSheet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#signSheet')).toBeHidden();
  await page.locator('#spines a').nth(1).click();   // a press on the spines opens their shelf
  await expect(page).toHaveURL(new RegExp(`/u/\\?mira&shelf=${SHELVES[1].id}$`));
  await page.goBack();
  await page.getByRole('link', { name: 'Make a shelf' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();   // signed out: sign in first (the site is read only)
  await expect(page.locator('#signSheet .sheetbox p:not(.note)').first()).toHaveText('Sign in to start your shelf.');
  expect(errors).toEqual([]);
});

// the newest shelves as feed() gives them, each by someone else: the made-up shelves with an owner of their own
const manyPeople = page => page.route(u => u.pathname === '/rest/v1/rpc/feed', route => {
  if (route.request().method() !== 'POST') return route.fallback();
  const rows = SHELVES.slice(0, 12).map((x, i) => ({ ...feedRow(x), owner: `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`, username: `reader${i}` }));
  return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(rows) });
});

test('signed-out home\'s spine wall: with many people, a few spines from each, the ones they put on last', async ({ page }) => {
  await mockNetwork(page);
  await manyPeople(page);
  await open(page, '/');
  const wall = await wallOf(page);
  // three at most from each shelf, its last three, until there are 24: nine shelves (one has a single spine)
  expect(wall.map(g => g.href)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `u/?reader${i}&shelf=${SHELVES[i].id}`));
  expect(wall.map(g => g.titles)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => { const t = titlesOf(i); return t.slice(Math.max(0, t.length - 3)); }));
  expect(wall.flatMap(g => g.titles)).toHaveLength(24);
});

test('signed-out home\'s spine wall: with only a few spines on the site, they stand in the middle, not stretched', async ({ page }) => {
  await mockNetwork(page);
  await page.route(u => u.pathname === '/rest/v1/rpc/feed', route => route.request().method() !== 'POST' ? route.fallback()
    : route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([feedRow(SHELVES[1])]) }));   // one shelf, three spines
  await open(page, '/');
  const wall = await wallOf(page);
  expect(wall.map(g => g.titles)).toEqual([titlesOf(1)]);
  const st = await strip(page), first = st.spines[0], last = st.spines[st.spines.length - 1];
  expect(st.spines).toHaveLength(3);
  expect(Math.abs((first.x - st.x) - (st.x + st.w - last.x - last.w))).toBeLessThanOrEqual(2);   // the room either side is the same
  for (const x of st.spines) expect(x.w / x.h).toBeCloseTo(x.ratio, 1);
  expect(Math.max(...st.spines.map(x => x.h))).toBeLessThanOrEqual(isPhone() ? 200 : 280);
  expect(Math.max(...st.spines.map(x => x.w))).toBeLessThan(60);                                  // spines, not panels
  await expect(page.locator('#sample')).toBeHidden();
});

// Signed out the site is read only; signing in from Make a shelf goes on to the builder, and from + ADD to the Add dialog
test('signed out, Make a shelf asks to sign in, and once signed in the builder opens', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  const signBack = await putAside(page);
  await open(page, '/');
  await page.getByRole('link', { name: 'Make a shelf' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
  await signBack(); await page.reload();
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your shelf');
});
test('signed out, + ADD asks to sign in, and once signed in the Add dialog opens where you were', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const signBack = await putAside(page);
  await open(page, '/feed/?everyone');
  await page.locator('header.top .add').click();
  await expect(page.locator('#signSheet')).toBeVisible();
  await signBack(); await page.reload();
  await expect(page.getByRole('dialog', { name: 'What did you watch or read?' })).toBeVisible();
  await expect(page).toHaveURL(/\/feed\//);
  await page.keyboard.press('Escape'); await page.reload();
  await expect(page.getByRole('dialog', { name: 'What did you watch or read?' })).toBeHidden();   // once, not every time
});

test('signed-in home: a welcome by name, the row from people you follow with All activity, then Just shelved', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/');
  await expect(page.locator('#hello')).toHaveText('Welcome back, @tester.');   // the row's heading says the rest
  await expect(page.locator('#hello a')).toHaveAttribute('href', 'u/?tester');
  await expect(page.locator('main').getByRole('link', { name: /new shelf/i })).toHaveCount(0);   // + ADD in the bar is the way to a new shelf
  await expect(page.locator('#in h2')).toHaveText([/^New from people you follow/, /^Just shelved/]);
  const all = page.locator('#in').getByRole('link', { name: 'All activity' });
  await expect(all).toHaveAttribute('href', 'feed/?following');
  await expect(all.locator('svg')).toHaveCount(0);   // no ⚡: it's Letterboxd's
  const h2 = await page.locator('#in h2').first().boundingBox(), link = await all.boundingBox();
  expect(Math.abs(h2.x + h2.width - (link.x + link.width))).toBeLessThanOrEqual(1);   // at the right of the heading
  await expect(page.locator('#folRow li')).toHaveCount(1);   // the made-up account follows only @mira: one card, her newest
  await expect(page.locator('#inGrid li')).toHaveCount(12);
});

/* New from people you follow: a card for each person, the newest thing from them (Letterboxd's row). With friends:
   true the made-up account follows five more people, so there are six */
const cardsOf = page => page.locator('#folRow > li');
test('signed-in home: New from people you follow is a row of cards, one for each person, the newest thing from them', async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(new Date('2026-09-30T14:00:00Z'));
  await mockNetwork(page, { signedIn: true, friends: true });
  const asked = page.waitForRequest(r => r.url().includes('/rest/v1/rpc/activity'));
  await open(page, '/');
  expect((await asked).postDataJSON()).toEqual({ scope: 'following', before: null, before_id: null, n: 50 });   // enough to find each person's newest
  const cards = cardsOf(page);
  await expect(cards).toHaveCount(6);
  // newest first, each person once: @mira's Gummo, not her shelves after it; @kit's shelf, not the log before it
  await expect(cards.locator('.fby span:last-child')).toHaveText(['@mira', '@ola', '@june_reads', '@tomasz', '@bea', '@kit']);
  await expect(cards.locator('.fmeta span')).toHaveText(['watched', 'read', 'shelved', 'watched', 'shelved', 'shelved']);
  await expect(cards.locator('.fmeta time')).toHaveText(['Sep 30', 'Sep 29', 'Sep 28', 'Sep 25', 'Sep 24', 'Sep 21']);
  await expect(cards.locator('.fmeta time').first()).toHaveAttribute('datetime', LOGS[0].created_at);
  // the card opens the shelf, or for a log the person's Activity, where it's the first line
  const links = cards.locator('a.fcard');
  await expect(links.nth(0)).toHaveAttribute('href', 'u/?mira#activity');
  await expect(links.nth(0)).toHaveAccessibleName('Gummo (1997), watched by @mira');
  await expect(links.nth(2)).toHaveAttribute('href', `u/?june_reads&shelf=${FRIEND_SHELVES[0].id}`);
  await expect(links.nth(2)).toHaveAccessibleName('june’s pile, shelved by @june_reads');
  await expect(links.nth(3)).toHaveAccessibleName('Stalker (1979), watched by @tomasz');
  await expect(links.nth(5)).toHaveAttribute('href', `u/?kit&shelf=${FRIEND_SHELVES[2].id}`);
  // no captions here: not the log's, and no shelf name under the card
  await expect(page.locator('#folRow')).not.toContainText('Still thinking about it');
  await expect(page.locator('#folRow')).not.toContainText(FRIEND_LOGS[0].caption);
  await expect(page.locator('#folRow')).not.toContainText('june’s pile');
  await expect(page.locator('#folRow .say, #folRow .cap, #folRow .line')).toHaveCount(0);
  // a log: its cover, worn, is the whole picture
  const cover = cards.nth(0).locator('.art canvas.worn');
  await expect(cover).toHaveCount(1);
  expect(+(await cover.getAttribute('data-wear'))).toBeGreaterThan(0);
  const art0 = await cards.nth(0).locator('.art').boundingBox(), c0 = await cover.boundingBox();
  expect([Math.round(c0.x), Math.round(c0.y), Math.round(c0.width), Math.round(c0.height)]).toEqual([Math.round(art0.x), Math.round(art0.y), Math.round(art0.width), Math.round(art0.height)]);
  // a shelf: its spines cut out on the grey panel, in the middle of it with room round them, not its story
  const panel = cards.nth(2).locator('.art');
  expect(await panel.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(243, 243, 243)');
  await expect(panel.locator('canvas')).toHaveCount(1);
  await expect(panel.locator('img')).toHaveCount(0);
  const p = await panel.boundingBox(), shelf = await panel.locator('canvas').boundingBox();
  expect(shelf.x).toBeGreaterThanOrEqual(p.x + 7); expect(shelf.x + shelf.width).toBeLessThanOrEqual(p.x + p.width - 7);
  expect(shelf.y).toBeGreaterThanOrEqual(p.y + 7); expect(shelf.y + shelf.height).toBeLessThanOrEqual(p.y + p.height - 7);
  expect(Math.abs(shelf.x + shelf.width / 2 - (p.x + p.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(shelf.y + shelf.height / 2 - (p.y + p.height / 2))).toBeLessThanOrEqual(1);
  await expect(cards.locator('.panel canvas')).toHaveCount(3);   // every shelf is drawn
  expect(errors).toEqual([]);
});

test('signed-in home: each card is 2:3 with a thin bar under the picture, a 1px border and no shadow; six across, or three on a phone and the rest sideways', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, friends: true });
  await open(page, '/');
  const cards = cardsOf(page), main = await page.locator('main').boundingBox();
  await expect(cards).toHaveCount(6);
  const box = await cards.evaluateAll(els => els.map(li => {
    const r = el => { const b = (el ? li.querySelector(el) : li).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, a = getComputedStyle(li.querySelector('.fcard'));
    return { li: r(), card: r('.fcard'), art: r('.art'), bar: r('.fby'), face: r('.fby .fa'), meta: r('.fmeta'), word: r('.fmeta span'), date: r('.fmeta time'),
      border: [a.borderTopWidth, a.borderTopStyle, a.borderBottomWidth, a.borderLeftWidth, a.borderRightWidth].join(' '), shadow: a.boxShadow, radius: a.borderTopLeftRadius,
      metaColour: getComputedStyle(li.querySelector('.fmeta')).color, metaSize: getComputedStyle(li.querySelector('.fmeta time')).fontSize, wordSize: getComputedStyle(li.querySelector('.fmeta span')).fontSize };
  }));
  for (const b of box) {
    expect(b.art.h / b.art.w).toBeCloseTo(1.5, 1);                                  // the picture is 2:3
    expect(b.border).toBe('1px solid 1px 1px 1px');
    expect(b.shadow).toBe('none');
    expect(b.radius).toBe('3px');                                                    // what shelf cards already have
    expect(b.bar.y).toBeGreaterThanOrEqual(b.art.y + b.art.h - 1);                   // the bar is under the picture, inside the card
    expect(b.bar.y + b.bar.h).toBeLessThanOrEqual(b.card.y + b.card.h);
    expect(b.bar.h).toBeLessThanOrEqual(26);                                         // thin
    expect(b.face.x).toBeLessThan(b.bar.x + 12);                                     // the photo first
    expect(b.meta.y).toBeGreaterThanOrEqual(b.card.y + b.card.h);                    // under the card: the word on the left, the date on the right
    expect(Math.abs(b.word.x - b.card.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.date.x + b.date.w - (b.card.x + b.card.w))).toBeLessThanOrEqual(1);
    expect(b.metaColour).toBe('rgb(107, 107, 107)');
    expect(parseFloat(b.metaSize)).toBeLessThanOrEqual(11); expect(parseFloat(b.wordSize)).toBeLessThanOrEqual(10);
  }
  const widths = new Set(box.map(b => Math.round(b.card.w))), rows = new Set(box.map(b => Math.round(b.card.y)));
  expect(widths.size).toBe(1);                                                       // equal
  expect(rows.size).toBe(1);                                                         // one row
  const inView = box.filter(b => b.li.x >= main.x - 1 && b.li.x + b.li.w <= main.x + main.width + 1).length;
  if (isPhone()) {
    expect(inView).toBe(3);                                                          // three across, the rest sideways
    const row = page.locator('#folRow');
    expect(await row.evaluate(el => el.scrollWidth > el.clientWidth + 100)).toBe(true);
    await row.evaluate(el => el.scrollBy(1000, 0));
    await expect.poll(() => cardsOf(page).last().evaluate(li => { const r = li.getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect(); return r.right <= m.right + 1; })).toBe(true);
  } else {
    expect(inView).toBe(6);
    expect(Math.round(box[0].card.w)).toBe(150);                                     // the column's six: 150px, 10px apart
    expect(Math.round(box[1].li.x - box[0].li.x - box[0].li.w)).toBe(10);
  }
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);                                           // the page itself never scrolls sideways
});

test('signed-in home on a database without logs (0007 not run on it): the newest shelf of each person you follow, from feed()', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, logs: false, friends: true });
  const asked = [];
  page.on('request', r => { if (r.url().includes('/rest/v1/rpc/')) asked.push(new URL(r.url()).pathname.split('/').pop() + ' ' + r.postDataJSON().scope); });
  await open(page, '/');
  await expect(cardsOf(page).locator('.fby span:last-child')).toHaveText(['@mira', '@june_reads', '@bea', '@kit']);   // the people with a shelf
  await expect(cardsOf(page).locator('.fmeta span')).toHaveText(['shelved', 'shelved', 'shelved', 'shelved']);
  await expect(cardsOf(page).locator('.panel canvas')).toHaveCount(4);
  await expect(cardsOf(page).locator('a.fcard').first()).toHaveAttribute('href', `u/?mira&shelf=${SHELVES[1].id}`);
  expect(asked.filter(a => / following$/.test(a))).toEqual(['activity following', 'feed following']);   // asked once, then the feed of 0006
});

test('signed-in home: a shelf whose spines can\'t be read stays an empty grey panel, and the card still opens it', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, friends: true });
  await page.route(u => u.pathname === '/rest/v1/shelf_items', route => route.request().method() === 'OPTIONS' ? route.fallback() : route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"message":"no"}' }));
  await open(page, '/');
  await expect(cardsOf(page)).toHaveCount(6);
  await expect(cardsOf(page).locator('.panel')).toHaveCount(3);
  await expect(cardsOf(page).locator('.panel canvas')).toHaveCount(0);
  await expect(cardsOf(page).locator('a.fcard').nth(2)).toHaveAttribute('href', `u/?june_reads&shelf=${FRIEND_SHELVES[0].id}`);
  expect(errors.filter(e => !/500/.test(e))).toEqual([]);   // the browser logs the 500 itself
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

// on every page, signed in and out, as it stands once it has loaded: no "!", no arrows in the text, "Welcome" once at
// most, and an ellipsis only on something under way (none is, by then)
for (const signedIn of [false, true]) {
  test(`no "!", no arrows, no stray ellipsis and one "Welcome" at most on any page, signed ${signedIn ? 'in' : 'out'}`, async ({ page }) => {
    await mockNetwork(page, { signedIn });
    for (const pg of [...PAGES, { name: 'own profile', path: '/u/?tester' }, { name: 'own profile, watchlist', path: '/u/?tester#watchlist' }, { name: 'a shelf', path: '/u/?mira&shelf' }]){
      await open(page, pg.path);
      const text = await page.locator('body').innerText();
      expect(text, pg.name).not.toMatch(/!|→|←|↗/);
      expect(text, pg.name).not.toMatch(/…/);
      expect((text.match(/Welcome/g) || []).length, pg.name).toBeLessThanOrEqual(1);
      // buttons and text actions in their own case: only the bar, section headings and tiny labels are in capitals
      const shouting = await page.locator('main .btn:visible, main .dash:visible, .mkbar .btn:visible').evaluateAll(els => els.filter(e => getComputedStyle(e).textTransform === 'uppercase').map(e => e.textContent.trim()));
      expect(shouting, pg.name).toEqual([]);
    }
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
test('no placeholder or menu item ends in an ellipsis, nor home\'s welcome line', async ({ page }) => {
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
  await expect(page.locator('#hello')).not.toHaveText(cut);
});
