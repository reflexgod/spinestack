// Share to story (story.js): a 1080 x 1920 picture of a shelf, a log or a profile, with the spines (or the cover),
// the title, @username and shelfstackd.com. A phone that can share files gets a sheet with the picture and Share, which
// hands it to the share sheet; anything else saves it.
const { test, expect } = require('@playwright/test');
const { SHELVES, mockNetwork, watchErrors, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const pngSize = file => { const b = require('fs').readFileSync(file); return [b.subarray(1, 4).toString(), b.readUInt32BE(16), b.readUInt32BE(20)]; };
// a phone that can share files: share() keeps what it was given
const canShare = page => page.addInitScript(() => {
  window.__shared = [];
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
  Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__shared.push(d.files.map(f => `${f.name} ${f.type} ${f.size > 1000}`)); } });
});
// what's drawn where on a story: ink at the top (the logo and the name), in the middle (the thing itself), at the foot
// (shelfstackd.com), on white paper
const inked = c => c.evaluate(cv => { const x = cv.getContext('2d'), band = (y0, y1) => { const d = x.getImageData(0, y0, 1080, y1 - y0).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 128 && d[i + 1] < 128 && d[i + 2] < 128) n++; return n; };
  const corner = x.getImageData(4, 4, 1, 1).data; return { w: cv.width, h: cv.height, top: band(90, 200), middle: band(400, 1200), foot: band(1760, 1820), paper: [...corner].slice(0, 3).join(',') }; });

test('the picture: 1080 x 1920, paper white, the logo and name at the top, the thing in the middle, shelfstackd.com at the foot', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  await open(page, `/u/?mira&shelf=${SHELVES[1].id}`);
  await expect(page.locator('#oneShelf canvas')).toBeVisible();
  await page.evaluate(() => new Promise(r => { const s = document.createElement('script'); s.src = '../story.js'; s.onload = r; document.head.append(s); }));
  for (const spec of ['shelf', 'log', 'profile']) {
    const h = await page.evaluateHandle(async kind => {
      const pic = document.querySelector('#oneShelf canvas');
      const spec = kind === 'shelf' ? { kind, picture: pic, title: 'my next reads.', username: 'mira' }
        : kind === 'log' ? { kind, cover: Wear.cover({ kind: 'movie', src: '', seed: 'x', at: new Date().toISOString(), width: 560 }), title: 'Gummo', year: 1997, verb: 'watched', rating: 9, review: 'The bathtub scene.', username: 'mira' }
        : { kind, avatar: '', name: 'Mira', username: 'mira', line: '2 spines · 1 following · 2 followers', picture: pic };
      return Story.make(spec);
    }, spec);
    const got = await inked(h);
    expect(got, spec).toMatchObject({ w: 1080, h: 1920, paper: '255,255,255' });
    for (const band of ['top', 'middle', 'foot']) expect(got[band], `${spec}: ${band}`).toBeGreaterThan(20);
  }
});

test('a shelf: Share to story saves the picture where nothing can share it (a computer)', async ({ page }) => {
  test.skip(isPhone(), 'a computer');
  await mockNetwork(page, { signedIn: true });
  await open(page, `/u/?mira&shelf=${SHELVES[1].id}`);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.locator('#cardMenu').getByRole('menuitem', { name: 'Share to story' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('shelfstackd-story.png');
  expect(pngSize(await file.path())).toEqual(['PNG', 1080, 1920]);
});

test('a profile: ··· has Share to story; on a phone, the sheet with the picture and Share, then the share sheet', async ({ page }) => {
  const errors = watchErrors(page);
  await mockNetwork(page, { signedIn: true });
  if (isPhone()) await canShare(page);
  await open(page, '/u/?viraaj');
  await page.locator('#moreBtn').click();
  await expect(page.locator('#menu').getByRole('menuitem')).toHaveText(['Share to story', 'Copy link', 'Report']);
  if (!isPhone()) {
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Share to story' }).click();
    expect(pngSize(await (await download).path())).toEqual(['PNG', 1080, 1920]);
  } else {
    await page.getByRole('menuitem', { name: 'Share to story' }).click();
    const sheet = page.locator('#storySheet');
    await expect(sheet).toBeVisible({ timeout: 20000 });
    const pic = sheet.locator('img.storypic'), box = await pic.boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
    expect(box.height / box.width).toBeCloseTo(16 / 9, 1);
    await sheet.getByRole('button', { name: 'Share' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([['shelfstackd-story.png image/png true']]);
    await expect(sheet).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('a log: a post\'s Share has Share to story; Cancel and Esc on the sheet', async ({ page }) => {
  await mockNetwork(page, { signedIn: true, social: true });
  if (isPhone()) await canShare(page);
  await open(page, '/feed/?everyone');
  const post = page.locator('#items .post').filter({ hasText: 'watched Gummo' }).first();
  await post.getByRole('button', { name: /^Share/ }).click();
  const item = post.getByRole('menuitem', { name: 'Share to story' });
  await expect(item).toBeVisible();
  if (!isPhone()) {
    const download = page.waitForEvent('download');
    await item.click();
    expect(pngSize(await (await download).path())).toEqual(['PNG', 1080, 1920]);
    return;
  }
  await item.click();
  const sheet = page.locator('#storySheet');
  await expect(sheet).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => window.__shared)).toEqual([]);
});
