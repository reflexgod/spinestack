// A post on the feed, with migration 0009 (mockNetwork's social): the stars, Rewatch, the review (blurred until
// pressed when it has spoilers), and the row of actions: like, reply and me too with their counts, + Watchlist or In
// watchlist, Share, and ··· with Report (someone else's) or Delete (yours, after a yes). Counts change at once and go
// back when the database says no. Without 0009 there's no like, reply, me too or Report.
const { test, expect } = require('@playwright/test');
const { ME, LOGS, SB_URL, CORS, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const post = (page, text) => page.locator('#items .item.log').filter({ hasText: text }).first();
const sent = (page, method, table) => page.waitForRequest(r => r.method() === method && new URL(r.url()).pathname === '/rest/v1/' + table);

test('a post: @name, watched Gummo, its stars and rewatch, the worn cover, the review, how long ago; then like, reply and me too with their counts', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo');
  await expect(p.locator('.line')).toContainText('@mira watched Gummo');
  await expect(p.locator('.line .stars')).toHaveAttribute('aria-label', '4.5 stars');
  await expect(p.locator('.line .tag')).toHaveText('rewatch');
  await expect(p.locator('.fa')).toBeVisible();   // the photo
  await expect(p.locator('.cover canvas')).toBeVisible();
  await expect(p.locator('.say')).toHaveText('The bathtub scene. Still thinking about it.');
  const like = p.getByRole('button', { name: /^Like/ });
  await expect(like).toHaveAttribute('aria-pressed', 'true');   // the made-up account liked it
  await expect(like).toHaveAccessibleName('Like. 3 likes');
  await expect(p.getByRole('link', { name: 'Reply. 2 replies' })).toHaveAttribute('href', new RegExp(`/p/\\?${LOGS[0].id}#reply$`));
  await expect(p.getByRole('button', { name: /^Me too/ })).toContainText('1');
  // the actions are small grey text, under the cover
  const acts = p.locator('.acts');
  expect(await acts.getByRole('button', { name: /^Me too/ }).evaluate(b => [getComputedStyle(b).color, getComputedStyle(b).fontSize])).toEqual(['rgb(107, 107, 107)', '11px']);
  expect((await acts.boundingBox()).y).toBeGreaterThan((await p.locator('.cover').boundingBox()).y + 100);
  expect(errors).toEqual([]);
});

test('like: the count changes at once; unlike takes it back; when it doesn\'t save, it goes back and says so', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const like = post(page, 'watched Gummo').getByRole('button', { name: /^Like/ });
  let req = sent(page, 'DELETE', 'likes');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(like).toHaveAccessibleName('Like. 2 likes');
  const u = new URL((await req).url());
  expect([u.searchParams.get('log'), u.searchParams.get('owner')]).toEqual([`eq.${LOGS[0].id}`, `eq.${ME.id}`]);
  req = sent(page, 'POST', 'likes');
  await like.click();
  expect((await req).postDataJSON()).toEqual({ log: LOGS[0].id });
  await expect(like).toHaveAccessibleName('Like. 3 likes');
  // the database says no (300 a day): back as it was, and why
  await page.route(u => u.origin === SB_URL && u.pathname === '/rest/v1/likes', route => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'That’s 300 likes today, the most for one day.' }) }));
  const waves = post(page, 'read The Waves').getByRole('button', { name: /^Like/ });
  await waves.click();
  await expect(page.locator('#toast')).toHaveText('That’s 300 likes today, the most for one day.');
  await expect(waves).toHaveAttribute('aria-pressed', 'false');
  await expect(waves).toHaveAccessibleName('Like. 1 like');
});

test('me too: logs the same title for you at once; a title you\'ve logged says Me too in grey, with no button', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo'), req = sent(page, 'POST', 'logs');
  await p.getByRole('button', { name: /^Me too/ }).click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg',
    review: '', rating: null, spoiler: false, rewatch: false, metoo_of: LOGS[0].id });
  await expect(page.locator('#toast')).toHaveText('Logged Gummo. It’s on the feed.');
  // The Waves: logged already (post_stats says so)
  const waves = post(page, 'read The Waves');
  await expect(waves.getByRole('button', { name: /^Me too/ })).toHaveCount(0);
  await expect(waves.locator('.state.metoo')).toContainText('Me too');
  // your own post has no me too
  await expect(post(page, 'read Just Kids').getByRole('button', { name: /^Me too/ })).toHaveCount(0);
});

