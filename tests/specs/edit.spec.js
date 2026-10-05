// Editing your own log (the proposed 0011, docs/proposed-0011-ids-edits.sql; mockNetwork's ids): Edit beside Delete in
// a post's ···, the composer's fields filled in on a sheet, Save, and "edited" in grey beside the time, with its likes
// and replies still on it. On the title page, Your review edits the log you have, so a rating first and the review
// later is one log. Without 0011 there's no Edit; nobody else's post has one.
const { test, expect } = require('@playwright/test');
const { ME, LOGS, NEW_LOG, STATS, mockNetwork, watchErrors, open } = require('../site');

const mine = LOGS.find(l => l.owner === ME.id && l.title === 'Just Kids');
const feedPost = (page, text) => page.locator('#items .post').filter({ hasText: text }).first();
const patch = (page, table = 'logs') => page.waitForRequest(r => r.method() === 'PATCH' && new URL(r.url()).pathname === '/rest/v1/' + table);
const posted = page => page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/logs');
const rate = async (page, slider, n) => { await slider.focus(); await page.keyboard.press('Home'); for (let i = 0; i < n; i++) await page.keyboard.press('ArrowRight'); };

test('the feed: Edit next to Delete on your post; the same fields filled in; Save; "edited" beside the time, likes and replies kept', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true, ids: true });
  // your post has a like and a reply here, to see them stay
  STATS[mine.id] = { ...STATS[mine.id], likes: 2, replies: 1 };
  try {
    await open(page, '/feed/?everyone');
    let p = feedPost(page, 'read Just Kids');
    await expect(p.locator('.edited')).toHaveCount(0);
    await p.getByRole('button', { name: 'More for this post' }).click();
    await expect(p.getByRole('menuitem')).toHaveText(['Edit', 'Delete']);
    await p.getByRole('menuitem', { name: 'Edit' }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit your post about Just Kids (2010)' });
    await expect(sheet).toBeVisible();
    // what the post has, filled in
    const review = sheet.getByRole('textbox', { name: /Review/ });
    await expect(review).toHaveValue('For the train.');
    await expect(sheet.getByRole('slider', { name: 'Rating' })).toHaveAttribute('aria-valuenow', '0');
    await expect(sheet.locator('input[name=day]')).toHaveValue('2026-09-27');
    await expect(sheet.getByRole('checkbox', { name: 'Reread' })).not.toBeChecked();
    // a rating, the review changed, a reread
    await rate(page, sheet.getByRole('slider', { name: 'Rating' }), 7);
    await review.fill('For the train, and again on the way back.');
    await sheet.getByText('Reread').click();
    const req = patch(page);
    await sheet.getByRole('button', { name: 'Save' }).click();
    const r = await req;
    expect(new URL(r.url()).searchParams.get('id')).toBe(`eq.${mine.id}`);
    expect(new URL(r.url()).searchParams.get('owner')).toBe(`eq.${ME.id}`);
    expect(r.postDataJSON()).toEqual({ review: 'For the train, and again on the way back.', rating: 7, spoiler: false, rewatch: true, watched_on: '2026-09-27' });
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('#toast')).toHaveText('Saved.');
    p = feedPost(page, 'read Just Kids');
    await expect(p.locator('.say')).toHaveText('For the train, and again on the way back.');
    await expect(p.locator('.prating [role=img]')).toHaveAttribute('aria-label', '3.5 of 5');
    await expect(p.locator('.pwhat .tag')).toHaveText('reread');
    // "edited", small and grey, beside the time; the time still goes to the post
    const edited = p.locator('.phead .edited');
    await expect(edited).toHaveText('edited');
    expect(await edited.evaluate(e => getComputedStyle(e).color)).toBe('rgb(107, 107, 107)');
    await expect(p.locator('.phead .ago a')).toHaveAttribute('href', new RegExp(`/p/\\?${mine.id}$`));
    // the likes and the reply are still on it
    await expect(p.getByRole('button', { name: /^Like\. 2 likes/ })).toBeVisible();
    await expect(p.getByRole('link', { name: /^Reply\. 1 reply/ })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { STATS[mine.id] = { ...STATS[mine.id], likes: 0, replies: 0 }; }
});

