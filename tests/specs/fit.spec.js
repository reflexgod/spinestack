// Every page fits, at 390px and on a wide window: nothing is wider than the screen, no text is cut off (only where
// the page means to cut it, with … or a set number of lines, or inside a row that scrolls sideways), and no two bits
// of text sit on top of each other; and each page starts 24px under the bar. Every page and tab, and the dialogs and
// sheets open over them.
const { test, expect } = require('@playwright/test');
const { mockNetwork, open } = require('../site');

const ALL = { signedIn: true, social: true, recs: true, ids: true, friends: true };
const PLACES = [
  ['home', '/', ALL],
  ['home, signed out', '/', {}],
  ['feed', '/feed/?everyone', ALL],
  ['your profile', '/u/?tester', ALL],
  ['your Activity', '/u/?tester#activity', ALL],
  ['your Up next', '/u/?tester#upnext', ALL],
  ['your Recs', '/u/?tester#recs', ALL],
  ['your Shelves', '/u/?tester#shelves', ALL],
  ['your Network', '/u/?tester#network', ALL],
  ['someone\'s profile', '/u/?mira', ALL],
  ['someone\'s Shelves', '/u/?mira#shelves', ALL],
  ['a shelf of yours', '/u/?tester&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000003', ALL],
  ['someone\'s shelf', '/u/?mira&shelf=aaaaaaaa-aaaa-4aaa-8aaa-000000000001', ALL],
  ['a title', '/t/?film=106&title=Gummo&year=1997', ALL],
  ['a book you read', '/t/?book=OL5W', ALL],
  ['a post', '/p/?bbbbbbbb-bbbb-4bbb-8bbb-000000000000', ALL],
  ['Shelves', '/shelves/', ALL],
  ['People', '/people/?q=m', ALL],
  ['notifications', '/notifications/', ALL],
  ['settings', '/settings/', ALL],
  ['settings, photo', '/settings/#photo', ALL],
  ['the builder', '/build/?sample', ALL],
  ['the builder, Style open', '/build/?sample', ALL, async p => { await p.locator('#stylePanel summary').click(); }],
  ['+ ADD', '/feed/?everyone', ALL, async p => { await p.locator('header.top .add').click(); await p.locator('#addQ').fill('kids'); await p.locator('#addRows li').first().waitFor(); }],
  ['+ ADD, Log it', '/feed/?everyone', ALL, async p => { await p.locator('header.top .add').click(); await p.locator('#addQ').fill('gummo'); await p.locator('#addRows li').first().click(); await p.locator('#addPostGo').waitFor(); }],
  ['+ ADD, Put on shelf', '/feed/?everyone', ALL, async p => { await p.locator('header.top .add').click(); await p.locator('input[name=addWhat][value=shelf]').check(); await p.locator('#addQ').fill('gummo'); await p.locator('#addRows li').first().click(); await p.locator('#addFound .art').first().waitFor(); }],
  ['the Recommend sheet', '/feed/?everyone', ALL, async p => { const post = p.locator('#items .post').filter({ hasText: 'watched Gummo' }).first(); await post.getByRole('button', { name: /^Share/ }).click(); await post.getByRole('menuitem', { name: 'Recommend' }).click(); await p.locator('.recsheet').waitFor(); }],
  ['search', '/feed/?everyone', ALL, async p => { await p.locator('header.top .find').click(); await p.locator('#srchQ').fill('kids'); await p.locator('.srch .srchg').first().waitFor(); }],
  ['the edit sheet', '/feed/?everyone', ALL, async p => { const post = p.locator('#items .post').filter({ hasText: 'read Just Kids' }).first(); await post.getByRole('button', { name: 'More for this post' }).click(); await post.getByRole('menuitem', { name: 'Edit' }).click(); await p.locator('.editbox').waitFor(); }],
];

