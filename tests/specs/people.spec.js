// People (/people/; /members/, its old address, goes there): Find @username (find_people, 300 ms after the last key), each person with FOLLOW / FOLLOWING /
// REQUESTED as on a profile, and Recently active: the people behind the newest shelves.
const { test, expect } = require('@playwright/test');
const { PEOPLE, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const box = page => page.getByRole('textbox', { name: 'Find @username' });
const rows = page => page.locator('#found .person');
const searches = page => { const list = []; page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/rpc/find_people')) list.push(r.postDataJSON().q); }); return list; };
const [, mira, long] = PEOPLE;

test('Find @username: one search 300 ms after the last key; a person found has photo, name, @username and FOLLOW', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page, { signedIn: true }), asked = searches(page);
  await open(page, '/people/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('People');
  await expect(page.locator('header.top .links').getByRole('link', { name: 'People', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(rows(page)).toHaveCount(0);
  await box(page).pressSequentially('mira', { delay: 40 });   // quicker than the wait: nothing is asked until the typing stops
  expect(asked).toEqual([]);
  await expect(rows(page)).toHaveCount(1);
  expect(asked).toEqual(['mira']);
  const row = rows(page).first();
  await expect(row.locator('.pn b')).toHaveText('Mira');
  await expect(row.locator('.pn span')).toHaveText('@mira');
  await expect(row.locator('.pn')).toHaveAttribute('href', '../u/?mira');
  await expect(row.locator('.pa img')).toHaveCount(1);
  await expect(row.getByRole('button')).toHaveText('Following');   // the made-up account follows @mira
  await expect(page).toHaveURL(/\/people\/\?q=mira$/);
  // someone not followed: FOLLOW follows them
  await box(page).fill('@long');
  await expect(row.locator('.pn span')).toHaveText('@longusername_twenty1');
  const follow = row.getByRole('button');
  await expect(follow).toHaveText('Follow');
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  const sent = page.waitForRequest(r => r.url().includes('/rpc/follow'));
  await follow.click();
  expect((await sent).postDataJSON()).toEqual({ target: long.id });
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  if (!isPhone()) {
    await expect(follow).toHaveText('Following');   // it says so until the pointer leaves and comes back
    await page.mouse.move(0, 0);
    await follow.hover();
    await expect(follow).toHaveText('Unfollow');    // and then a click unfollows
    const undone = page.waitForRequest(r => r.url().includes('/rpc/unfollow'));
    await follow.click();
    expect((await undone).postDataJSON()).toEqual({ target: long.id });
    await expect(follow).toHaveAttribute('aria-pressed', 'false');
  }
  // you: no FOLLOW beside yourself. A display name finds people too.
  await box(page).fill('test p');
  await expect(row.locator('.pn span')).toHaveText('@tester');
  await expect(row.getByRole('button')).toHaveCount(0);
  // no one, then nothing typed
  await box(page).fill('zzz');
  await expect(page.locator('#findState')).toHaveText('No one called “zzz”.');
  await expect(rows(page)).toHaveCount(0);
  await box(page).fill('');
  await expect(page.locator('#findState')).toBeHidden();
  await expect(page).toHaveURL(/\/people\/$/);
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

test('Enter searches at once, and the search is kept in the address', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  const asked = searches(page);
  await open(page, '/people/');
  await box(page).fill('m');
  await box(page).press('Enter');
  await expect(rows(page)).toHaveCount(1);
  expect(asked).toEqual(['m']);
  await page.waitForTimeout(450);
  expect(asked).toEqual(['m']);   // the wait that Enter cut short doesn't ask again
  await page.reload();
  await expect(box(page)).toHaveValue('m');
  await expect(rows(page)).toHaveCount(1);
});

test('signed out: FOLLOW opens sign-in, and the follow is finished once you are back', async ({ page }) => {
  await mockNetwork(page);
  await open(page, '/people/?q=mi');
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().getByRole('button', { name: 'Follow' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Sign in to follow @mira.');
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('shelfstackd-follow')))).toMatchObject({ id: mira.id, username: 'mira' });
});

test('back from signing in, a FOLLOW that was waiting is done', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await page.addInitScript(p => { if (!sessionStorage.getItem('once')){ sessionStorage.setItem('once', '1'); sessionStorage.setItem('shelfstackd-follow', JSON.stringify({ id: p.id, username: p.username, at: Date.now() })); } }, long);
  const sent = page.waitForRequest(r => r.url().includes('/rpc/follow'));
  await page.goto('/people/?q=long');
  expect((await sent).postDataJSON()).toEqual({ target: long.id });
  await expect(page.locator('#toast')).toHaveText('You follow @longusername_twenty1 now.');
  expect(await page.evaluate(() => sessionStorage.getItem('shelfstackd-follow'))).toBeNull();
});

test('Recently active: the people behind the newest shelves, each once', async ({ page }) => {
  await mockNetwork(page);
  const feed = page.waitForRequest(r => r.url().includes('/rpc/feed'));
  await open(page, '/people/');
  expect((await feed).postDataJSON()).toEqual({ scope: 'everyone', before: null, before_id: null, n: 50 });
  await expect(page.locator('#activeSec h2')).toHaveText('Recently active');
  const people = page.locator('#active li');
  await expect(people).toHaveCount(3);
  await expect(people.locator('a span:last-child')).toHaveText(['@tester', '@mira', '@longusername_twenty1']);
  await expect(people.nth(1).locator('a')).toHaveAttribute('href', '../u/?mira');
  await expect(people.nth(1).locator('img')).toHaveCount(1);
});

test('Find @username: the username as typed first, then those starting with it, whatever order the database gives', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  // the database answers with the closest one last
  await page.route(/\/rpc\/find_people/, route => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json',
    body: JSON.stringify(['mirabel', 'amira', 'mira'].map((username, i) => ({ id: `4444444${i}-4444-4444-8444-444444444444`, username, display_name: username === 'amira' ? 'Mira A' : '', avatar_key: null, is_private: false, follow_state: 'none', follows_you: false }))) }));
  await open(page, '/people/');
  await box(page).fill('mira');
  await expect(page.locator('#found li')).toHaveCount(3);
  await expect(page.locator('#found li')).toContainText(['@mira', /@(mirabel|amira)/, /@(mirabel|amira)/]);
  await expect(page.locator('#found li').nth(1)).toContainText('@mirabel');   // starts with it; amira's name only has it
});

test('/members/, its old address, goes on to /people/, with a search kept', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await page.goto('/members/?q=mira');
  await expect(page).toHaveURL(/\/people\/\?q=mira$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('People');
});
