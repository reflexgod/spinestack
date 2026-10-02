/* Screenshots of the pages at 1280px and 390px, with the made-up account and data the tests use and the real fonts:
   node shots.js [folder] (tests/shots unless given). Shelf cards get real story pictures, drawn by shelf.js. The clock
   is held at two hours after the newest made-up shelf, so the logs' covers are as worn as their dates say. */
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const { mockNetwork, PICTURE, SHELVES } = require('./site');

const PORT = 8183, BASE = `http://127.0.0.1:${PORT}`, OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots'));
const SHOTS = [
  { name: 'home', path: '/', signedIn: true, friends: true },   // following five more people, so the row of cards is full
  { name: 'home-signed-out', path: '/', signedIn: false },
  { name: 'home-empty', path: '/', signedIn: false, empty: true },
  { name: 'build', path: '/build/', signedIn: true },
  { name: 'build-spines', path: '/build/?sample', signedIn: true },
  { name: 'profile', path: '/u/?mira', signedIn: true },
  { name: 'profile-activity', path: '/u/?mira#activity', signedIn: true },
  { name: 'profile-network', path: '/u/?mira#network', signedIn: true },
  { name: 'own-profile', path: '/u/?tester', signedIn: true },
  { name: 'own-profile-no-shelf', path: '/u/?tester', signedIn: true, ownShelf: false },
  { name: 'shelf-page', path: '/u/?mira&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000001', signedIn: true },
  { name: 'own-shelf-page', path: '/u/?tester&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000003', signedIn: true },
  { name: 'feed', path: '/feed/?everyone', signedIn: true },
  { name: 'feed-you', path: '/feed/?you', signedIn: true },
  { name: 'feed-before-logs', path: '/feed/?everyone', signedIn: true, logs: false },
  { name: 'add-choices', path: '/feed/?everyone', signedIn: true, act: async page => { await page.locator('header.top .add').click(); } },
  { name: 'add-log', path: '/feed/?everyone', signedIn: true, act: async page => {
    await page.locator('header.top .add').click();
    const d = page.locator('#addDialog');
    await d.getByRole('radio', { name: 'Log it' }).check();
    await d.getByRole('combobox', { name: 'Film or book name' }).fill('gummo');
    await d.getByRole('option', { name: /Gummo/ }).click();
    await d.getByRole('textbox', { name: /Caption/ }).fill('The bathtub scene.');
  } },
  { name: 'add-watchlist', path: '/feed/?everyone', signedIn: true, act: async page => {
    await page.locator('header.top .add').click();
    const d = page.locator('#addDialog');
    await d.getByRole('radio', { name: 'Watchlist' }).check();
    await d.getByRole('combobox', { name: 'Film or book name' }).fill('waves');
    await d.getByRole('option', { name: /The Waves/ }).click();
  } },
  { name: 'shelves', path: '/shelves/', signedIn: true },
  { name: 'members', path: '/members/?q=m', signedIn: true },
  { name: 'settings', path: '/settings/', signedIn: true },
  { name: 'privacy', path: '/privacy.html', signedIn: false },
  { name: 'not-found', path: '/no/such/page', signedIn: false },
  { name: 'settings-photo', path: '/settings/#photo', signedIn: true, photo: true },
  { name: 'settings-account', path: '/settings/#account', signedIn: true },
];

