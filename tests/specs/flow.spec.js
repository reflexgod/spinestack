// The whole way through, as a new person on a 390px phone and on a computer: sign up, build a shelf, log a film with a
// review, edit it, recommend it to a friend, share it as a story, search, open a title's page, follow someone. Every
// step's answer is checked, and nothing is said in the console the whole way (no error, no warning).
const { test, expect } = require('@playwright/test');
const { MUTUALS, NEW_LOG, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');

test('sign up, build a shelf, log a film with a review, edit it, recommend it, share it as a story, search, a title, follow', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  const net = await mockNetwork(page, { signedIn: true, signup: true, ownShelf: false, social: true, recs: true, ids: true });
  // a phone that can share files: what it was given
  if (isPhone()) await page.addInitScript(() => {
    window.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__shared.push(d.files.map(f => `${f.name} ${f.type}`)); } });
  });
  const asked = (method, p) => page.waitForRequest(r => r.method() === method && new URL(r.url()).pathname === p);

  // 1. sign up: signed in with Google, no username yet, so the builder asks for one
  await open(page, '/');
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(page.locator('#uname')).toBeVisible();
  await page.locator('#uname').fill('tester');
  await expect(page.locator('#unameNote')).toHaveText('@tester is free.');
  await page.locator('#adult').check();
  const made = asked('POST', '/rest/v1/profiles');
  await page.locator('#nameBtn').click();
  expect((await made).postDataJSON()).toMatchObject({ username: 'tester' });
  await expect(page.locator('#toast')).toHaveText('Welcome, @tester.');
  await expect(page.locator('#acctBtn')).toBeVisible();

  // 2. build a shelf: + ADD, Put on shelf, Gummo, Add to shelf, Save
  await page.locator('header.top .add').click();
  const d = page.locator('#addDialog');
  await d.getByRole('radio', { name: 'Put on shelf' }).check();
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  await d.getByRole('button', { name: 'Add to shelf' }).click();
  await expect(d).toBeHidden();
  await expect(page.locator('#books .book .bt')).toHaveText(['Gummo']);
  const saved = asked('POST', '/rest/v1/rpc/save_shelf');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).postDataJSON().items.map(i => i.title)).toEqual(['Gummo']);
  await expect(page).toHaveURL(/\/u\/\?tester&shelf=/);

  // 3. log a film with a review, from the feed's box
  await open(page, '/feed/?everyone');
  const box = page.locator('#compose');
  await box.getByRole('combobox', { name: 'What did you watch or read?' }).fill('kids');
  await box.getByRole('option').filter({ hasText: 'Larry Clark' }).click();
  const slider = box.getByRole('slider');
  await slider.focus(); for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '8');
  await box.locator('textarea').fill('Hard to watch.');
  const logged = asked('POST', '/rest/v1/logs');
  await box.getByRole('button', { name: 'Post' }).click();
  expect((await logged).postDataJSON()).toMatchObject({ kind: 'movie', title: 'Kids', year: 1995, rating: 8, review: 'Hard to watch.', tmdb_id: 9344 });
  await expect(page.locator('#toast')).toHaveText('Logged Kids. It’s on the feed.');
  const mine = page.locator(`#items .post[data-id="${NEW_LOG}"]`);
  await expect(mine).toBeVisible();
  await expect(mine.locator('.say')).toHaveText('Hard to watch.');

  // 4. edit it: ···, Edit, a new line, Save; "edited" beside the time
  await mine.getByRole('button', { name: 'More for this post' }).click();
  await mine.getByRole('menuitem', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit your post about Kids (1995)' });
  await expect(edit.locator('textarea')).toHaveValue('Hard to watch.');
  await edit.locator('textarea').fill('Hard to watch. Glad I did.');
  const patched = asked('PATCH', '/rest/v1/logs');
  await edit.getByRole('button', { name: 'Save' }).click();
  expect((await patched).postDataJSON()).toMatchObject({ review: 'Hard to watch. Glad I did.', rating: 8 });
  const again = page.locator(`#items .post[data-id="${NEW_LOG}"]`);
  await expect(again.locator('.say')).toHaveText('Hard to watch. Glad I did.');
  await expect(again.locator('.edited')).toHaveText('edited');

  // 5. recommend it to a friend
  await again.getByRole('button', { name: /^Share/ }).click();
  await again.getByRole('menuitem', { name: 'Recommend' }).click();
  const rec = page.locator('.recsheet');
  await rec.getByRole('checkbox', { name: /@mira/ }).check();
  const sent = asked('POST', '/rest/v1/recs');
  await rec.getByRole('button', { name: 'Send' }).click();
  expect((await sent).postDataJSON()).toMatchObject({ title: 'Kids', receiver: MUTUALS[0].id });
  await expect(page.locator('#toast')).toHaveText('Sent to @mira.');

  // 6. share it as a story: saved on a computer; on a phone, the sheet, then the share sheet
  await again.getByRole('button', { name: /^Share/ }).click();
  if (!isPhone()) {
    const download = page.waitForEvent('download');
    await again.getByRole('menuitem', { name: 'Share to story' }).click();
    expect((await download).suggestedFilename()).toBe('shelfstackd-story.png');
  } else {
    await again.getByRole('menuitem', { name: 'Share to story' }).click();
    await page.locator('#storySheet').getByRole('button', { name: 'Share' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([['shelfstackd-story.png image/png']]);
  }

  // 7. search, and 8. a title's page
  await page.locator('header.top .find').click();
  await page.locator('#srchQ').fill('gummo');
  await page.locator('.srch .sr').filter({ hasText: 'Gummo' }).first().click();
  await expect(page).toHaveURL(/\/t\/\?film=106/);
  await expect(page.locator('#tName')).toHaveText('Gummo 1997');
  await expect(page.locator('#tBy')).toHaveText('dir. Harmony Korine · 89 min');
  await expect(page.locator('#revSec .tabs [role=tab]:not([hidden])')).toHaveText(['From friends', 'Most liked', 'Newest']);

  // 9. follow someone: from the title's shelves, to a profile, Follow
  await open(page, '/u/?longusername_twenty1');
  const follow = page.locator('#followBtn');
  await expect(follow).toHaveText('Follow');
  const followed = asked('POST', '/rest/v1/rpc/follow');
  await follow.click();
  expect((await followed).postDataJSON()).toEqual({ target: '33333333-3333-4333-8333-333333333333' });
  await expect(follow).toHaveText(/Following|Unfollow/);

  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});
