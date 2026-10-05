// The look every page shares (site.css): one 950px column that the top bar's contents sit in too, the type scale,
// the buttons, the shelf cards, the profile's numbers and tabs.
const { test, expect } = require('@playwright/test');
const { PAGES, mockNetwork, open } = require('../site');

const isPhone = () => test.info().project.name.startsWith('phone');
const css = (loc, ...props) => loc.evaluate((el, props) => { const s = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, s[p]])); }, props);
const box = async loc => { const b = await loc.boundingBox(); return { left: b.x, right: b.x + b.width, width: b.width, height: b.height }; };

for (const pg of [...PAGES, { name: 'own profile', path: '/u/?tester' }]) {
  test(`${pg.name}: the content and the bar's contents share one column, and only the bar's line is the window's width`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, pg.path);
    const width = page.viewportSize().width;
    const main = await box(page.locator('main')), logo = await box(page.locator('.top .mark')), add = await box(page.locator('.top .addwrap')), bar = await box(page.locator('header.top'));
    expect(main.width).toBeLessThanOrEqual(950);
    if (!isPhone()) expect(main.width).toBe(950);
    else expect(main.width).toBe(width - 32);   // a 16px gutter each side
    expect(Math.abs(logo.left - main.left)).toBeLessThanOrEqual(1);    // the logo's left edge is the content's
    expect(Math.abs(add.right - main.right)).toBeLessThanOrEqual(1);   // the last item's right edge is the content's
    expect(bar.width).toBe(width);                                      // the bar, and the hairline under it, run across
    expect((await css(page.locator('header.top'), 'borderBottomWidth')).borderBottomWidth).toBe('1px');
    const foot = await box(page.locator('footer p').first());
    if (!isPhone()) expect(Math.abs(foot.left - main.left)).toBeLessThanOrEqual(1);
  });

  test(`${pg.name}: the type scale, and three button looks: solid black, outlined, or plain grey text`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, pg.path);
    expect(await css(page.locator('body'), 'fontSize')).toEqual({ fontSize: '13px' });
    expect(await css(page.locator('.top .mark'), 'fontSize')).toEqual({ fontSize: isPhone() ? '15px' : '18px' });
    expect(await css(page.locator('.top .links a').nth(1), 'fontSize', 'fontWeight', 'textTransform', 'letterSpacing')).toEqual({ fontSize: '12px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '1px' });
    // page titles: 22 to 24px, weight 400, in their own case
    const h1 = page.locator('main h1:visible').first();
    const t = await css(h1, 'fontSize', 'fontWeight', 'textTransform');
    expect(pg.name === 'home' && isPhone() ? ['20px'] : ['22px', '24px']).toContain(t.fontSize);   // home's welcome line: 20px on a phone
    expect(t).toMatchObject({ fontWeight: '400', textTransform: 'none' });
    // one section label, everywhere (site.css's h2, and .seclabel where a label isn't a heading): 12px uppercase grey,
    // 1px apart, a hairline under it. A sheet's or a dialog's title is a title, not a section label.
    const labels = await page.locator('main h2:visible, .seclabel:visible').evaluateAll(els => els.filter(e => !e.closest('.sheetbox, dialog')).map(e => {
      const s = getComputedStyle(e);
      return { text: e.textContent.trim().slice(0, 30), fontSize: s.fontSize, fontWeight: s.fontWeight, textTransform: s.textTransform, letterSpacing: s.letterSpacing, color: s.color, borderBottomWidth: s.borderBottomWidth };
    }));
    for (const { text, ...l } of labels) expect(l, text).toEqual({ fontSize: '12px', fontWeight: '400', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgb(107, 107, 107)', borderBottomWidth: '1px' });
    // buttons: 11px weight 600, radius 3px; in the bar in its capitals (+ ADD), in the page in their own case
    const btn = page.locator('.btn:visible').first();
    expect(await css(btn, 'fontSize', 'fontWeight', 'textTransform', 'borderTopLeftRadius')).toEqual({ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', borderTopLeftRadius: '3px' });
    const inPage = page.locator('main .btn:visible, .mkbar .btn:visible').first();
    if (await inPage.count()) expect(await css(inPage, 'textTransform')).toEqual({ textTransform: 'none' });
    const any = page.locator('main .btn.primary:visible, .mkbar .btn.primary:visible').first();
    if (await any.count()) expect(await css(any, 'paddingTop', 'paddingLeft')).toEqual({ paddingTop: '8px', paddingLeft: '16px' });
    // three looks and no fourth: solid black (what the screen is for, + ADD, Follow), outlined (black on white, a 1px
    // black line round it: + New shelf), or plain text, grey, with no box
    const looks = await page.locator('.btn:visible, .dash:visible').evaluateAll(els => els.map(e => { const s = getComputedStyle(e);
      return s.backgroundColor === 'rgb(0, 0, 0)' && s.color === 'rgb(255, 255, 255)' ? 'solid'
        : s.backgroundColor === 'rgb(255, 255, 255)' && s.color === 'rgb(0, 0, 0)' && s.boxShadow === 'rgb(0, 0, 0) 0px 0px 0px 1px inset' ? 'line'
        : s.backgroundColor === 'rgba(0, 0, 0, 0)' && (s.borderTopWidth === '0px' || s.borderTopColor === 'rgba(0, 0, 0, 0)') && s.color === 'rgb(107, 107, 107)' ? 'text' : 'other: ' + e.textContent.trim(); }));
    expect(looks.filter(l => l.startsWith('other'))).toEqual([]);
    expect(looks).toContain('solid');   // + ADD at least
  });

  test(`${pg.name}: one icon set, one stroke weight, 16 or 20px; no glyph or emoji for an icon`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, pg.path);
    // every icon is from the one set (Lucide's 24-unit grid), stroked at 2, drawn 16px in a line or 20px on its own.
    // The spines of a rating are drawings, not icons.
    const icons = await page.locator('svg:visible').evaluateAll(els => els.filter(e => !e.closest('.rating')).map(e => {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return { box: e.getAttribute('viewBox'), size: `${Math.round(r.width)}x${Math.round(r.height)}`, stroke: s.strokeWidth, where: (e.parentElement.getAttribute('aria-label') || e.parentElement.className || e.parentElement.tagName) + '' };
    }));
    for (const i of icons) {
      expect(i.box, i.where).toBe('0 0 24 24');
      expect(['16x16', '20x20'], i.where).toContain(i.size);
      expect(i.stroke, i.where).toBe('2px');
    }
    // no button or link that is only a glyph (× ✕ ↑ ↓ ▾ ••• ··· + −), and no emoji anywhere on the page
    const glyphs = await page.locator('button:visible, a:visible').evaluateAll(els => els.map(e => e.textContent.trim()).filter(t => /^[×✕↑↓▾▸•·+−\-…]+$/u.test(t)));
    expect(glyphs).toEqual([]);
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  });
}

test('shelves listed: six across the column at 145px, 16px apart (three on a phone), each its spines on a thin line, name and @username under; no box', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/');
  const cards = page.locator('#inGrid li'), lines = page.locator('#inGrid .sl');
  const boxes = await cards.evaluateAll(els => els.slice(0, 7).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; }));
  const across = boxes.filter(b => Math.abs(b.y - boxes[0].y) < 1).length;
  expect(across).toBe(isPhone() ? 3 : 6);
  expect(Math.round(boxes[1].x - boxes[0].x - boxes[0].w)).toBe(16);
  if (!isPhone()) expect(Math.round(boxes[0].w)).toBe(145);
  await expect(lines.first().locator('canvas').first()).toBeVisible();
  expect(await css(lines.first(), 'borderTopWidth', 'borderLeftWidth', 'borderBottomWidth', 'borderBottomColor', 'backgroundColor')).toEqual({ borderTopWidth: '0px', borderLeftWidth: '0px', borderBottomWidth: '1px', borderBottomColor: 'rgb(0, 0, 0)', backgroundColor: 'rgba(0, 0, 0, 0)' });   // a line, not a box
  expect(await css(page.locator('#inGrid .cap').first(), 'fontSize', 'textTransform')).toEqual({ fontSize: '12px', textTransform: 'none' });
  expect(await css(page.locator('#inGrid .by').first(), 'fontSize', 'color')).toEqual({ fontSize: '11px', color: 'rgb(107, 107, 107)' });
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
});

