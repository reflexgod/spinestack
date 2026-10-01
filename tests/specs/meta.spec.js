// What a browser tab, a home screen and a shared link show: every page's title and description, the icons, the share
// picture; and a profile's and a shelf's title carrying the person's name.
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const { ROOT, SHELVES, mockNetwork, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const files = [...fs.readdirSync(ROOT).filter(f => f.endsWith('.html')),
  ...fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory() && !['tests', 'worker', 'backend', 'node_modules'].includes(d.name) && !d.name.startsWith('.') && fs.existsSync(path.join(ROOT, d.name, 'index.html')))
    .map(d => d.name + '/index.html')];
const tag = (html, re) => (re.exec(html) || [])[1];
// a picture's size, from its first bytes
function sizeOf(file){
  const b = fs.readFileSync(path.join(ROOT, file));
  if (b[0] === 0x89) return [b.readUInt32BE(16), b.readUInt32BE(20)];                       // PNG: IHDR
  for (let i = 2; i < b.length;){ const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xC0 && m <= 0xC2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + len; }   // JPEG: the frame header
  return null;
}

test('every page has its own title and description, the icons and the share picture', () => {
  test.skip(isPhone(), 'reads files, no browser: once is enough');
  expect(files.length).toBeGreaterThanOrEqual(10);
  const titles = new Set();
  for (const f of files) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8'), up = f.includes('/') ? '../' : '';
    const title = tag(html, /<title>([^<]+)<\/title>/), desc = tag(html, /<meta name="description" content="([^"]*)">/);
    expect(title, f).toMatch(/shelfstackd/);
    expect(title, f).not.toBe('shelfstackd');
    expect(titles.has(title), `${f}: "${title}" is another page's title too`).toBe(false); titles.add(title);
    expect(desc, f + ': a description').toBeTruthy();
    expect(desc.length, `${f}: "${desc}"`).toBeGreaterThanOrEqual(50);
    expect(desc.length, `${f}: "${desc}"`).toBeLessThanOrEqual(160);
    expect(desc, f).not.toContain('—');
    // the icons: an SVG, a 32px PNG, and one for a phone's home screen. 404.html is served for any address, so its links start at the root
    const root = f === '404.html' ? '/' : up;
    for (const [rel, file] of [['icon', 'favicon.svg'], ['icon', 'favicon-32.png'], ['apple-touch-icon', 'apple-touch-icon.png']]) {
      expect(html, `${f}: ${file}`).toContain(`<link rel="${rel}" href="${root}${file}"`);
      expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
    }
    if (f === 'admin.html' || f === '404.html') continue;   // not pages anyone shares
    expect(tag(html, /<meta property="og:title" content="([^"]*)">/), f).toBe(title);
    expect(tag(html, /<meta property="og:description" content="([^"]*)">/), f).toBe(desc);
    expect(tag(html, /<meta property="og:image" content="([^"]*)">/), f).toBe('https://shelfstackd.com/og.jpg');
    expect(tag(html, /<meta name="twitter:card" content="([^"]*)">/), f).toBe('summary_large_image');
    expect(tag(html, /<meta name="twitter:image" content="([^"]*)">/), f).toBe('https://shelfstackd.com/og.jpg');
  }
  expect(sizeOf('og.jpg')).toEqual([1200, 630]);
  expect(sizeOf('favicon-32.png')).toEqual([32, 32]);
  expect(sizeOf('apple-touch-icon.png')).toEqual([180, 180]);
  expect(fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8')).toMatch(/^<svg /);
  expect(fs.statSync(path.join(ROOT, 'og.jpg')).size).toBeLessThan(300 * 1024);
});

test('a page\'s icons load, from a folder too', async ({ page }) => {
  await mockNetwork(page);
  for (const at of ['/', '/shelves/']) {
    await open(page, at);
    const got = await page.evaluate(() => Promise.all([...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => fetch(l.href).then(r => `${r.status} ${new URL(l.href).pathname}`))));
    expect(got).toEqual(['200 /favicon.svg', '200 /favicon-32.png', '200 /apple-touch-icon.png']);
  }
});

test('a profile\'s title is the person\'s name, and a shelf\'s is its name and theirs', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  await expect(page).toHaveTitle('Mira (@mira) · shelfstackd');
  expect(await page.locator('meta[name="description"]').getAttribute('content')).toBe('Shelves by Mira (@mira) on shelfstackd.');
  await open(page, `/u/?mira&shelf=${SHELVES[1].id}`);
  await expect(page).toHaveTitle('shelf number 1 by Mira (@mira) · shelfstackd');
  await open(page, '/u/?longusername_twenty1');   // no display name: the username alone
  await expect(page).toHaveTitle('@longusername_twenty1 · shelfstackd');
});
