// A post's own page, /p/?<log id>: the post as the feed has it, its review in full, then with migration 0009 its
// replies, oldest first, and a box to reply in (280). Delete on your own reply (after a yes), Report on someone else's.
const { test, expect } = require('@playwright/test');
const { LOGS, REPLIES, mockNetwork, watchErrors, open } = require('../site');

const GUMMO = `/p/?${LOGS[0].id}`;
const sent = (page, method, table) => page.waitForRequest(r => r.method() === method && new URL(r.url()).pathname === '/rest/v1/' + table);

test('the post, with its replies oldest first and a box to reply in', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, GUMMO);
  await expect(page).toHaveTitle('@mira watched Gummo · shelfstackd');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('@mira watched Gummo');
  const p = page.locator('#thePost .item.log');
  await expect(p.locator('.line')).toContainText('@mira watched Gummo');
  await expect(p.locator('.say')).toHaveText('The bathtub scene. Still thinking about it.');
  expect(Math.round((await p.locator('.cover canvas').boundingBox()).width)).toBe(120);   // larger than on the feed
  await expect(page.getByRole('heading', { name: 'Replies' })).toBeVisible();
  const replies = page.locator('#rlist li');
  await expect(replies).toHaveCount(2);
  await expect(replies.locator('.rt')).toHaveText(REPLIES.map(r => r.text));
  await expect(replies.first().locator('.rl')).toContainText('@longusername_twenty1');
  await expect(replies.first().getByRole('button')).toHaveText(['Report']);   // someone else's
  await expect(replies.nth(1).getByRole('button')).toHaveText(['Delete']);   // yours
  // reply
  const box = page.getByRole('textbox', { name: 'Reply' });
  await expect(box).toHaveAttribute('maxlength', '280');
  await box.fill('  The ending.  ');
  const req = sent(page, 'POST', 'replies');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  expect((await req).postDataJSON()).toEqual({ log: LOGS[0].id, text: 'The ending.' });
  await expect(replies).toHaveCount(3);
  await expect(replies.nth(2).locator('.rt')).toHaveText('The ending.');
  await expect(replies.nth(2).locator('.rl')).toContainText('@tester');
  await expect(box).toHaveValue('');
  await expect(p.getByRole('link', { name: /^Reply\. / })).toHaveAccessibleName('Reply. 3 replies');   // the count on the post goes up with it
  expect(errors).toEqual([]);
});

test('#reply puts the caret in the box; the feed\'s reply goes there', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/feed/?everyone');
  await page.locator('#items .item.log').first().getByRole('link', { name: /^Reply\. / }).click();
  await expect(page).toHaveURL(new RegExp(`/p/\\?${LOGS[0].id}#reply$`));
  await expect(page.getByRole('textbox', { name: 'Reply' })).toBeFocused();
});

test('Delete on your reply asks first; Report on someone else\'s', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, GUMMO);
  const replies = page.locator('#rlist li');
  await replies.nth(1).getByRole('button', { name: 'Delete' }).click();
  const ask = page.getByRole('dialog', { name: 'Delete this reply?' });
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(replies).toHaveCount(2);
  await replies.nth(1).getByRole('button', { name: 'Delete' }).click();
  const del = sent(page, 'DELETE', 'replies');
  await page.getByRole('dialog', { name: 'Delete this reply?' }).getByRole('button', { name: 'Delete' }).click();
  expect(new URL((await del).url()).searchParams.get('id')).toBe(`eq.${REPLIES[1].id}`);
  await expect(replies).toHaveCount(1);
  const rep = sent(page, 'POST', 'reports');
  await replies.first().getByRole('button', { name: 'Report' }).click();
  expect((await rep).postDataJSON()).toEqual({ target_type: 'reply', target_id: REPLIES[0].id });
  await expect(replies.first().getByRole('button', { name: 'Reported' })).toBeDisabled();
});

test('signed out: the post and its replies, and Sign in to reply', async ({ page }) => {
  await mockNetwork(page, { social: true });
  await open(page, GUMMO);
  await expect(page.locator('#rlist li')).toHaveCount(2);
  await expect(page.locator('#rlist').getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Reply' })).toBeHidden();
  await page.locator('#rsign').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
});

test('without 0009: the post alone, no replies', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, GUMMO);
  await expect(page.locator('#thePost .item.log')).toHaveCount(1);
  await expect(page.locator('#replies')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a post that isn\'t there says so', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, '/p/?00000000-0000-4000-8000-000000000000');
  await expect(page.locator('#state')).toHaveText('This post isn’t here. It was deleted, or it’s a private profile’s.');
  await open(page, '/p/');
  await expect(page.locator('#state')).toHaveText('This post isn’t here. It was deleted, or it’s a private profile’s.');
});