test('profile: the name, the numbers as one plain line under the bio, and the tabs', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/u/?mira');
  expect(await css(page.locator('#name'), 'fontSize', 'fontWeight')).toEqual({ fontSize: '22px', fontWeight: '400' });
  // at every width: one small line under the bio, over the buttons; no row of big numbers with capital labels
  const counts = page.locator('#counts');
  await expect(counts).toHaveText('2 spines · 1 following · 2 followers');
  expect(await css(counts, 'fontSize', 'color', 'borderTopWidth', 'borderBottomWidth')).toEqual({ fontSize: '12px', color: 'rgb(107, 107, 107)', borderTopWidth: '0px', borderBottomWidth: '0px' });
  const one = await box(counts), bio = await page.locator('#pbio').boundingBox(), btns = await page.locator('.pbtns').boundingBox();
  expect(one.height).toBeLessThan(24);                                      // one line
  expect(Math.abs(one.left - bio.x)).toBeLessThanOrEqual(1);
  expect((await counts.boundingBox()).y).toBeGreaterThanOrEqual(bio.y + bio.height - 1);
  expect(btns.y).toBeGreaterThan((await counts.boundingBox()).y + one.height);
  await expect(page.locator('.stats, #statCol, dl')).toHaveCount(0);
  expect(await page.locator('#pcard').evaluate(e => [...e.querySelectorAll('*')].filter(x => getComputedStyle(x).textTransform === 'uppercase' && x.offsetParent && /\S/.test(x.textContent) && !x.closest('.tag')).length)).toBe(0);
  expect(await css(page.locator('#tabP'), 'fontSize', 'textTransform', 'color', 'borderBottomWidth', 'borderBottomColor')).toEqual({ fontSize: '13px', textTransform: 'none', color: 'rgb(0, 0, 0)', borderBottomWidth: '1px', borderBottomColor: 'rgb(0, 0, 0)' });
  expect((await css(page.locator('#tabA'), 'color')).color).toBe('rgb(107, 107, 107)');
  // its shelf: no panel, standing on a 1px black shelf line across the column (as home's spine wall)
  const line = await box(page.locator('#featWrap')), main = await box(page.locator('main'));
  expect(Math.abs(line.width - main.width)).toBeLessThanOrEqual(1);
  expect(await css(page.locator('#hero'), 'backgroundColor')).toEqual({ backgroundColor: 'rgba(0, 0, 0, 0)' });
  expect(await css(page.locator('#featWrap'), 'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor')).toEqual({ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgb(0, 0, 0)' });
});

// a cover, worn (a log, on the feed) or clean (Up next, on a profile): a 1px outline in the hairline grey, black
// under the pointer
for (const [where, path, sel] of [['the feed', '/feed/?everyone', '.items canvas.worn'], ['a profile', '/u/?tester', '#watchStrip canvas.clean']]) {
  test(`covers on ${where}: a 1px outline, black on hover`, async ({ page }) => {
    test.skip(isPhone(), 'no pointer to hover with');
    await mockNetwork(page, { signedIn: true });
    await open(page, path);
    const cover = page.locator(sel).first();
    await expect(cover).toBeVisible();
    const outline = () => cover.evaluate(el => { const s = getComputedStyle(el); return [s.outlineWidth, s.outlineStyle, s.outlineColor].join(' '); });
    await page.mouse.move(0, 0);
    expect(await outline()).toBe('1px solid rgb(217, 217, 217)');
    await cover.hover();
    expect(await outline()).toBe('1px solid rgb(0, 0, 0)');
  });
}

test('the feed shows a shelf saved as a strip of spines 112px tall, in line with the post’s text, not a card or the whole story', async ({ page }) => {
  await mockNetwork(page, { signedIn: true });
  await open(page, '/feed/?everyone');
  const post = page.locator('.shelfpost').first();
  await expect(post.locator('.strip canvas').first()).toBeVisible();
  const strip = await box(post.locator('.strip')), what = await box(post.locator('.pwhat'));
  expect(Math.round(strip.height)).toBe(112);
  expect(Math.abs(strip.left - what.left)).toBeLessThanOrEqual(1);   // in line with the text above it
  expect(strip.left - (await box(post.locator('.pava'))).right).toBeGreaterThan(0);   // and clear of the photo
  await expect(page.locator('#items .pic')).toHaveCount(0);
});

// The type is Courier Prime (400, 700 and italic 400, from Google Fonts with display=swap) on every page, not Geist Mono.
// what the page test can't see (a sheet's close, a builder row's arrows, a phone's •••): no button or link in any
// page or script is only a glyph, and none is set to one
test('no glyph for an icon in the source: every close, arrow, ellipsis, plus and minus is an icon from the set', async () => {
  const fs = require('fs'), path = require('path'), { ROOT } = require('../site');
  const files = ['index.html', '404.html', 'privacy.html', 'admin.html', 'add.js', 'nav.js', 'post.js', 'bare.js', 'spinetip.js',
    ...['build', 'feed', 'people', 'settings', 'shelves', 'u', 'p', 'notifications'].map(d => d + '/index.html')];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    expect(src.match(/>\s*[×✕↑↓▾▸•·+−]+\s*<\/(button|a)>/gu) || [], f).toEqual([]);
    expect(src.match(/textContent = '[×✕↑↓▾▸•·+−]+'/gu) || [], f).toEqual([]);
    expect(src.match(/\p{Extended_Pictographic}/gu) || [], f).toEqual([]);
  }
});

