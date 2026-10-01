/* The site's own pictures, made from the site itself: node art.js (npm run art). They're kept in the repo, at its root:
     sample-shelf.jpg       the builder's sample shelf (its four drawn books, on white). Home shows it when there are
                            no public shelves yet.
     og.jpg                 1200 x 630: the logo, the line from home and that shelf, for links shared elsewhere
     favicon-32.png         favicon.svg at 32px
     apple-touch-icon.png   the same mark at 180px, square to the edges (a phone rounds it itself)
     favicon.ico            the 32px PNG in an .ico, for browsers that ask for /favicon.ico whatever a page says
   Run it again when the sample shelf or favicon.svg changes. */
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const { ROOT, mockNetwork } = require('./site');

const PORT = 8186, BASE = `http://127.0.0.1:${PORT}`;
const save = (name, buf) => { fs.writeFileSync(path.join(ROOT, name), buf); console.log(name, buf.length, 'bytes'); };
const bytes = dataUrl => Buffer.from(dataUrl.split(',')[1], 'base64');

(async () => {
  const srv = spawn(process.execPath, ['serve.js', String(PORT)], { cwd: __dirname, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch();
  try {
    /* the sample shelf: the builder as it opens for a visitor, its story cut down to the books and their shadow */
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await mockNetwork(page, { realFonts: true });
    await page.goto(BASE + '/build/'); await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const shelf = await page.evaluate(() => {
      const story = document.querySelector('#story'), W = story.width, top = 400, bottom = 1830;   // between the caption and "made with shelfstackd"
      const d = story.getContext('2d').getImageData(0, top, W, bottom - top).data;
      let x0 = W, y0 = bottom, x1 = -1, y1 = -1;
      for (let y = 0; y < bottom - top; y++) for (let x = 0; x < W; x++){ const i = (y * W + x) * 4; if (d[i] < 247 || d[i + 1] < 247 || d[i + 2] < 247){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      if (x1 < 0) return null;
      const m = 36; x0 = Math.max(0, x0 - m); x1 = Math.min(W, x1 + m); y0 = Math.max(0, y0 - m) + top; y1 = Math.min(bottom - top, y1 + m) + top;
      const cut = (w) => { const c = document.createElement('canvas'); c.width = w; c.height = Math.round((y1 - y0) * w / (x1 - x0)); const x = c.getContext('2d');
        x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(story, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height); return c; };
      const small = cut(440);
      return { jpg: small.toDataURL('image/jpeg', .88), w: small.width, h: small.height, full: cut(x1 - x0).toDataURL('image/png') };
    });
    if (!shelf) throw new Error('the sample shelf was not drawn');
    save('sample-shelf.jpg', bytes(shelf.jpg));
    console.log(`sample-shelf.jpg is ${shelf.w} x ${shelf.h}`);
    await page.close();

    /* the share picture: the logo and the line from home on the left, the shelf on the right */
    const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await og.setContent(`<!doctype html><html><head><meta charset="utf-8">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;800&display=swap">
      <style>
        html,body{margin:0;width:1200px;height:630px;background:#fff;color:#000;font-family:"Geist Mono",monospace}
        .l{position:absolute;left:80px;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center;gap:28px}
        .mark{font-weight:800;font-size:54px;letter-spacing:.18em;line-height:1}
        .line{font-size:30px;line-height:1.35}
        .at{font-size:20px;color:#6B6B6B;letter-spacing:1px}
        img{position:absolute;right:110px;top:50%;height:540px;transform:translateY(-50%)}
      </style></head><body>
      <div class="l"><div class="mark">SHELFSTACKD</div><div class="line">Your shelf, but the real spines.</div><div class="at">shelfstackd.com</div></div>
      <img src="${shelf.full}" alt=""></body></html>`);
    await og.waitForLoadState('networkidle');
    await og.evaluate(() => Promise.all([document.fonts.load('800 54px "Geist Mono"'), document.fonts.load('400 30px "Geist Mono"'), document.fonts.ready]));
    await og.waitForTimeout(300);
    save('og.jpg', await og.screenshot({ type: 'jpeg', quality: 90 }));
    await og.close();

    /* the icons, from favicon.svg */
    const svg = fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8');
    const icon = async (size, square) => {
      const p = await browser.newPage({ viewport: { width: size, height: size } });
      await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${square ? svg.replace('rx="6"', 'rx="0"') : svg}</body></html>`);
      await p.addStyleTag({ content: `svg{display:block;width:${size}px;height:${size}px}` });
      const buf = await p.screenshot({ type: 'png', omitBackground: true });
      await p.close();
      return buf;
    };
    const png32 = await icon(32, false);
    save('favicon-32.png', png32);
    save('apple-touch-icon.png', await icon(180, true));
    // an .ico holding that one PNG: a 6-byte header, one 16-byte entry, then the picture
    const head = Buffer.alloc(22);
    head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);         // an icon, one picture
    head[6] = 32; head[7] = 32; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);   // 32 x 32, one plane, 32 bits
    head.writeUInt32LE(png32.length, 14); head.writeUInt32LE(22, 18);
    save('favicon.ico', Buffer.concat([head, png32]));
  } finally { await browser.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
