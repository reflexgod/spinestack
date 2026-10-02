// On a phone every control takes a press 21px from its middle, up, down, left and right (a 44 x 44px target), on
// every page, in the Add dialog, the menus and the builder's Style. It asks the page what is under each point, as a
// finger would land. Left out: a link inside a sentence, and a label that only names the field beside it. The logo is
// in: the bar's two rows are 44px apart, middle to middle.
const { test, expect } = require('@playwright/test');
const { mockNetwork, open } = require('../site');

test.skip(({ isMobile }) => !isMobile, 'press areas are for touch screens');

const ACT = {
  style: async p => { await p.locator('#stylePanel summary').click(); },
  row: async p => { await p.locator('#books .bopen').first().click(); },
  add: async p => { await p.locator('header.top .add').click(); await p.locator('#addQ').fill('kids'); await p.locator('#addRows li').first().waitFor(); },
  spines: async p => { await p.locator('header.top .add').click(); await p.locator('#addQ').fill('gummo'); await p.locator('#addRows li').first().click(); await p.locator('#addFound .art').first().waitFor(); },
  log: async p => { await p.locator('header.top .add').click(); await p.locator('input[name=addWhat][value=log]').check(); await p.locator('#addQ').fill('gummo'); await p.locator('#addRows li').first().click(); await p.locator('#addPostGo').waitFor(); },
  acct: async p => { await p.locator('#acctBtn').click(); await p.locator('#acctMenu a').first().waitFor(); },
  more: async p => { await p.locator('#moreBtn').click(); },
  share: async p => { await p.locator('#shareBtn').click(); },
  signin: async p => { await p.locator('#signInBtn').click(); },
};
const RUNS = [
  ['signed out', {}, ['/', '/build/', '/feed/', '/shelves/', '/members/', '/u/?mira', '/u/?mira&shelf', '/privacy.html', '/nope/', '/feed/ signin']],
  ['signed in', { signedIn: true }, ['/', '/feed/?everyone', '/u/?tester', '/u/?tester#activity', '/u/?tester#network', '/u/?mira', '/u/?tester&shelf', '/members/?q=m', '/settings/', '/settings/#photo']],
  ['signed in, the builder and the dialogs', { signedIn: true }, ['/build/', '/build/ style', '/build/ row', '/feed/?everyone add', '/feed/?everyone spines', '/feed/?everyone log', '/feed/?everyone acct', '/u/?mira more', '/u/?tester&shelf share']],
  ['a new account', { signedIn: true, fresh: true }, ['/u/?tester', '/feed/']],
  ['no username yet', { signedIn: true, named: false }, ['/build/']],
];

// what's too small on the page as it is: "what it is, its size, and where a press 21px out lands instead"
const misses = page => page.evaluate(async () => {
  const out = [], scope = document.querySelector('dialog[open]') || document.querySelector('.sheet:not([hidden])') || document;
  const menus = [...document.querySelectorAll('.navmenu:popover-open, .menu:not([hidden])')];
  const sel = 'a[href], button, input:not([type=hidden]):not([type=file]), select, textarea, summary, label, [role=tab], [role=menuitem], [role=option]', seen = new Set();
  const name = h => h ? h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') + (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\s+/)[0] : '') : 'nothing';
  for (const root of menus.length ? menus : [scope]) for (const el of root.querySelectorAll(sel)) {
    if (seen.has(el)) continue; seen.add(el);
    if (el.tagName === 'LABEL' && !el.querySelector('input,select,textarea')) continue;   // it names the field beside it: the field is the target
    if (el.closest('details:not([open])') && el.tagName !== 'SUMMARY') continue;   // in a shut panel
    if (el.tagName === 'INPUT' && el.closest('label')) continue;   // its label is the target
    if (el.disabled || el.closest('[hidden]')) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') continue;
    if (!el.getBoundingClientRect().width) continue;
    if (el.tagName === 'A' && s.display === 'inline' && /\S/.test([...el.parentElement.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))) continue;   // a link in a sentence
    el.scrollIntoView({ block: 'center', inline: 'center' }); await new Promise(r => requestAnimationFrame(r));
    const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2, miss = [];
    for (const [dx, dy, n] of [[0, 0, 'middle'], [-21, 0, 'left'], [21, 0, 'right'], [0, -21, 'up'], [0, 21, 'down']]) {
      const h = document.elementFromPoint(cx + dx, cy + dy);
      if (h && (el.contains(h) || (el.tagName === 'LABEL' && el.control === h) || (h.tagName === 'LABEL' && h.control === el))) continue;
      if (el.matches('header.top .add') && n === 'right' && h && h.id === 'addMore') continue;   // + and ▾ are one button cut in two: they share a border
      miss.push(n + ': ' + name(h));
    }
    if (miss.length) out.push(`${name(el)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)} (${miss.join(', ')})`);
  }
  return out;
});

for (const [who, opts, places] of RUNS) test(`${who}: every control takes a press 44px across`, async ({ page }) => {
  test.setTimeout(90000);
  const found = [];
  await mockNetwork(page, opts);
  for (const place of places) {
    const [path, act] = place.split(' ');
    await open(page, path);
    if (act) await ACT[act](page);
    for (const m of await misses(page)) found.push(`${place}: ${m}`);
  }
  expect(found).toEqual([]);
});