// one spacing scale, in steps of 8px (site.css's --s1 to --s6: 4, 8, 16, 24, 40): every margin, padding and gap written
// in the pages and scripts is one of 0, 4, 8, 16, 24, 32, 40 or 48px. Off it on purpose: 1px where borders overlap,
// 2px between spines (they stand as books do), and a press area, padding that a negative margin of the same size takes
// back (or 44px kept clear for a button over a row), which is never seen
test('one 8px spacing scale: no margin, padding or gap off it in any page or script', async () => {
  const fs = require('fs'), path = require('path'), { ROOT } = require('../site');
  const files = ['site.css', 'add.js', 'nav.js', 'post.js', 'bare.js', 'spinetip.js', 'index.html', '404.html', 'privacy.html',
    ...['build', 'feed', 'people', 'settings', 'shelves', 'u', 'p', 'notifications'].map(d => d + '/index.html')];
  const SCALE = [0, 4, 8, 16, 24, 32, 40, 48], off = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/var\(--[\w-]+,[^)]*\)/g, 'VAR');   // a fallback is the token's own value
    for (const rule of src.match(/[^{}]*\{[^{}]*\}/g) || []) {
      const body = rule.slice(rule.indexOf('{') + 1);
      for (const [, prop, val] of body.matchAll(/(?<![-\w])((?:margin|padding)(?:-[a-z]+)?|(?:row-|column-)?gap)\s*:\s*([^;}]+)/g)) {
        for (const n of (val.match(/(?<![\w.-])-?\d+(?:\.\d+)?px/g) || []).map(v => Math.abs(parseFloat(v)))) {
          if (SCALE.includes(n) || n === 1) continue;
          if (n === 2 && /gap/.test(prop) && /spine|strip|sline|\.spines|\.sl\b/.test(rule)) continue;
          if (/padding/.test(prop) && new RegExp(`margin(-[a-z]+)?:[^;}]*-${n}px`).test(body)) continue;   // a press area
          if (n === 44 && /pointer:coarse/.test(src.slice(Math.max(0, src.indexOf(rule) - 40), src.indexOf(rule)) + rule)) continue;
          if (/margin/.test(prop) && new RegExp(`padding(-[a-z]+)?:[^;}]*\\b${n}px`).test(body)) continue;   // its other half
          off.push(`${f}: ${prop}:${val.trim()}  (${rule.trim().split('{')[0].trim().slice(-50)})`);
        }
      }
    }
  }
  expect(off).toEqual([]);
});

