// An address that isn't there: GitHub Pages (and tests/serve.js, the same way) sends 404.html, whatever the address.
const { test, expect } = require('@playwright/test');
const { mockNetwork, watchErrors } = require('../site');

for (const at of ['/nope', '/shelves/nothing/here/', '/u/mira/shelf.html']) {
  test(`${at} is the not-found page, styled, with the way home`, async ({ page }) => {
    const errors = watchErrors(page), net = await mockNetwork(page);
    const bad = [];
    page.on('response', r => { if (r.status() >= 400 && new URL(r.url()).pathname !== at) bad.push(`${r.status()} ${r.url()}`); });
    const res = await page.goto(at);
    await page.waitForLoadState('networkidle');
    expect(res.status()).toBe(404);
    await expect(page).toHaveTitle('Page not found · shelfstackd');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing on this shelf.');
    await expect(page.locator('main > p:not(.ways)')).toHaveCount(0);   // the heading says it; no second line saying it again
    // the shared stylesheet reached it from this depth: our type, and the button
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontSize)).toBe('13px');
    const home = page.locator('main').getByRole('link', { name: 'Back home' });
    expect(await home.evaluate(el => getComputedStyle(el).textTransform)).toBe('none');   // in its own case
    expect(bad, 'everything the page asks for is there').toEqual([]);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(0);
    await home.click();
    await expect(page).toHaveURL(/:\d+\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shelve the films and books you love, with their real spines.');
    expect(errors.filter(e => !/404/.test(e))).toEqual([]);   // the browser itself notes the 404 of the address typed
    expect(net.unknown).toEqual([]);
  });
}

test('the not-found page\'s other links: the logo, Shelves, People, and the footer every page has', async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/a/b/c');
  const hrefs = await page.locator('a').evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(hrefs).toEqual(['/', '/shelves/', '/people/', '/', '/shelves/', '/privacy.html#credits', '/privacy.html', 'mailto:hello@shelfstackd.com']);
});