// in the page: a story for each card, with 1 to 20 spines, as its preview, laid out as the card's shelf is; cards.js
// then cuts each card round its books, as it does with real previews
const LAYOUTS = Object.fromEntries(SHELVES.map(s => [s.id, s.layout]));
async function drawPreviews(page) {
  await page.evaluate(async LAYOUTS => {
    if (!window.Shelf) return;
    const imgs = [...document.querySelectorAll('.thumbs .pic img, .items .pic img')]; if (!imgs.length) return;
    await Promise.all(['500 52px "Geist Mono"', '600 40px Oswald'].map(f => document.fonts.load(f).catch(() => {})));
    const pal = [['#161616', '#F1EEE6'], ['#F2B6C5', '#1F2E26'], ['#1C1B21', '#E8D23C'], ['#EFE7D6', '#3B2E25'], ['#24456B', '#F3E9D2'], ['#7A1F1F', '#F5E6C8']];
    const cover = (bg, fg) => { const c = document.createElement('canvas'); c.width = 400; c.height = 600; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 400, 600); x.fillStyle = fg; x.beginPath(); x.arc(200, 220, 80, 0, 7); x.fill(); return c; };
    const names = ['The Waves', 'Gummo', 'Kids', 'Jacob’s Room', 'Paris, Texas', 'Just Kids', 'Stalker', 'Orlando'];
    const books = (n, at) => Array.from({ length: n }, (_, i) => { const [bg, fg] = pal[(i + at) % pal.length];
      return { id: 'b' + i, cat: 'D' + (10000 + i), wf: .86 + ((i * 37 + at * 11) % 32) / 100, hf: .9 + ((i * 53 + at * 7) % 14) / 100, jit: ((i * 29) % 200) / 100 - 1, kind: 'book', author: 'Author', studio: '', status: '',
        title: names[(i + at) % names.length], img: cover(bg, fg), bg, fg, accent: fg, style: (i + at) % 2 ? 'solid' : 'classic', font: 'oswald' }; });
    const counts = [5, 1, 8, 3, 20, 6, 2, 12, 4, 7, 10, 3], themes = ['paper', 'paper', 'ink', 'paper', 'blush', 'paper'], made = new Map();
    imgs.forEach((im, i) => {
      const layout = LAYOUTS[im.closest('[data-shelf]').dataset.shelf] || 'row';
      const key = im.getAttribute('src') + layout;
      if (!made.has(key)) {
        const n = made.size, c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
        const count = layout === 'stack' ? [3, 6, 2][n % 3] : layout === 'covers' ? [6, 4, 9][n % 3] : counts[n % counts.length];
        Shelf.renderStory(c.getContext('2d'), 'clean', false, books(count, n), { caption: 'my next reads.', theme: themes[n % themes.length], layout, varied: true, wood: layout === 'row' && n % 4 === 2, plank: false, shelfColour: '#FFFFFF', filter: 'clean', intensity: 60 }, false, {});
        const p = document.createElement('canvas'); p.width = 360; p.height = 640; p.getContext('2d').drawImage(c, 0, 0, 360, 640);
        made.set(key, p.toDataURL('image/jpeg', .9));
      }
      im.removeAttribute('loading'); im.src = made.get(key);
    });
    await Promise.all(imgs.map(im => im.decode().catch(() => {})));
  }, LAYOUTS);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = spawn(process.execPath, ['serve.js', String(PORT)], { cwd: __dirname, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch();
  try {
    for (const [w, h] of [[1280, 900], [390, 844]]) {
      for (const shot of SHOTS) {
        const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
        await page.clock.setFixedTime(new Date('2026-09-30T14:00:00Z'));
        await mockNetwork(page, { signedIn: shot.signedIn, realFonts: true, empty: !!shot.empty, logs: shot.logs !== false, ownShelf: shot.ownShelf !== false, friends: !!shot.friends });
        await page.goto(BASE + shot.path); await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        await drawPreviews(page);
        if (shot.act) { await shot.act(page); await page.waitForTimeout(300); }
        if (shot.photo) {   // a photo chosen, so the frame it's cut with shows
          await page.locator('#photoFile').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PICTURE });
          await page.locator('#cropBox .cropper-container').waitFor();
        }
        await page.waitForTimeout(400);
        const file = path.join(OUT, `${shot.name}-${w}.png`);
        await page.screenshot({ path: file });
        console.log(file);
        await page.close();
      }
    }
  } finally { await browser.close(); srv.kill(); }
})();
