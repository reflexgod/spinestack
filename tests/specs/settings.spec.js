// Settings (/settings/): yours only. Profile (display name, bio, main shelf), Photo (cut square, made small, sent to
// the Worker), Account (private profile). The profile page's Edit profile goes here.
const { test, expect } = require('@playwright/test');
const { ME, SHELVES, PICTURE, WORKER, mockNetwork, watchErrors, open } = require('../site');

const patch = page => page.waitForRequest(r => r.method() === 'PATCH' && r.url().includes('/rest/v1/profiles?id=eq.' + ME.id));
const tabs = page => page.getByRole('tablist', { name: 'Settings' }).getByRole('tab');
const photo = { name: 'me.png', mimeType: 'image/png', buffer: PICTURE };

test('signed out, settings asks you to sign in', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page);
  await open(page, '/settings/');
  await expect(page.locator('#signSheet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeFocused();
  await expect(page.locator('#page')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#gate')).toHaveText(/Sign in to change your settings/);
  await page.locator('#gate').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#signSheet')).toBeVisible();
  expect(errors).toEqual([]);
});

test('signed in with no username yet, settings sends you to finish signing up', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, named: false });
  await open(page, '/settings/');
  await expect(page.locator('#page')).toBeHidden();
  await expect(page.locator('#gate')).toHaveText(/Pick a username first/);
  await expect(page.locator('#gate').getByRole('link', { name: 'Finish sign-up' })).toHaveAttribute('href', '../build/');
});

test('the tabs are Profile · Photo · Account; #photo and #account open theirs', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/settings/');
  await expect(tabs(page)).toHaveText(['Profile', 'Photo', 'Account']);
  await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panelP')).toBeVisible();
  await page.getByRole('tab', { name: 'Account' }).click();
  await expect(page).toHaveURL(/\/settings\/#account$/);
  await expect(page.locator('#panelA')).toBeVisible();
  await expect(page.locator('#panelP')).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Photo' })).toHaveAttribute('aria-selected', 'true');
  await open(page, '/settings/#photo');
  await expect(page.locator('#panelH')).toBeVisible();
  await expect(page.locator('#panelP')).toBeHidden();
});

test('Profile: your name and bio are there, and Save sends those two (one shelf each: no main shelf to pick)', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/settings/');
  const name = page.getByRole('textbox', { name: 'Display name' }), bio = page.getByRole('textbox', { name: 'Bio' });
  await expect(name).toHaveValue('Test Person');
  await expect(bio).toHaveValue('A made-up account for the tests.');
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByText(/main shelf/i)).toHaveCount(0);
  await expect(page.locator('#unameRO')).toHaveText('@tester');
  await expect(page.locator('#panelP').getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '../u/?tester');
  await name.fill('  New Name  ');
  await bio.fill('Books now.');
  await expect(page.locator('#bioCount')).toHaveText('10 / 160');
  const sent = patch(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await sent).postDataJSON()).toEqual({ display_name: 'New Name', bio: 'Books now.' });
  await expect(page.locator('#toast')).toHaveText('Profile saved.');
  await expect(name).toHaveValue('New Name');
  expect(errors).toEqual([]);
});

