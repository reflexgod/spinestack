// A book's real spine (docs/BOOK-SPINES.md): a spine has lettering down its length, so a plain strip is no spine; and a
// picture of one spine alone, 1:6 or narrower, is the whole spine. The pictures are drawn here, standing in for the
// ones the diagnosis found: Animal Farm's two-panel design from jesskingblog.wordpress.com (a back cover and a front
// cover with no spine between them, where the cutter took a 13px strip of plain red at the join), a lettered spine, and
// a blank strip. add.js's own cutOne() cuts them, as it cuts every scan the Worker finds.
const { test, expect } = require('@playwright/test');
const { mockNetwork } = require('../site');

// what each picture is drawn as, in the page (x: a 2D context)
const DRAW = {
  // jesskingblog's Animal Farm, 700 x 500: a pale back with lines of type, a red front with big lettering, no spine
  animalFarm: `c.width = 700; c.height = 500;
    x.fillStyle = 'rgb(207,174,162)'; x.fillRect(0, 0, 323, 500);
    x.fillStyle = 'rgb(192,57,65)'; x.fillRect(323, 0, 377, 500);
    x.fillStyle = 'rgb(180,40,50)'; for (let i = 0; i < 18; i++) x.fillRect(40, 60 + i*20, 240 - (i % 3)*30, 8);   // the back's text
    x.fillStyle = 'rgb(225,195,175)'; for (let i = 0; i < 13; i++) x.fillRect(337, 60 + i*30, 16, 24);    // the title down the front's edge, 14px from the join
    x.fillStyle = '#FFFFFF'; x.fillRect(360, 18, 30, 7);                                                    // ORWELL, at the top
    x.fillStyle = 'rgb(230,200,180)'; x.fillRect(400, 110, 230, 170);                                        // ANIMAL FARM, large
    x.fillStyle = '#FFFFFF'; x.fillRect(420, 450, 210, 12);                                                 // GEORGE ORWELL
    x.fillStyle = '#000000'; x.fillRect(200, 430, 90, 40);                                                 // the barcode
    // a scan's grain: the same every time
    const im = x.getImageData(0, 0, 700, 500); let r = 7;
    for (let i = 0; i < im.data.length; i += 4){ r = (r*1103515245 + 12345) & 0x7fffffff; const X = (i/4) % 700, edge = X < 30 || X > 669, n = (r % 81) - 40;   // rougher at the trimmed edges
      for (let k = 0; k < 3; k++) im.data[i+k] = Math.max(0, Math.min(255, im.data[i+k] + n*(edge ? 3 : 1))); }
    x.putImageData(im, 0, 0);`,
  // one spine alone, 60 x 500 (1:8): dark cloth with a title, the author and the publisher down it
  letteredSpine: `c.width = 60; c.height = 500; x.fillStyle = '#1F2E2E'; x.fillRect(0, 0, 60, 500);
    x.fillStyle = '#D8B45A'; for (const [y0, n] of [[20, 5], [130, 4], [240, 4], [330, 3], [440, 3]]) for (let i = 0; i < n; i++) x.fillRect(14 + (i % 2)*8, y0 + i*16, 24 - (i % 2)*8, 9);`,
  // the same shape with nothing on it
  blankSpine: `c.width = 60; c.height = 500; x.fillStyle = '#B03A3A'; x.fillRect(0, 0, 60, 500);`,
};

async function withAdd(page){
  await mockNetwork(page, { signedIn: true });
  // the Worker's /img sends back the picture the test drew (a data: address in url=)
  await page.route(/\/img\?url=data/, route => {
    const u = new URL(route.request().url()).searchParams.get('url');
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'image/png', body: Buffer.from(u.split(',')[1], 'base64') });
  });
  await page.goto('/feed/');
  await page.locator('.top .add').click();
  await page.waitForFunction(() => window.Add && window.Add.cutOne);
}
const draw = (page, what) => page.evaluate(src => { const c = document.createElement('canvas'), x = c.getContext('2d'); new Function('c', 'x', src)(c, x); return c.toDataURL('image/png'); }, DRAW[what]);
const cut = (page, url, kind = 'book') => page.evaluate(async ([url, kind]) => {
  const c = await Add.cutOne({ img: url, source: 'https://example.com/page' }, kind);
  return c && { score: c.score, solo: !!c.solo, w: c.spine.width, h: c.spine.height };
}, [url, kind]);