// Pages that draw shelves (home, the builder, profiles) also load Geist Mono, for shelf.js's caption and a plain
// cover's title on the canvas, and the spines' own faces
test('every page sets its type in Courier Prime, loaded from Google Fonts at 400, 700 and italic 400', async () => {
  const fs = require('fs'), path = require('path'), { ROOT } = require('../site');
  const files = ['index.html', '404.html', 'privacy.html', 'admin.html', ...['build', 'feed', 'people', 'settings', 'shelves', 'u'].map(d => d + '/index.html')];
  for (const f of files) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8'), link = (html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/) || [''])[0];
    expect(link, f).toContain('family=Courier+Prime:ital,wght@0,400;0,700;1,400');
    expect(link, f).toContain('display=swap');
    if (!['index.html', 'build/index.html', 'u/index.html', 'feed/index.html', 'shelves/index.html'].includes(f)) expect(link, f).not.toContain('Geist');   // pages that draw spines (the feed: People to follow; Shelves: each shelf's spines)
  }
  expect(fs.readFileSync(path.join(ROOT, 'site.css'), 'utf8')).toMatch(/--mono:"Courier Prime",/);
});
for (const pg of [...PAGES, { name: 'privacy', path: '/privacy.html' }]) {
  test(`${pg.name}: the text, the bar and the buttons are in Courier Prime`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true });
    await open(page, pg.path);
    for (const sel of ['body', '.top a', '.btn:visible, button:visible']) {
      const el = page.locator(sel).first();
      if (await el.count()) expect((await css(el, 'fontFamily')).fontFamily, `${pg.name} ${sel}`).toMatch(/^"Courier Prime"/);
    }
  });
}

