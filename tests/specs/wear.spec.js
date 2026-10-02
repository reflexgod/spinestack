// A log's cover, worn (wear.js): a dog-eared corner and light wear, no stamp and no writing, older-looking the longer
// ago it was logged, and the same every time for the same log.
const { test, expect } = require('@playwright/test');
const { mockNetwork, open } = require('../site');

const NOW = new Date('2026-09-30T14:00:00Z');
// in the page: a cover drawn by wear.js from a plain red picture, once it has come; what's at a few of its pixels,
// how saturated its middle is (0 to 1), and how many times anything was written on it
async function draw(page, days, seed = 'log-1'){
  return page.evaluate(async ([days, seed, now]) => {
    const src = (() => { const c = document.createElement('canvas'); c.width = 200; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#D62020'; x.fillRect(0, 0, 200, 300); return c.toDataURL(); })();
    const P = CanvasRenderingContext2D.prototype, said = [];
    const was = [P.fillText, P.strokeText]; P.fillText = function(t){ said.push(t); }; P.strokeText = function(t){ said.push(t); };
    const c = Wear.cover({src, seed, at: new Date(now - days * 864e5).toISOString(), label: 'A cover', width: 150});
    await new Promise(r => { const t = setInterval(() => { const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; if (d[0] > 120 && d[1] < 200){ clearInterval(t); r(); } }, 20); setTimeout(r, 3000); });
    [P.fillText, P.strokeText] = was;
    const x = c.getContext('2d'), at = (px, py) => [...x.getImageData(px, py, 1, 1).data];
    const mid = x.getImageData(c.width * .3, c.height * .4, c.width * .4, c.height * .3).data;
    let sat = 0; for (let i = 0; i < mid.length; i += 4){ const mx = Math.max(mid[i], mid[i + 1], mid[i + 2]), mn = Math.min(mid[i], mid[i + 1], mid[i + 2]); sat += mx ? (mx - mn) / mx : 0; }
    return {w: c.width, h: c.height, corner: at(c.width - 2, 1), topLeft: at(6, 6), sat: sat / (mid.length / 4), said: said.length, url: c.toDataURL(),
      fade: +c.dataset.fade, wear: +c.dataset.wear, label: c.getAttribute('aria-label'), role: c.getAttribute('role')};
  }, [days, seed, NOW.getTime()]);
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
  expect(c.sat).toBeGreaterThan(.7);     // on the day: nearly as it was
});

test('it ages: nearly new the day it\'s logged, more faded after a week, more worn after a month', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockNetwork(page);
  await open(page, '/feed/?everyone');
  const [today, week, month] = [await draw(page, 0), await draw(page, 7), await draw(page, 30)];
  expect(today.fade).toBeLessThan(.06);
  expect(today.wear).toBeLessThan(.12);
  expect(week.fade).toBeGreaterThan(today.fade + .1);
  expect(week.sat).toBeLessThan(today.sat - .05);
  expect(month.wear).toBeGreaterThan(week.wear + .3);
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
});