// what doesn't fit on the page as it is: things past the screen's edges, text cut off, text on text
const misfits = page => page.evaluate(() => {
  const out = [], vw = document.documentElement.clientWidth;
  const shown = el => { for (let e = el; e; e = e.parentElement){ const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || e.hidden) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const hiddenAway = el => { const s = getComputedStyle(el); return s.position === 'absolute' && (s.clip === 'rect(0px, 0px, 0px, 0px)' || el.getBoundingClientRect().width <= 1); };
  const scroller = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement){ const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowX + s.overflowY) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)) return e; } return null; };
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
  // 1. nothing wider than the screen
  if (document.documentElement.scrollWidth > vw) out.push(`the page is ${document.documentElement.scrollWidth - vw}px wider than the screen`);
  const scope = document.querySelector('dialog[open]') || document.querySelector('.sheet:not([hidden])') || document.querySelector('.srch:not([hidden])') || document.body;
  for (const el of scope.querySelectorAll('*')){
    if (!shown(el) || hiddenAway(el) || el.closest('svg, canvas')) continue;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if ((r.right > vw + 1 || r.left < -1) && !scroller(el) && s.position !== 'fixed') out.push(`${name(el)} reaches past the screen's edge (${Math.round(r.left)} to ${Math.round(r.right)})`);
    // 2. text cut off: a box that hides what's in it, without saying so (… or a set number of lines)
    const hides = /(hidden|clip)/.test(s.overflowX + s.overflowY), own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hides && own && !el.matches('.vh')){
      const wide = el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis', tall = el.scrollHeight > el.clientHeight + 1 && s.webkitLineClamp === 'none' && !/-webkit-box/.test(s.display);
      if (wide || tall) out.push(`${name(el)} "${el.textContent.trim().slice(0, 24)}" is cut off ${wide ? 'at its side' : 'at its foot'}`);
    }
  }
  // 3. text on text: no two runs of words share any space (the visually hidden, a spoiler's blur and stacked layers aside)
  const runs = [], walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() && n.parentElement && shown(n.parentElement) && !hiddenAway(n.parentElement) && !n.parentElement.closest('.vh, .sayt, option, select, script, style, [aria-hidden="true"] .cvt') ? 1 : 2 });
  // each run as it's seen: cut to every box round it that hides what's past its edges (a name cut with …)
  const seen = (b, el) => { let { left, right, top, bottom } = b;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement){ const s = getComputedStyle(e); if (!/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflowY)) continue;
      const c = e.getBoundingClientRect(); left = Math.max(left, c.left); right = Math.min(right, c.right); top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); }
    return { left, right, top, bottom, width: right - left, height: bottom - top }; };
  for (let n; (n = walk.nextNode());){ const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()){ const b = seen(r, n.parentElement); if (b.width > 1 && b.height > 1) runs.push({ b, el: n.parentElement, t: n.textContent.trim().slice(0, 20) }); } }
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++){
    const a = runs[i], c = runs[j]; if (a.el === c.el) continue;
    const x = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left), y = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
    if (x > 2 && y > 2 && !scroller(a.el) === !scroller(c.el)) out.push(`"${a.t}" and "${c.t}" sit on top of each other`);
  }
  return [...new Set(out)];
});

for (const [where, path, opts, act] of PLACES) {
  test(`fits: ${where}`, async ({ page }) => {
    await mockNetwork(page, opts);
    await open(page, path);
    // every page starts 24px under the bar (the post page's way back, a shelf's page, the builder's title too)
    if (!act) expect(await page.evaluate(() => { const m = document.querySelector('main'), first = [...m.querySelectorAll('*')].find(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return r.height > 1 && r.width > 1 && s.visibility !== 'hidden' && s.position !== 'absolute'; });
      return Math.round(first.getBoundingClientRect().top - document.querySelector('header.top').getBoundingClientRect().bottom); })).toBe(24);
    if (act) await act(page);
    await page.waitForTimeout(150);
    expect(await misfits(page)).toEqual([]);
  });
}