/* Every action row: a solid button, text actions and states ("Main shelf", "Following", "On your shelf") in one box,
   so each line of a row shares its top and every item its height (within 1px), on a wide window and at 390px */
const ROWS = '.sacts, .pbtns, #tPanel, .wacts, .tacts, .addbar, .lead, .mineacts, .ybar, .rbox .row, #oneItems .sact';
async function rowsLineUp(page, where){
  const bad = await page.evaluate(sel => [...document.querySelectorAll(sel)].filter(r => r.offsetParent).flatMap(row => {
    const items = [...row.children].filter(e => e.offsetParent && getComputedStyle(e).position !== 'absolute' && !e.matches('.menu, [role=menu], .pmenu, p, .note, label.addon, .addby'))
      .flatMap(e => e.matches('.pmenuwrap, .mineacts') ? [...e.children].filter(c => c.offsetParent && !c.matches('[role=menu], .pmenu')) : [e]);
    if (items.length < 2) return [];
    const box = items.map(e => { const r = e.getBoundingClientRect(); return { t: Math.round(r.top), h: Math.round(r.height), name: e.textContent.trim().slice(0, 20) || e.getAttribute('aria-label') }; });
    const out = [], h0 = box[0].h;
    for (const b of box) if (Math.abs(b.h - h0) > 1) out.push(`${row.className || row.id}: "${b.name}" is ${b.h}px tall, "${box[0].name}" ${h0}px`);
    for (const b of box) for (const c of box) if (Math.abs(b.t - c.t) > 1 && Math.abs(b.t - c.t) < h0) out.push(`${row.className || row.id}: "${b.name}" and "${c.name}" are on one line but ${Math.abs(b.t - c.t)}px apart`);
    return out;
  }), ROWS);
  expect([...new Set(bad)], where).toEqual([]);
}
for (const [name, path, opt] of [['a shelf of yours', `/u/?tester&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000003`, {}], ['someone\'s shelf', '/u/?mira&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000001', {}],
  ['your profile', '/u/?tester', {}], ['someone\'s profile', '/u/?mira', {}], ['your Up next', '/u/?tester#upnext', {}], ['your Recs', '/u/?tester#recs', { recs: true }],
  ['a title', '/t/?film=106', {}], ['a title you logged', '/t/?book=OL5W', {}], ['Shelves', '/shelves/', {}], ['a post', '/p/?bbbbbbbb-bbbb-4bbb-8bbb-000000000000', {}]]) {
  test(`action rows line up: ${name}`, async ({ page }) => {
    await mockNetwork(page, { signedIn: true, social: true, ...opt });
    await open(page, path);
    await rowsLineUp(page, name);
  });
}