test('Photo: a photo is cut square, made small, sent to the Worker and saved; the bar shows it', async ({ page }) => {
  const errors = watchErrors(page), net = await mockNetwork(page, { signedIn: true });
  await open(page, '/settings/#photo');
  await expect(page.locator('#ava')).toHaveText('T');           // no photo yet: your initial
  await expect(page.getByRole('button', { name: 'Remove' })).toBeHidden();
  await expect(page.locator('#cropWrap')).toBeHidden();
  // something that isn't a photo
  await page.locator('#photoFile').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('#photoNote')).toHaveText('Pick a JPG, PNG or WEBP photo.');
  await expect(page.locator('#cropWrap')).toBeHidden();
  // a photo: the frame comes up over it
  await page.locator('#photoFile').setInputFiles(photo);
  await expect(page.locator('#cropBox .cropper-container')).toBeVisible();
  await expect(page.locator('#photoNote')).toHaveText('');
  const frame = await page.locator('#cropBox .cropper-crop-box').boundingBox();
  expect(Math.abs(frame.width - frame.height)).toBeLessThan(1);   // square
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.locator('#cropBox').focus();
  await page.keyboard.press('ArrowLeft');
  // Save photo: the picture goes to the Worker, then its key onto the profile
  const upload = page.waitForRequest(r => r.method() === 'POST' && r.url().includes('/m/upload?kind=avatar')), sent = patch(page);
  await page.getByRole('button', { name: 'Save photo' }).click();
  const up = await upload, body = up.postDataBuffer();
  expect(up.url().startsWith(WORKER + '/')).toBe(true);
  expect(up.headers()['content-type']).toBe('image/webp');
  expect(body.length).toBeGreaterThan(100);
  expect(body.length).toBeLessThan(2 * 1024 * 1024);              // the Worker's limit
  expect(body.subarray(0, 4).toString()).toBe('RIFF');
  const key = (await sent).postDataJSON().avatar_key;
  expect(key).toBe(`${ME.id}/-m-upload`);
  await expect(page.locator('#toast')).toHaveText('Photo saved.');
  await expect(page.locator('#cropWrap')).toBeHidden();
  await expect(page.locator('#ava img')).toHaveAttribute('src', new RegExp('/m/img\\?k=' + encodeURIComponent(key)));
  await expect(page.locator('#acctBtn .ava img')).toHaveCount(1);   // the bar's photo too
  // Remove: a second press does it
  const remove = page.getByRole('button', { name: /Remove/ });
  await remove.click();
  await expect(remove).toHaveText('Sure? Remove');
  const cleared = patch(page);
  await remove.click();
  expect((await cleared).postDataJSON()).toEqual({ avatar_key: null });
  await expect(page.locator('#toast')).toHaveText('Photo removed.');
  await expect(page.locator('#ava')).toHaveText('T');
  expect(errors).toEqual([]);
  expect(net.unknown).toEqual([]);
});

test('Photo: Cancel puts the frame away and nothing is sent', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/settings/#photo');
  let posts = 0; page.on('request', r => { if (r.method() === 'POST' && r.url().startsWith(WORKER)) posts++; });
  await page.locator('#photoFile').setInputFiles(photo);
  await expect(page.locator('#cropBox .cropper-container')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#cropWrap')).toBeHidden();
  await expect(page.locator('#cropBox')).toBeEmpty();
  expect(posts).toBe(0);
});

test('Account: the private profile switch saves as it is switched', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/settings/#account');
  const sw = page.getByRole('switch', { name: 'Private profile' });
  await expect(sw).not.toBeChecked();
  let sent = patch(page);
  await sw.click();
  expect((await sent).postDataJSON()).toEqual({ is_private: true });
  await expect(page.locator('#toast')).toHaveText('Your profile is private now.');
  await expect(sw).toBeChecked();
  await expect(sw).toBeFocused();
  sent = patch(page);
  await page.keyboard.press('Space');
  expect((await sent).postDataJSON()).toEqual({ is_private: false });
  await expect(sw).not.toBeChecked();
  // there's no delete button: the page says how to ask
  await expect(page.locator('#panelA').getByRole('button')).toHaveCount(0);
  await expect(page.locator('#panelA')).toContainText('To delete your account, email');
  expect(errors).toEqual([]);
});

test('your profile: Edit profile, + photo and add a bio go to settings, and the old sheet is gone', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?tester');
  const edit = page.getByRole('link', { name: 'Edit profile' });
  await expect(edit).toBeVisible();
  await expect(edit).toHaveAttribute('href', '../settings/');
  await expect(page.locator('#ava').getByRole('link', { name: '+ photo' })).toHaveAttribute('href', '../settings/#photo');
  await expect(page.locator('#editSheet')).toHaveCount(0);
  await edit.click();
  await expect(page).toHaveURL(/\/settings\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  // someone else's profile has no Edit profile
  await open(page, '/u/?mira');
  await expect(page.getByRole('link', { name: 'Edit profile' })).toBeHidden();
});