test('a review with spoilers is blurred until it\'s pressed', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'read The Waves'), text = p.locator('.sayt');
  await expect(text).toHaveAttribute('aria-hidden', 'true');
  expect(await text.evaluate(el => getComputedStyle(el).filter)).toContain('blur');
  await p.getByRole('button', { name: 'Show the review. It has spoilers.' }).click();
  await expect(text).not.toHaveAttribute('aria-hidden', 'true');
  expect(await text.evaluate(el => getComputedStyle(el).filter)).toBe('none');
  await expect(p.getByText('The last page.')).toBeVisible();
});

test('Share copies the post\'s own address', async ({ page, context }) => {
  test.skip(isPhone(), 'a phone opens its own share sheet');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  await post(page, 'watched Gummo').getByRole('button', { name: /^Share/ }).click();
  await expect(page.locator('#toast')).toHaveText('Link copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/p/\\?${LOGS[0].id}$`));
});

test('···: Report on someone else\'s post; Delete on yours, which asks first', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const theirs = post(page, 'watched Gummo');
  await theirs.getByRole('button', { name: 'More for this post' }).click();
  await expect(theirs.getByRole('menuitem')).toHaveText(['Report']);
  const rep = sent(page, 'POST', 'reports');
  await theirs.getByRole('menuitem', { name: 'Report' }).click();
  expect((await rep).postDataJSON()).toEqual({ target_type: 'log', target_id: LOGS[0].id });
  await expect(page.locator('#toast')).toHaveText('Reported. Thanks.');
  const mine = post(page, 'read Just Kids');
  await mine.getByRole('button', { name: 'More for this post' }).click();
  await expect(mine.getByRole('menuitem')).toHaveText(['Delete']);
  await mine.getByRole('menuitem', { name: 'Delete' }).click();
  const ask = page.getByRole('dialog', { name: 'Delete your post about Just Kids?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(mine).toBeVisible();   // nothing was deleted
  await mine.getByRole('button', { name: 'More for this post' }).click();
  await mine.getByRole('menuitem', { name: 'Delete' }).click();
  const del = sent(page, 'DELETE', 'logs');
  await page.getByRole('dialog', { name: 'Delete your post about Just Kids?' }).getByRole('button', { name: 'Delete' }).click();
  expect(new URL((await del).url()).searchParams.get('id')).toBe(`eq.${LOGS[1].id}`);
  await expect(page.locator('#items .item.log').filter({ hasText: 'read Just Kids' })).toHaveCount(0);
  await expect(page.locator('#toast')).toHaveText('Deleted.');
});

test('without 0009: no like, reply, me too or Report; + Watchlist, Share, and Delete on your own', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const theirs = post(page, 'watched Gummo');
  await expect(theirs.locator('.acts').getByRole('button')).toHaveText(['+ Watchlist', 'Share']);
  await expect(theirs.locator('.acts a')).toHaveCount(0);
  await expect(theirs.locator('.stars')).toHaveCount(0);
  const mine = post(page, 'read Just Kids');
  await mine.getByRole('button', { name: 'More for this post' }).click();
  await expect(mine.getByRole('menuitem')).toHaveText(['Delete']);
  expect(errors).toEqual([]);
});

test('signed out: the counts show; like and me too are the sign-in sheet', async ({ page }) => {
  await mockNetwork(page, { social: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo');
  await expect(p.getByRole('button', { name: /^Like/ })).toHaveAccessibleName('Like. 3 likes');
  await expect(p.getByRole('button', { name: /^Like/ })).toHaveAttribute('aria-pressed', 'false');
  let liked = 0; page.on('request', r => { if (r.url().includes('/rest/v1/likes') && r.method() === 'POST') liked++; });
  await p.getByRole('button', { name: /^Like/ }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
  expect(liked).toBe(0);
});