test('Cancel and Esc leave the post as it was; someone else\'s post has no Edit; without 0011 yours has Delete only', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, ids: true });
  await open(page, '/feed/?everyone');
  const p = feedPost(page, 'read Just Kids');
  await p.getByRole('button', { name: 'More for this post' }).click();
  await p.getByRole('menuitem', { name: 'Edit' }).click();
  const sheet = page.getByRole('dialog', { name: /^Edit your post/ });
  await sheet.getByRole('textbox', { name: /Review/ }).fill('Never mind.');
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(p.locator('.say')).toHaveText('For the train.');
  await p.getByRole('button', { name: 'More for this post' }).click();
  await p.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  const theirs = feedPost(page, 'watched Gummo');
  await theirs.getByRole('button', { name: 'More for this post' }).click();
  await expect(theirs.getByRole('menuitem')).toHaveText(['Report']);
  // a database without 0011
  await mockNetwork(page, { signedIn: true, social: true });
  await page.evaluate(() => { sessionStorage.removeItem('shelfstackd-0011'); });
  await open(page, '/feed/?everyone');
  const p2 = feedPost(page, 'read Just Kids');
  await p2.getByRole('button', { name: 'More for this post' }).click();
  await expect(p2.getByRole('menuitem')).toHaveText(['Delete']);
});

test('a post\'s own page: Edit there too, and the replies stay under it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, ids: true });
  await open(page, `/p/?${mine.id}`);
  const p = page.locator('#thePost .post');
  await p.getByRole('button', { name: 'More for this post' }).click();
  await p.getByRole('menuitem', { name: 'Edit' }).click();
  const sheet = page.getByRole('dialog', { name: /^Edit your post/ });
  await sheet.getByRole('textbox', { name: /Review/ }).fill('Reread it.');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#thePost .post .say')).toHaveText('Reread it.');
  await expect(page.locator('#thePost .post .edited')).toHaveText('edited');
  await expect(page.locator('#thePost .post')).toHaveClass(/whole/);
});

test('the title page: Your review is your log, filled in, and Save edits it', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, ids: true });
  await open(page, '/t/?book=OL5W');   // Just Kids: you read it
  const yours = page.locator('#yours');
  await expect(yours).toBeVisible();
  await expect(yours.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(yours.getByRole('button', { name: 'Post' })).toHaveCount(0);
  const review = yours.getByRole('textbox', { name: /Review/ });
  await expect(review).toHaveValue('For the train.');
  await review.fill('For the train. Then the whole night.');
  const req = patch(page);
  let posts = 0; page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/logs') posts++; });
  await yours.getByRole('button', { name: 'Save' }).click();
  expect(new URL((await req).url()).searchParams.get('id')).toBe(`eq.${mine.id}`);
  await expect(page.locator('#toast')).toHaveText('Saved.');
  const post = page.locator('#revList .post').filter({ hasText: '@tester' });
  await expect(post.locator('.say')).toHaveText('For the train. Then the whole night.');
  await expect(post.locator('.edited')).toHaveText('edited');
  expect(posts).toBe(0);   // no second log
});

test('the title page: a rating first, the review later, is one log', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true, ids: true });
  await open(page, '/t/?film=106&title=Gummo&year=1997');   // you haven't logged Gummo
  const yours = page.locator('#yours');
  await rate(page, yours.getByRole('slider', { name: 'Rating' }), 8);
  let req = posted(page);
  await yours.getByRole('button', { name: 'Post' }).click();
  expect((await req).postDataJSON()).toMatchObject({ rating: 8, review: '', tmdb_id: 106 });
  // now it's yours: Save, with your rating in it
  await expect(yours.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(yours.getByRole('slider', { name: 'Rating' })).toHaveAttribute('aria-valuenow', '8');
  await expect(page.getByRole('group', { name: 'What to do with it' }).locator('.state').first()).toHaveText(/^Logged /);
  let posts = 0; page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/logs') posts++; });
  await yours.getByRole('textbox', { name: /Review/ }).fill('Odd and tender.');
  req = patch(page);
  await yours.getByRole('button', { name: 'Save' }).click();
  const r = await req;
  expect(new URL(r.url()).searchParams.get('id')).toBe(`eq.${NEW_LOG}`);
  expect(r.postDataJSON()).toMatchObject({ rating: 8, review: 'Odd and tender.' });
  expect(posts).toBe(0);
});

test('without 0011, Your review goes once you\'ve logged it, as before', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/t/?book=OL5W');
  await expect(page.locator('#yours')).toBeHidden();
});
