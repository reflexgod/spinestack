/* The top bar's behaviour, the same on every page. Each page keeps its own copy of the bar's markup and CSS; this file
   fills in who is signed in, builds the two menus (the account menu, and the ▾ next to + ADD) and opens and closes
   them. A page calls Nav.paint({sb, user, profile, unreachable}) whenever that changes (sb: its Supabase client, once
   it has one; profile: id, username, display_name, avatar_key; unreachable: signed in, but the account couldn't be
   read, so the bar offers neither Sign in nor Finish sign-up), and says what its own Sign in, Finish sign-up and Sign out do:
   Nav.onSignIn(fn), Nav.onFinish(fn), Nav.onSignOut(fn). + ADD opens the Add dialog (add.js, loaded the first time
   it's pressed), which reads who is signed in with Nav.account() and asks to sign in with Nav.signIn().
   Signed out the site is read only: + ADD, and anything a page sends to Nav.needAccount('build' | 'add'), opens the
   page's sign-in sheet ("Sign in to start your shelf.") instead, and once signed in the person is taken where they
   were going: the builder, or the Add dialog.
   Load it after shelf.js and worker-address.js, before the page's own script. */
(() => {
  const ROOT = new URL('.', document.currentScript.src).href;   // the site's root: this file sits there
  const bar = document.querySelector('header.top'); if (!bar) return;
  const q = s => bar.querySelector(s);
  const acctBtn = q('#acctBtn'), signBtn = q('#signInBtn'), moreBtn = q('#addMore'), addWrap = q('.addwrap');
  const on = {signIn: null, finish: null, signOut: null, upload: null};
  let state = {sb: null, user: null, profile: null};

  /* Floating UI keeps a menu on screen (it flips and shifts it). Only someone signed in has menus, so only they load
     it; until it arrives, or if it can't, a menu sits under its button, held inside the window. */
  const LIBS = [
    {src: 'https://cdn.jsdelivr.net/npm/@floating-ui/core@1.8.0/dist/floating-ui.core.umd.min.js', integrity: 'sha384-HNCdK6HYLs4EKIDg2Ml3NdfNMVD/LcFbGXnagRABpWmpJjiEuhrtSIckScRnqDOD'},
    {src: 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.8.0/dist/floating-ui.dom.umd.min.js', integrity: 'sha384-h02fHnOrZRtL8NvKyMkr2vfTxUr0lTnQdZexzrbPfME4nd74qGfOZ97tbiroJo1Y'},
  ];
  let libsAsked = false;
  function loadLibs(){
    if (libsAsked) return; libsAsked = true;
    for (const lib of LIBS){
      const s = document.createElement('script'); s.src = lib.src; s.integrity = lib.integrity; s.crossOrigin = 'anonymous'; s.async = false;   // in this order
      s.onerror = () => s.remove();
      document.head.appendChild(s);
    }
  }

  const css = document.createElement('style');
  css.textContent = `
.navmenu{position:fixed;z-index:50;inset:auto;left:0;top:0;margin:0;min-width:180px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:var(--s1,4px) 0;
  border:1px solid var(--ink,#000);border-radius:var(--radius,3px);background:var(--paper,#fff);color:var(--ink,#000)}
.navmenu a,.navmenu button{display:block;width:100%;box-sizing:border-box;text-align:left;background:none;border:0;border-radius:0;margin:0;padding:var(--s2,8px) var(--s4,16px);
  font:500 var(--fs-nav,12px)/1.4 var(--mono,monospace);text-transform:uppercase;letter-spacing:var(--track,1px);color:inherit;text-decoration:none;white-space:nowrap;cursor:pointer}
.navmenu a:hover,.navmenu button:hover,.navmenu a:focus-visible,.navmenu button:focus-visible{background:var(--wash,#F3F3F3);outline:0}
.navmenu a[aria-current]{font-weight:700}
.navmenu hr{border:0;border-top:1px solid var(--hair,#D9D9D9);margin:var(--s1,4px) 0}
@media (pointer:coarse){ .navmenu a,.navmenu button{padding-top:14px;padding-bottom:14px} }   /* 44px rows to press on a touch screen */`;
  document.head.appendChild(css);

  /* ---------- the menus ---------- */
  const menus = [];
  function makeMenu(id, label, btn, {hover = false, placement = 'bottom-start'} = {}){
    const menu = document.createElement('div');
    menu.id = id; menu.className = 'navmenu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', label);
    const top = typeof menu.showPopover === 'function';   // the browser's top layer: over every sheet, never cut off
    if (top) menu.setAttribute('popover', 'manual'); else menu.hidden = true;
    document.body.appendChild(menu);
    btn.setAttribute('aria-controls', id);
    let open = false, stop = null, leaveT = 0, byHover = false;
    const items = () => [...menu.querySelectorAll('[role="menuitem"]')];
    function place(){
      const F = window.FloatingUIDOM;
      if (F) F.computePosition(btn, menu, {strategy: 'fixed', placement, middleware: [F.offset(8), F.flip({padding: 8}), F.shift({padding: 8})]})
        .then(({x, y}) => { menu.style.left = x + 'px'; menu.style.top = y + 'px'; });
      else {
        const r = btn.getBoundingClientRect(), w = menu.offsetWidth, left = placement === 'bottom-end' ? r.right - w : r.left;
        menu.style.left = Math.max(8, Math.min(left, innerWidth - w - 8)) + 'px'; menu.style.top = r.bottom + 8 + 'px';
      }
    }
    function show(focusFirst){
      if (open) return;
      for (const m of menus) if (m.hide !== hide) m.hide(false);
      open = true; byHover = false;
      if (top) menu.showPopover(); else menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      for (const a of menu.querySelectorAll('a')){   // where you are now
        const u = new URL(a.href);
        if (u.pathname === location.pathname && u.search === location.search && u.hash === location.hash) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      }
      place();
      const F = window.FloatingUIDOM;
      if (F) stop = F.autoUpdate(btn, menu, place);
      else { addEventListener('resize', place); addEventListener('scroll', place, true); stop = () => { removeEventListener('resize', place); removeEventListener('scroll', place, true); }; }
      if (focusFirst && items()[0]) items()[0].focus();
    }
    function hide(refocus){
      if (!open) return;
      open = false; clearTimeout(leaveT);
      if (top) menu.hidePopover(); else menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (stop){ stop(); stop = null; }
      if (refocus) btn.focus();
    }
    // a tap or a key press opens and closes it; with a mouse it's open as soon as the pointer is on the button, so
    // the click that follows keeps it open
    btn.addEventListener('click', e => {
      if (open && byHover){ byHover = false; return; }
      if (open) hide(false); else show(e.detail === 0);
    });
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown'){ e.preventDefault(); show(false); if (items()[0]) items()[0].focus(); } });
    if (hover){
      const mouse = e => e.pointerType === 'mouse' && matchMedia('(hover: hover)').matches;
      btn.addEventListener('pointerenter', e => { if (!mouse(e)) return; clearTimeout(leaveT); if (!open){ show(false); byHover = true; } });
      menu.addEventListener('pointerenter', () => clearTimeout(leaveT));
      for (const el of [btn, menu]) el.addEventListener('pointerleave', e => { if (!mouse(e) || !open) return; clearTimeout(leaveT); leaveT = setTimeout(() => hide(false), 250); });
    }
    menu.addEventListener('keydown', e => {
      const list = items(), i = list.indexOf(document.activeElement), to = n => { e.preventDefault(); list[(n + list.length) % list.length].focus(); };
      if (e.key === 'ArrowDown') to(i + 1); else if (e.key === 'ArrowUp') to(i - 1); else if (e.key === 'Home') to(0); else if (e.key === 'End') to(list.length - 1);
      else if (e.key === 'Tab') hide(false);
    });
    document.addEventListener('pointerdown', e => { if (open && !btn.contains(e.target) && !menu.contains(e.target)) hide(false); });
    document.addEventListener('keydown', e => { if (open && e.key === 'Escape') hide(menu.contains(document.activeElement) || document.activeElement === btn); });
    const m = {menu, hide, isOpen: () => open};
    menus.push(m);
    return m;
  }
  const item = (text, href) => { const a = document.createElement('a'); a.setAttribute('role', 'menuitem'); a.href = href; a.textContent = text; return a; };

  // the account menu: Home, Profile, Shelf, Activity, Network, then Settings and Sign out (always last)
  let acctMenu = null, addMenu = null;
  function buildMenus(){
    if (acctMenu) return;
    acctMenu = makeMenu('acctMenu', 'Account', acctBtn, {hover: true, placement: 'bottom-start'});
    const out = document.createElement('button');
    out.type = 'button'; out.setAttribute('role', 'menuitem'); out.textContent = 'Sign out';
    out.addEventListener('click', () => { acctMenu.hide(false); if (on.signOut) on.signOut(); });
    acctMenu.out = out;
    // a link to another tab of the page you're on (Activity, on your own profile) loads nothing, so the menu shuts itself
    acctMenu.menu.addEventListener('click', e => { if (e.target.closest('a')) acctMenu.hide(false); });
    addMenu = makeMenu('addMenu', 'More ways to add', moreBtn, {placement: 'bottom-end'});
    addMenu.menu.append(item('Upload a scan', ROOT + 'build/#upload'));
    // on the builder it opens the file picker; from anywhere else the link goes to the builder's upload
    addMenu.menu.addEventListener('click', e => { addMenu.hide(false); if (on.upload){ e.preventDefault(); on.upload(); } });
  }
  function fillAccount(p){
    const mine = ROOT + 'u/?' + p.username;
    acctMenu.menu.replaceChildren(item('Home', ROOT), item('Profile', mine), item('Shelf', mine + '&shelf'), item('Activity', mine + '#activity'), item('Network', mine + '#network'),
      document.createElement('hr'), item('Settings', ROOT + 'settings/'), acctMenu.out);
  }

  /* ---------- who is signed in ---------- */
  let shownKey;   // the photo in the bar now, so a repaint doesn't load it again
  function paint(s){
    state = {sb: (s && s.sb) || null, user: (s && s.user) || null, profile: (s && s.profile) || null};
    const p = state.profile;
    acctBtn.hidden = !p; signBtn.hidden = !!p || !!(s && s.unreachable); moreBtn.hidden = !p;   // the places (⚡ · Shelves · Members · search) stay as they are, in one order, whoever you are
    addWrap.classList.toggle('split', !!p);
    if (!p){
      for (const m of menus) m.hide(false);
      signBtn.textContent = state.user ? 'Finish sign-up' : 'Sign in';
      signBtn.href = state.user ? ROOT + 'build/' : '#';
      shownKey = undefined;
      return;
    }
    buildMenus(); fillAccount(p); loadLibs();
    goOn();
    acctBtn.querySelector('.who').textContent = '@' + p.username;
    acctBtn.setAttribute('aria-label', '@' + p.username + ', your account');   // on a phone only the photo shows
    const ava = acctBtn.querySelector('.ava'), key = p.avatar_key || '';
    if (key !== shownKey || !key){
      shownKey = key;
      if (key){
        const im = new Image(); im.alt = '';
        im.src = String(window.SPINESTACK_WORKER || '').replace(/\/+$/, '') + '/m/img?k=' + encodeURIComponent(key);
        ava.replaceChildren(im);
      } else ava.textContent = ((p.display_name || '').trim() || p.username)[0] || '·';
    }
  }
  signBtn.addEventListener('click', e => {
    if (!state.user){ e.preventDefault(); plainSignIn(); if (on.signIn) on.signIn(); }
    else if (on.finish){ e.preventDefault(); on.finish(); }   // signed in, no username yet (elsewhere the link goes to the builder, which asks)
  });

  /* ---------- + ADD: the Add to your shelf dialog ---------- */
  // add.js draws spines with shelf.js, which every page with the bar loads. If either can't be had, + ADD is the
  // plain link to the builder it always was.
  const addLink = q('.add');
  let adding = null;
  // add.js, loaded once: the dialog, and the watchlist and title search a page can use without it
  function loadAdd(){
    if (window.Add) return Promise.resolve(true);
    if (!window.Shelf) return Promise.resolve(false);
    return adding = adding || new Promise(res => {
      const s = document.createElement('script'); s.src = ROOT + 'add.js?v=20261010a';
      s.onload = () => res(!!window.Add); s.onerror = () => { adding = null; s.remove(); res(false); };
      document.head.appendChild(s);
    });
  }
  function openAdd(opt){ return loadAdd().then(ok => { if (ok) window.Add.open(opt); return ok; }); }
  addLink.addEventListener('click', e => {
    if (visitor()){ e.preventDefault(); needAccount('add'); return; }   // signed out: nothing is added, or searched for
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // a new tab or window still gets the builder
    e.preventDefault();
    openAdd().then(ok => { if (!ok) location.href = addLink.href; });
  });

  /* ---------- signed out: look, don't add ---------- */
  // signed out: no one is signed in on this page and no session is kept on this device (a page signed in paints the
  // bar a moment after it opens; until then the kept session says so)
  const kept = () => { try { return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k)); } catch { return false; } };
  const visitor = () => !state.user && !kept();
  const GO = 'shelfstackd-after-signin', LINE = '#signSheet .sheetbox p:not(.note), #signinPane > p:not(.note)';
  // where they were going ('build' or 'add'), kept in this tab while Google signs them in; the sheet says why it's open
  function needAccount(go, item){
    try { sessionStorage.setItem(GO, JSON.stringify({go, item, at: Date.now()})); } catch {}
    const line = document.querySelector(LINE);
    if (line){ if (line.dataset.was == null) line.dataset.was = line.textContent; line.textContent = 'Sign in to start your shelf.'; }
    if (on.signIn) on.signIn(); else location.href = ROOT + 'build/';
  }
  // the bar's own Sign in: going nowhere in particular, with the sheet's usual line
  function plainSignIn(){
    try { sessionStorage.removeItem(GO); } catch {}
    const line = document.querySelector(LINE); if (line && line.dataset.was != null) line.textContent = line.dataset.was;
  }
  // signed in now (with a username): on to where they were going, once
  function goOn(){
    let g = null; try { g = JSON.parse(sessionStorage.getItem(GO) || 'null'); sessionStorage.removeItem(GO); } catch {}
    if (!g || Date.now() - g.at > 30 * 60e3) return;
    if (g.go === 'build' && !/\/build\/$/.test(location.pathname)) location.href = ROOT + 'build/';
    else if (g.go === 'add') openAdd();
    else if (g.go === 'watch' && g.item) loadAdd().then(ok => { if (ok) window.Add.watch(g.item); });
  }

  /* ---------- a watchlist button on a cover or a spine ----------
     Nav.watchable(host, item, {from, label}): a small bookmark on the host (a cover, a spine), shown on hover or focus
     with a mouse; on a touch screen a ••• beside it with one item, Add to watchlist. One press puts the title on your
     watchlist (add.js), then it says In watchlist. Signed out it's the sign-in sheet, and the title goes on once you're
     signed in. item: {kind, title, year, creator, cover}; from: whose log it came from (From friends). */
  const ICON_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><line x1="12" x2="12" y1="7" y2="13"/><line x1="15" x2="9" y1="10" y2="10"/></svg>';   // Lucide bookmark-plus
  const ICON_IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><path d="m9 10 2 2 4-4"/></svg>';   // Lucide bookmark-check
  const wcss = document.createElement('style');
  wcss.textContent = `
.wable{position:relative}
.wbtn{position:absolute;top:var(--s1,4px);left:var(--s1,4px);z-index:2;display:grid;place-items:center;width:26px;height:26px;padding:0;border:1px solid var(--ink,#000);border-radius:var(--radius,3px);
  background:var(--paper,#fff);color:var(--ink,#000);cursor:pointer;opacity:0;transition:opacity .12s}
.wbtn svg{width:14px;height:14px;display:block}
.wable:hover .wbtn,.wbtn:focus-visible,.wbtn.in{opacity:1}
.wbtn.in{background:var(--ink,#000);color:var(--paper,#fff);cursor:default}
.wmorewrap{display:none}
@media (pointer:coarse){
  .wbtn{display:none}
  .wmorewrap{display:inline-block;position:relative;flex:none}
  .wmore{display:grid;place-items:center;min-width:44px;height:44px;padding:0;border:0;background:none;color:var(--ink,#000);font:700 var(--fs-btn,11px) var(--mono,monospace);letter-spacing:.1em;cursor:pointer}
  .wmenu.up{top:auto;bottom:100%}
  .wmenu{position:absolute;top:100%;right:0;z-index:8;background:var(--paper,#fff);border:1px solid var(--ink,#000);border-radius:var(--radius,3px);padding:var(--s1,4px) 0;white-space:nowrap}
  .wmenu button{display:block;width:100%;min-height:44px;text-align:left;background:none;border:0;padding:0 var(--s4,16px);font:500 var(--fs-nav,12px) var(--mono,monospace);text-transform:uppercase;letter-spacing:var(--track,1px);color:inherit;cursor:pointer}
}`;
  document.head.appendChild(wcss);
  async function addToWatchlist(item, from){
    if (visitor()){ needAccount('watch', item); return false; }
    if (!(await loadAdd())) return false;
    const r = await window.Add.watch(item, {from});
    if (r.error) say(r.error);   // already on it (then it's In watchlist too), full, or it didn't save
    return r.ok;
  }
  // the page's own toast, when add.js isn't the one saying it
  function say(msg){ const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { t.hidden = true; }, 4200); }
  function watchable(host, item, opt = {}){
    const name = item.title + (item.year ? ` (${item.year})` : '');
    host.classList.add('wable');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wbtn'; b.innerHTML = ICON_ADD; b.setAttribute('aria-label', `Add ${name} to watchlist`); b.title = 'Add to watchlist';
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'wmore'; more.textContent = '•••'; more.setAttribute('aria-label', `More for ${name}`); more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div'); menu.className = 'wmenu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
    const mi = document.createElement('button'); mi.type = 'button'; mi.setAttribute('role', 'menuitem'); mi.textContent = 'Add to watchlist'; menu.append(mi);
    const done = () => {
      b.classList.add('in'); b.innerHTML = ICON_IN; b.setAttribute('aria-label', `${name}: in watchlist`); b.title = 'In watchlist'; b.disabled = true;
      mi.textContent = 'In watchlist'; mi.disabled = true;
    };
    const go = async e => { e.preventDefault(); e.stopPropagation(); menu.hidden = true; more.setAttribute('aria-expanded', 'false'); if (b.disabled) return; b.disabled = mi.disabled = true; const ok = await addToWatchlist(item, opt.from); if (ok) done(); else { b.disabled = mi.disabled = false; } };
    b.addEventListener('click', go); mi.addEventListener('click', go);
    more.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const open = menu.hidden; menu.hidden = !open; more.setAttribute('aria-expanded', String(open));
      if (open){   // no room under it on the screen: over it
        menu.classList.remove('up');
        const vv = window.visualViewport, foot = vv ? vv.offsetTop + vv.height : document.documentElement.clientHeight;
        if (menu.getBoundingClientRect().bottom > foot - 8) menu.classList.add('up');
      }
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)){ menu.hidden = true; more.setAttribute('aria-expanded', 'false'); } });
    const wrap = document.createElement('span'); wrap.className = 'wmorewrap'; wrap.append(more, menu);
    host.append(b);
    if (opt.moreIn) opt.moreIn.append(wrap); else host.after(wrap);
    if (opt.in) done();
    return {done};
  }

  // for the Add dialog: who is signed in, and the page's own way to sign in (or, with no username yet, to pick one)
  const account = () => ({...state});
  function signIn(){
    if (!state.user){ if (on.signIn) on.signIn(); else location.href = ROOT + 'build/'; }
    else if (on.finish) on.finish(); else location.href = ROOT + 'build/';
  }

  window.Nav = {paint, add: openAdd, loadAdd, watchable, account, signIn, needAccount, visitor, onSignIn: fn => { on.signIn = fn; }, onFinish: fn => { on.finish = fn; }, onSignOut: fn => { on.signOut = fn; }, onUpload: fn => { on.upload = fn; }};
})();
