// Invite links: shelfstackd.com/?invite=<username>. The account menu's Invite friends has your link, Copy link and
// Share to WhatsApp. Someone who opens it is told who invited them; once they pick a username they follow that person,
// whose notifications then say so (a new follower).
const { test, expect } = require('@playwright/test');
const { VIRAAJ, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');

test('the account menu: Invite friends, your link, Copy link and Share to WhatsApp', async ({ page, context }) => {
  const errors = watchErrors(page);
  if (!isPhone()) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  await page.locator('#acctBtn').click();
  await page.locator('#acctMenu').getByRole('menuitem', { name: 'Invite friends' }).click();
  const sheet = page.getByRole('dialog', { name: 'Invite friends' });
  await expect(sheet).toBeVisible();
  const link = 'http://127.0.0.1:8181/?invite=tester';
  await expect(sheet.getByRole('textbox', { name: 'Your link' })).toHaveValue(link);
  await expect(sheet.getByRole('link', { name: 'Share to WhatsApp' })).toHaveAttribute('href', 'https://wa.me/?text=' + encodeURIComponent('Come and shelve your films and books with me on shelfstackd: ' + link));
  await expect(sheet.getByRole('button', { name: 'Copy link' })).toBeFocused();
  await sheet.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('#toast')).toHaveText(/^Link copied\.$|^Copy it from the box\.$/);
  if (!isPhone()) expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(errors).toEqual([]);
});

test('opening an invite link: who invited you, over home\'s line; the address loses it, the browser keeps it', async ({ page }) => {
  await mockNetwork(page, {});
  await open(page, '/?invite=viraaj');
  await expect(page.locator('#invited')).toHaveText('@viraaj invited you.');
  await expect(page.locator('#invited a')).toHaveAttribute('href', 'u/?viraaj');
  expect(new URL(page.url()).search).toBe('');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shelfstackd-invite')).name)).toBe('viraaj');
  // a bad name is let go
  await open(page, '/?invite=No%20Such!');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shelfstackd-invite')).name)).toBe('viraaj');
});

test('signing up through an invite: you follow the one who invited you, once, and are told', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, named: false });
  const follows = [];
  page.on('request', r => { if (r.url().endsWith('/rest/v1/rpc/follow')) follows.push(JSON.parse(r.postData())); });
  await page.addInitScript(() => { if (!sessionStorage.getItem('inv')){ sessionStorage.setItem('inv', '1'); localStorage.setItem('shelfstackd-invite', JSON.stringify({ name: 'viraaj', at: Date.now() })); } });
  await open(page, '/build/');
  const name = page.locator('#uname');
  await expect(name).toBeVisible();
  await name.fill('newperson');
  await page.locator('#adult').check();
  await expect(page.locator('#nameBtn')).toBeEnabled();
  await page.locator('#nameBtn').click();
  await expect(page.locator('#toast')).toHaveText('Welcome, @newperson. You follow @viraaj now.');
  expect(follows).toEqual([{ target: VIRAAJ.id }]);
  expect(await page.evaluate(() => localStorage.getItem('shelfstackd-invite'))).toBe(null);
});

test('an invite to yourself, or one too old, follows nobody', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, named: false });
  const follows = [];
  page.on('request', r => { if (r.url().endsWith('/rest/v1/rpc/follow')) follows.push(r.postData()); });
  await page.addInitScript(() => localStorage.setItem('shelfstackd-invite', JSON.stringify({ name: 'viraaj', at: Date.now() - 31 * 864e5 })));
  await open(page, '/build/');
  await page.locator('#uname').fill('newperson');
  await page.locator('#adult').check();
  await page.locator('#nameBtn').click();
  await expect(page.locator('#toast')).toHaveText('Welcome, @newperson.');
  expect(follows).toEqual([]);
});
