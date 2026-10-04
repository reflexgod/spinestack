// A log's cover, worn (wear.js), as the thing itself: a film is a DVD in its keep case (a thin black plastic edge, a
// sheen; scratches, a hazy sheen, and a cracked corner after a month; no dog-ear), a book is a paperback (page edges,
// the spine's crease; yellowing, a dog-ear, reading creases, and a pencilled price after a month). The same every time
// for the same log, and it reads at 72px.
const { test, expect } = require('@playwright/test');
const { mockNetwork, open } = require('../site');

const NOW = new Date('2026-09-30T14:00:00Z');
/* In the page: a cover drawn by wear.js from a plain picture (red unless given), once it's drawn, measured:
   alpha at the top right; how saturated its middle is; the face's brightness (median, 95th percentile, mean) and its
   mean red, green and blue; the brightness down its right edge; the colour of the page edge; how bright the spine's
   crease is against the middle; pale marks by the spine; see-through pixels in its corners; light marks on its face;
   and anything written on it */
async function draw(page, { days = 0, seed = 'log-1', fill = '#D62020', kind = 'book', width = 150 } = {}){
  return page.evaluate(async ([days, seed, now, fill, kind, width]) => {
    const src = (() => { const c = document.createElement('canvas'); c.width = 200; c.height = 300; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, 200, 300); return c.toDataURL(); })();
    const P = CanvasRenderingContext2D.prototype, said = [];
    const was = [P.fillText, P.strokeText]; P.fillText = function(t){ said.push(String(t)); return was[0].apply(this, arguments); }; P.strokeText = function(t){ said.push(String(t)); };
    const c = Wear.cover({src, seed, kind, at: new Date(now - days * 864e5).toISOString(), label: 'A cover', width});
    await new Promise(r => { const t = setInterval(() => { if (c.dataset.drawn){ clearInterval(t); r(); } }, 20); setTimeout(r, 3000); });
    [P.fillText, P.strokeText] = was;
    const x = c.getContext('2d'), W = c.width, H = c.height, k = W / 300, px = W / width, pe = Math.max(2 * px, 5 * k), CW = kind === 'movie' ? W : W - pe;
    const at = (a, b) => [...x.getImageData(Math.round(a), Math.round(b), 1, 1).data], lum = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
    const box = (x0, y0, x1, y1) => ({ d: x.getImageData(Math.round(x0 * W), Math.round(y0 * H), Math.max(1, Math.round((x1 - x0) * W)), Math.max(1, Math.round((y1 - y0) * H))).data });
    const mid = box(.3, .4, .7, .7).d;
    let sat = 0; for (let i = 0; i < mid.length; i += 4){ const mx = Math.max(mid[i], mid[i + 1], mid[i + 2]), mn = Math.min(mid[i], mid[i + 1], mid[i + 2]); sat += mx ? (mx - mn) / mx : 0; }
    const face = box(.15, .15, .85, .85).d, ls = []; let R = 0, G = 0, B = 0, light = 0;
    for (let i = 0; i < face.length; i += 4){ const l = lum(face[i], face[i + 1], face[i + 2]); ls.push(l); R += face[i]; G += face[i + 1]; B += face[i + 2]; if (face[i + 1] > 90) light++; }
    ls.sort((a, b) => a - b); const n = ls.length;
    // a column's mean green, down the middle of the cover
    const colG = cx => { const d = x.getImageData(Math.round(cx), Math.round(H * .2), 1, Math.round(H * .6)).data; let s = 0; for (let i = 1; i < d.length; i += 4) s += d[i]; return s / (d.length / 4); };
    let crease = 0; for (let cx = Math.round(CW * .04); cx <= Math.round(CW * .1); cx++) crease = Math.max(crease, colG(cx));
    const right = x.getImageData(W - Math.max(1, Math.round(px)), Math.round(H * .3), 1, Math.round(H * .4)).data; let rl = 0; for (let i = 0; i < right.length; i += 4) rl += lum(right[i], right[i + 1], right[i + 2]); rl /= right.length / 4;
    const spine = box(.1, .1, .3, .9).d; let pale = 0; for (let i = 0; i < spine.length; i += 4) if (spine[i + 1] > 90) pale++;
    let clear = 0; for (const [x0, y0] of [[0, 0], [.88, 0], [0, .92], [.88, .92]]){ const d = box(x0, y0, x0 + .12, y0 + .08).d; for (let i = 3; i < d.length; i += 4) if (d[i] < 128) clear++; }
    return { w: W, h: H, kind: c.dataset.kind, role: c.getAttribute('role'), label: c.getAttribute('aria-label'), said, url: c.toDataURL(), fade: +c.dataset.fade, wear: +c.dataset.wear,
      corner: at(W - 2, 1), topRight: at(W - 4 * px, 4 * px), topLeft: at(6 * px, 6 * px), sat: sat / (mid.length / 4),
      p50: ls[n >> 1], p95: ls[Math.floor(n * .95)], mean: ls.reduce((a, b) => a + b, 0) / n, R: R / n, G: G / n, B: B / n, light: light / (px * px),
      rightEdge: rl, pageEdge: at(W - 1 - pe / 2, H * .5), crease, middle: colG(CW * .5), pale: pale / (px * px), clear: clear / (px * px) };
  }, [days, seed, NOW.getTime(), fill, kind, width]);
}
// one after another: what's written is caught on the page as a whole, so two at once would mix up
const inTurn = async fns => { const out = []; for (const f of fns) out.push(await f()); return out; };
async function start(page){ await page.clock.setFixedTime(NOW); await mockNetwork(page); await open(page, '/feed/?everyone'); }

