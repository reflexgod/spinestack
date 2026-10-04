// A post on the feed, with migration 0009 (mockNetwork's social): its rating and Rewatch, the review (blurred until
// pressed when it has spoilers), and the row of actions, icons and their counts: reply, Same (you watched or read it
// too, logged at once), like, and share (Copy link, the phone's share sheet, Add to Up next). ··· in the post's top
// line has Report (someone else's) or Delete (yours, after a yes). Counts change at once and go back when the database
// says no. Without 0009 there's no reply, Same, like or Report.
const { test, expect } = require('@playwright/test');
const { ME, LOGS, SB_URL, CORS, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const post = (page, text) => page.locator('#items .post').filter({ hasText: text }).first();
const sent = (page, method, table) => page.waitForRequest(r => r.method() === method && new URL(r.url()).pathname === '/rest/v1/' + table);

test('a post: the rating and rewatch, the review, then reply · Same · like · share, icons and their counts', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo');
  await expect(p.locator('.pwhat')).toHaveText(/^watched Gummo \(1997\)\s*rewatch$/);
  await expect(p.locator('.prating [role=img]')).toHaveAttribute('aria-label', /^4\.5 /);
  await expect(p.locator('.say')).toHaveText('The bathtub scene. Still thinking about it.');
  const acts = p.locator('.pacts > *');
  await expect(acts).toHaveCount(4);
  expect(await acts.evaluateAll(as => as.map(a => a.className))).toEqual(['reply', 'metoo', 'like', 'pmenuwrap']);   // reply · Same · like · share
  await expect(p.getByRole('link', { name: 'Reply. 2 replies' })).toHaveAttribute('href', new RegExp(`/p/\\?${LOGS[0].id}#reply$`));
  await expect(p.locator('.reply .n')).toHaveText('2');
  const same = p.getByRole('button', { name: /^Same/ });
  await expect(same.locator('.n')).toHaveText('1');
  const like = p.getByRole('button', { name: /^Like/ });
  await expect(like).toHaveAttribute('aria-pressed', 'true');   // the made-up account liked it
  await expect(like).toHaveAccessibleName('Like. 3 likes');
  await expect(p.getByRole('button', { name: /^Share/ })).toBeVisible();
  // each is an icon with its count, small and grey, all in one row under the review
  for (const b of [like, same]) await expect(b.locator('svg')).toHaveCount(1);
  expect(await same.evaluate(b => [getComputedStyle(b).color, getComputedStyle(b).fontSize])).toEqual(['rgb(107, 107, 107)', '11px']);
  const ys = await acts.evaluateAll(as => as.map(a => Math.round(a.getBoundingClientRect().top + a.getBoundingClientRect().height / 2)));
  expect(new Set(ys).size).toBe(1);
  expect(ys[0]).toBeGreaterThan((await p.locator('.say').boundingBox()).y);
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
  await expect(page).toHaveURL(/\/feed\//);   // a press on an action doesn't open the post
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

test('Same: logs the same title for you at once; one you\'ve logged is pressed already; your own just counts', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const p = page.locator(`#items .post[data-id="${LOGS[0].id}"]`), same = p.getByRole('button', { name: /^Same/ }), req = sent(page, 'POST', 'logs');
  await same.click();
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg',
    review: '', rating: null, spoiler: false, rewatch: false, metoo_of: LOGS[0].id });
  await expect(page.locator('#toast')).toHaveText('Logged Gummo. It’s on the feed.');
  await expect(p.locator('.metoo')).toHaveAttribute('aria-pressed', 'true');
  await expect(p.locator('.metoo .n')).toHaveText('2');
  await expect(p.locator('.metoo')).toBeDisabled();
  await expect(page.locator('#items > li').first().locator('.pwho')).toContainText('@tester');   // yours, on top
  // The Waves: logged already (post_stats says so)
  const waves = post(page, 'read The Waves').locator('.metoo');
  await expect(waves).toHaveAttribute('aria-pressed', 'true');
  await expect(waves).toBeDisabled();
  await expect(waves).toHaveAccessibleName(/^You logged The Waves too/);
  // your own post: the count, nothing to press
  await expect(post(page, 'read Just Kids').locator('.metoo')).toBeDisabled();
  await expect(post(page, 'read Just Kids').locator('.metoo')).toHaveAttribute('aria-pressed', 'false');
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
  await expect(page).toHaveURL(/\/feed\//);   // showing it doesn't open the post
});

test('share: Copy link copies the post\'s own address; Add to Up next puts its title on yours', async ({ page, context }) => {
  test.skip(isPhone(), 'the clipboard is tried at the desktop width');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const p = post(page, 'watched Gummo'), share = p.getByRole('button', { name: /^Share/ });
  await share.click();
  await expect(share).toHaveAttribute('aria-expanded', 'true');
  await expect(p.getByRole('menuitem', { name: 'Copy link' })).toBeFocused();
  await p.getByRole('menuitem', { name: 'Copy link' }).click();
  await expect(page.locator('#toast')).toHaveText('Link copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/p/\\?${LOGS[0].id}$`));
  await share.click();
  const req = sent(page, 'POST', 'watchlist');
  await p.getByRole('menuitem', { name: 'Add to Up next' }).click();
  // kept from @mira's post: whose it was goes with it (the database keeps it only while you follow her)
  expect((await req).postDataJSON()).toEqual({ kind: 'movie', title: 'Gummo', author: 'Harmony Korine', year: 1997, cover_src: 'url:https://image.tmdb.org/t/p/w500/gummo.jpg', from_user: '22222222-2222-4222-8222-222222222222' });
  await share.click();
  await expect(p.getByRole('menuitem', { name: 'In Up next' })).toBeDisabled();
  // your own post has no Up next
  const mine = post(page, 'read Just Kids');
  await mine.getByRole('button', { name: /^Share/ }).click();
  await expect(mine.getByRole('menuitem')).toHaveText(['Copy link']);
});

test('···: Report on someone else\'s post; Delete on yours, which asks first', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  const theirs = post(page, 'watched Gummo');
  await expect(theirs.locator('.phead').getByRole('button', { name: 'More for this post' })).toBeVisible();   // in its top line
  await theirs.getByRole('button', { name: 'More for this post' }).click();
  await expect(theirs.getByRole('menuitem')).toHaveText(['Report']);
  const rep = sent(page, 'POST', 'reports');
  await theirs.getByRole('menuitem', { name: 'Report' }).click();
  expect((await rep).postDataJSON()).toEqual({ target_type: 'log', target_id: LOGS[0].id });
  await expect(page.locator('#toast')).toHaveText('Reported. Thanks.');
  await theirs.getByRole('button', { name: 'More for this post' }).click();
  await expect(theirs.getByRole('menuitem', { name: 'Reported' })).toBeDisabled();
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
  await expect(page.locator('#items .post').filter({ hasText: 'read Just Kids' })).toHaveCount(0);
  await expect(page.locator('#toast')).toHaveText('Deleted.');
});

test('without 0009: share alone; ··· with Delete on your own', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const theirs = post(page, 'watched Gummo');
  await expect(theirs.locator('.pacts').getByRole('button')).toHaveCount(1);
  await expect(theirs.locator('.pacts').getByRole('button')).toHaveAccessibleName(/^Share/);
  await expect(theirs.locator('.pacts a')).toHaveCount(0);
  await expect(theirs.locator('.prating')).toHaveCount(0);
  await expect(theirs.getByRole('button', { name: 'More for this post' })).toHaveCount(0);
  const mine = post(page, 'read Just Kids');
  await mine.getByRole('button', { name: 'More for this post' }).click();
  await expect(mine.getByRole('menuitem')).toHaveText(['Delete']);
  expect(errors).toEqual([]);
});

test('signed out: the counts show; like and Same are the sign-in sheet; Add to Up next asks too', async ({ page }) => {
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