test('Animal Farm\'s design with no spine: the cutter finds a strip at the join, and it is turned down, having no lettering down it', async ({ page }) => {
  await withAdd(page);
  const url = await draw(page, 'animalFarm');
  // without the lettering check the strip would be a spine: findSpine cuts it at the join
  const strip = await page.evaluate(async url => { const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = url; });
    const f = Add.findSpine(img, 'book'); return f && { x: Math.round(f.x), w: Math.round(f.w), l: Add.lettering(img, f.x, f.y, f.w, f.h) }; }, url);
  expect(strip).toMatchObject({ x: 323, w: 13 });   // as on the real picture: 13px of plain red at the join
  expect(strip.l.rows).toBeLessThan(0.1);
  expect(strip.l.parts).toBeLessThan(3);
  expect(await cut(page, url)).toBeNull();
});

test('a picture of one spine alone, 1:6 or narrower and lettered, is the whole spine; a blank one is turned down', async ({ page }) => {
  await withAdd(page);
  const got = await cut(page, await draw(page, 'letteredSpine'));
  expect(got).toMatchObject({ solo: true, w: 60, h: 500 });   // the picture as it is, not cut down
  expect(got.score).toBeGreaterThanOrEqual(45);
  expect(await cut(page, await draw(page, 'blankSpine'))).toBeNull();
  const l = await page.evaluate(async url => { const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = url; }); return Add.lettering(img, 0, 0, img.width, img.height); }, await draw(page, 'letteredSpine'));
  expect(l.rows).toBeGreaterThanOrEqual(0.1);
  expect(l.parts).toBeGreaterThanOrEqual(3);
});

test('a film\'s spine has no lettering check: a blank DVD spine alone is still cut as before', async ({ page }) => {
  await withAdd(page);
  // findSoloSpine trims it and scores it; films are as they were
  const film = await cut(page, await draw(page, 'blankSpine'), 'movie');
  const before = await page.evaluate(async url => { const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = url; }); return !!Add.findSoloSpine(img); }, await draw(page, 'blankSpine'));
  expect(!!film).toBe(before);
});

test('no real spine for a book: "Have it? Photograph the spine" comes first, then Generated; a photo of it is picked and goes on the shelf', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });   // /scans finds nothing for anything
  await page.goto('/feed/');
  await page.locator('.top .add').click();
  const d = page.getByRole('dialog', { name: /^add to (your|the) shelf$/i });
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('the waves');
  await d.getByRole('option', { name: /The Waves.*Book/ }).click();
  const picks = d.locator('#addFound .pick');
  await expect(picks.first().getByRole('button', { name: 'Have it? Photograph the spine' })).toBeVisible({ timeout: 8000 });
  expect(await picks.evaluateAll(ps => ps.map(p => p.dataset.c))).toEqual(['photo', 'spine', 'cover']);
  await expect(d.locator('[data-use="spine"]')).toHaveAttribute('aria-checked', 'true');   // Generated is still what's picked until there's a photo
  // the photo: one spine, 1:8, the way a phone's crop of it would be
  const png = await page.evaluate(src => { const c = document.createElement('canvas'), x = c.getContext('2d'); new Function('c', 'x', src)(c, x); return c.toDataURL('image/png'); }, DRAW.letteredSpine);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), d.getByRole('button', { name: 'Have it? Photograph the spine' }).click()]);
  await chooser.setFiles({ name: 'spine.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
  const mine = d.locator('#addFound [data-use="real:0"]');
  await expect(mine).toHaveAttribute('aria-checked', 'true');
  await expect(mine).toHaveAccessibleName('Your photo of the spine');
  await expect(d.getByRole('button', { name: 'Have it? Photograph the spine' })).toHaveCount(0);
  await d.getByRole('button', { name: 'Add to shelf' }).click();
  await expect(page).toHaveURL(/\/build\/$/);
  await expect(page.locator('#toast')).toHaveText('The Waves added to your shelf.');
  await expect.poll(() => page.locator('#books .book .bt').allTextContents()).toEqual(['The Waves']);
});

test('a film with no real spine doesn\'t ask for a photo', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, ownShelf: false });
  await page.goto('/feed/');
  await page.locator('.top .add').click();
  const d = page.getByRole('dialog', { name: /^add to (your|the) shelf$/i });
  await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
  await d.getByRole('option', { name: /Gummo/ }).click();
  await expect(d.locator('[data-use="spine"]')).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(500);
  await expect(d.getByRole('button', { name: 'Have it? Photograph the spine' })).toHaveCount(0);
});
