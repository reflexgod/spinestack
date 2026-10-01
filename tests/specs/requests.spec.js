// Nothing a page asks this site for is missing: no 404 in the network panel. That's each page's own requests, and the
// two a browser makes by itself: /favicon.ico (whatever icons the page names), and the file Chrome's DevTools ask every
// localhost site for.
const { test, expect } = require('@playwright/test');
const { PAGES, OTHER_PAGES, mockNetwork, open } = require('../site');

for (const signedIn of [false, true]) {
  test(`every page gets an answer for everything it asks this site for, signed ${signedIn ? 'in' : 'out'}`, async ({ page, baseURL }) => {
    test.setTimeout(90000);
    const net = await mockNetwork(page, { signedIn });
    const bad = [];
    page.on('response', r => { if (r.url().startsWith(baseURL) && r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(baseURL.length)}`); });
    page.on('requestfailed', r => { if (r.url().startsWith(baseURL)) bad.push(`failed ${r.url().slice(baseURL.length)}`); });
    for (const pg of [...PAGES, ...OTHER_PAGES.filter(p => p.path !== '/404.html'), { path: '/u/?tester' }, { path: '/u/?mira#activity' }, { path: '/settings/#photo' }]) {
      await open(page, pg.path);
      // and the icons the page names
      const icons = await page.evaluate(() => Promise.all([...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => fetch(l.href).then(r => r.status))));
      expect(icons, pg.path).toEqual([200, 200, 200]);
    }
    expect(bad).toEqual([]);
    expect(net.unknown).toEqual([]);
  });
}

test('what a browser asks for by itself is there: /favicon.ico and Chrome\'s DevTools file', async ({ request }) => {
  const ico = await request.get('/favicon.ico');
  expect(ico.status()).toBe(200);
  expect(ico.headers()['content-type']).toBe('image/x-icon');
  const body = await ico.body();
  expect([body.readUInt16LE(2), body.readUInt16LE(4), body[6], body[7]]).toEqual([1, 1, 32, 32]);   // an icon, one picture, 32 x 32
  expect(body.subarray(22, 26).toString('latin1')).toBe('\x89PNG');
  const dev = await request.get('/.well-known/appspecific/com.chrome.devtools.json');
  expect(dev.status()).toBe(200);
  expect(await dev.json()).toEqual({});
  expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);   // a phone asks for this one at the root too
});