/* ---------- a film: the DVD keep case ---------- */
test('a film: a keep case, 2:3, a thin black edge and a sheen, no dog-ear, nothing written on it', async ({ page }) => {
  await start(page);
  const c = await draw(page, { kind: 'movie' });
  expect(c.kind).toBe('case');
  expect(c.h / c.w).toBeCloseTo(1.5, 2);
  expect([c.role, c.label]).toEqual(['img', 'A cover']);
  expect(c.topRight[3]).toBe(255);            // no corner folded away
  expect(c.corner[3]).toBeGreaterThan(0);
  expect(c.rightEdge).toBeLessThan(70);       // the black plastic down its edge
  expect(c.sat).toBeGreaterThan(.55);         // on the day: the poster's colour as it was, under the plastic
  expect(c.said).toEqual([]);
  // the sheen: a band of light across the plastic, plain on a dark poster
  const dark = await draw(page, { kind: 'movie', fill: '#101010' });
  expect(dark.p95 - dark.p50).toBeGreaterThan(15);
});

test('a film ages: scratches, the sheen going hazy, and a cracked corner after a month; never a dog-ear', async ({ page }) => {
  await start(page);
  const [a, b, c, d] = await inTurn([0, 7, 29, 31].map(days => () => draw(page, { kind: 'movie', fill: '#101010', days })));
  expect(b.mean).toBeGreaterThan(a.mean + 3);          // hazier after a week
  expect(d.mean).toBeGreaterThan(a.mean + 15);         // and after a month
  expect(d.light).toBeGreaterThan(a.light);            // more scratches
  expect(a.light).toBeGreaterThan(20);                 // and some on the day
  expect(c.clear).toBeLessThan(40);                    // the rounded corners only, before a month
  expect(d.clear).toBeGreaterThan(c.clear + 20);       // a chip out of one corner after it
  for (const x of [a, b, c, d]){ expect(x.topRight[3] + x.topLeft[3]).toBeGreaterThan(255); expect(x.said).toEqual([]); }
});

/* ---------- a book: the paperback ---------- */
test('a book: a paperback, its page edges, the spine\'s crease, dog-eared at the top right, nothing written on it at first', async ({ page }) => {
  await start(page);
  const c = await draw(page);
  expect(c.kind).toBe('paperback');
  expect(c.h / c.w).toBeCloseTo(1.5, 2);
  expect(c.corner[3]).toBe(0);                // the corner folded away
  expect(c.topLeft[3]).toBe(255);
  const [r, g, b] = c.pageEdge;               // the pages: cream
  expect(r).toBeGreaterThan(185); expect(g).toBeGreaterThan(175); expect(b).toBeGreaterThan(140);   // (on a fine page line, at a phone's pixels, a little darker)
  expect(c.crease).toBeGreaterThan(c.middle + 40);   // the crease: a pale line near the spine
  expect(c.said).toEqual([]);
  expect(c.sat).toBeGreaterThan(.6);
  // a white cover on a white page: the dog-ear still reads (its hairline and shadow)
  const white = await draw(page, { fill: '#FFFFFF' });
  expect(white.corner[3]).toBe(0);
});

test('a book ages: yellowing, more reading creases, and a pencilled price after a month', async ({ page }) => {
  await start(page);
  const [w0, w30] = await inTurn([() => draw(page, { fill: '#FFFFFF' }), () => draw(page, { fill: '#FFFFFF', days: 31 })]);
  expect((w30.R + w30.G) / 2 - w30.B).toBeGreaterThan((w0.R + w0.G) / 2 - w0.B + 15);   // yellower
  const [r0, r7, r29, r31] = await inTurn([0, 7, 29, 31].map(days => () => draw(page, { days })));
  expect(r31.pale).toBeGreaterThan(r0.pale);           // more creases by the spine
  expect(r7.fade).toBeGreaterThan(r0.fade + .1);
  expect(r29.said).toEqual([]);                        // no price before a month
  expect(r31.said).toHaveLength(1);                    // then one, pencilled
  expect(r31.said[0]).toMatch(/^[£$]\d\.\d\d$/);
  expect(r31.sat).toBeGreaterThan(.3);                 // yellowed, not gone: it's still the cover
});

/* ---------- both ---------- */
test('the same log wears the same way every time; another log in its own way (a case and a paperback, new and a month on)', async ({ page }) => {
  await start(page);
  for (const kind of ['movie', 'book']) for (const days of [0, 31]) {
    const a = await draw(page, { kind, days, seed: 'log-a' }), again = await draw(page, { kind, days, seed: 'log-a' }), b = await draw(page, { kind, days, seed: 'log-b' });
    expect(again.url, `${kind} ${days}`).toBe(a.url);
    expect(b.url, `${kind} ${days}`).not.toBe(a.url);
    expect(again.said).toEqual(a.said);
  }
});

test('it reads at 72px: the case\'s edge and its cracked corner, the paperback\'s pages, crease and dog-ear', async ({ page }) => {
  await start(page);
  const film = await draw(page, { kind: 'movie', width: 72 }), cracked = await draw(page, { kind: 'movie', width: 72, days: 31, fill: '#101010' }), fresh = await draw(page, { kind: 'movie', width: 72, days: 29, fill: '#101010' });
  expect(film.rightEdge).toBeLessThan(70);
  expect(film.topRight[3]).toBe(255);
  expect(cracked.clear).toBeGreaterThan(fresh.clear + 10);
  const book = await draw(page, { width: 72 });
  expect(book.corner[3]).toBe(0);
  expect(book.crease).toBeGreaterThan(book.middle + 30);
  expect(book.pageEdge[0]).toBeGreaterThan(200);
});
