// A log's cover, worn (wear.js): a dog-eared corner and light wear, no stamp and no writing, older-looking the longer
// ago it was logged, and the same every time for the same log.
const { test, expect } = require('@playwright/test');
const { mockNetwork, open } = require('../site');

const NOW = new Date('2026-09-30T14:00:00Z');
// in the page: a cover drawn by wear.js from a plain picture (red unless given), once it has come; what's at a few of
// its pixels, how saturated its middle is (0 to 1), how many times anything was written on it, how many pixels of a
// scratch show on its face, and round the folded corner how many are dark (its hairline) or lightly shaded
async function draw(page, days, seed = 'log-1', fill = '#D62020'){
  return page.evaluate(async ([days, seed, now, fill]) => {
    const src = (() => { const c = document.createElement('canvas'); c.width = 200; c.height = 300; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, 200, 300); return c.toDataURL(); })();
    const P = CanvasRenderingContext2D.prototype, said = [];
    const was = [P.fillText, P.strokeText]; P.fillText = function(t){ said.push(t); }; P.strokeText = function(t){ said.push(t); };
    const c = Wear.cover({src, seed, at: new Date(now - days * 864e5).toISOString(), label: 'A cover', width: 150});
    // it's drawn once the folded corner is cut away (until the picture comes, the canvas is one flat grey)
    await new Promise(r => { const t = setInterval(() => { if (!c.getContext('2d').getImageData(c.width - 2, 1, 1, 1).data[3]){ clearInterval(t); r(); } }, 20); setTimeout(r, 3000); });
    [P.fillText, P.strokeText] = was;
    const x = c.getContext('2d'), at = (px, py) => [...x.getImageData(px, py, 1, 1).data];
    const mid = x.getImageData(c.width * .3, c.height * .4, c.width * .4, c.height * .3).data;
    let sat = 0; for (let i = 0; i < mid.length; i += 4){ const mx = Math.max(mid[i], mid[i + 1], mid[i + 2]), mn = Math.min(mid[i], mid[i + 1], mid[i + 2]); sat += mx ? (mx - mn) / mx : 0; }
    // the face, clear of the edges and the folded corner: on red, a scratch is where there's green
    const face = x.getImageData(c.width * .1, c.height * .12, c.width * .62, c.height * .78).data;
    let scratched = 0; for (let i = 0; i < face.length; i += 4) if (face[i + 1] > 55) scratched++;
    // round the folded corner (the top right fifth)
    const ear = x.getImageData(c.width * .62, 0, c.width * .38, c.height * .28).data;
    let dark = 0, shaded = 0;
    for (let i = 0; i < ear.length; i += 4){ if (!ear[i + 3]) continue; const lum = .2126 * ear[i] + .7152 * ear[i + 1] + .0722 * ear[i + 2]; if (lum < 195) dark++; else if (lum < 240) shaded++; }
    const k = c.width / 150;   // canvas pixels to one on the screen
    return {w: c.width, h: c.height, corner: at(c.width - 2, 1), topLeft: at(6, 6), sat: sat / (mid.length / 4), said: said.length, url: c.toDataURL(),
      scratched: scratched / (k * k), dark: dark / k, shaded: shaded / (k * k), fade: +c.dataset.fade, wear: +c.dataset.wear, label: c.getAttribute('aria-label'), role: c.getAttribute('role')};
  }, [days, seed, NOW.getTime(), fill]);
}

test('a log\'s cover: 2:3, dog-eared at the top right, worn but never written on', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page);
  await open(page, '/feed/?everyone');
  const c = await draw(page, 0);
  expect(c.h / c.w).toBeCloseTo(1.5, 2);
  expect(c.role).toBe('img');
  expect(c.label).toBe('A cover');
  expect(c.corner[3]).toBe(0);           // the corner is folded away: nothing there
  expect(c.topLeft[3]).toBe(255);        // the rest of the cover is
  expect(c.said).toBe(0);                // no stamp, no text
  expect(c.sat).toBeGreaterThan(.7);     // on the day: its colour nearly as it was
});

test('on the day it\'s logged the wear can be seen: a few fine scratches, and a dog-ear that reads on a white poster', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page);
  await open(page, '/feed/?everyone');
  const red = await draw(page, 0);
  expect(red.wear).toBeCloseTo(.25, 2);            // it was .08: scratches too faint to see
  expect(red.scratched).toBeGreaterThan(25);       // two or three scratches' worth of pixels on its face (none showed before)
  expect(red.scratched).toBeLessThan(600);         // fine ones: the cover isn't covered in them (its face is 10,000)
  // a white poster on a white page: the fold has a hairline (the fold itself, and its two edges on the cover) and a
  // soft shadow under it. Before, the darkest thing there was pale cream
  const white = await draw(page, 0, 'log-1', '#FFFFFF');
  expect(white.corner[3]).toBe(0);
  expect(white.dark).toBeGreaterThan(40);          // the hairline: about 40 + 20 + 25px of it at this size
  expect(white.shaded).toBeGreaterThan(60);        // the back of the card and its shadow
  expect(white.said).toBe(0);
});

test('it ages: lightly worn the day it\'s logged, more faded after a week, more worn after a month', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page);
  await open(page, '/feed/?everyone');
  const [today, week, month] = [await draw(page, 0), await draw(page, 7), await draw(page, 30)];
  expect(today.fade).toBeLessThan(.06);
  expect(today.wear).toBeLessThan(.3);
  expect(week.fade).toBeGreaterThan(today.fade + .1);
  expect(week.sat).toBeLessThan(today.sat - .05);
  expect(month.wear).toBeGreaterThan(week.wear + .25);
  expect(month.wear).toBeGreaterThan(today.wear + .4);
  expect(month.scratched).toBeGreaterThan(today.scratched);
  expect(month.sat).toBeLessThan(week.sat);
  expect(month.sat).toBeGreaterThan(.3);   // faded, not gone: it's still the cover
  for (const c of [week, month]) expect(c.said).toBe(0);
});

test('the same log wears the same way every time; another log in its own way', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page);
  await open(page, '/feed/?everyone');
  const a = await draw(page, 30, 'log-a'), again = await draw(page, 30, 'log-a'), b = await draw(page, 30, 'log-b');
  expect(again.url).toBe(a.url);
  expect(b.url).not.toBe(a.url);
  // on the day too, when what shows is the dog-ear and the first scratches
  const t = await draw(page, 0, 'log-a'), t2 = await draw(page, 0, 'log-a'), t3 = await draw(page, 0, 'log-b');
  expect(t2.url).toBe(t.url);
  expect(t3.url).not.toBe(t.url);
});
