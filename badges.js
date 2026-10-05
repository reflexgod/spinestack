/* Badges, shown as Discord shows profile badges: a row of small square icons (22px, 6px apart) right under a
   profile's display name, on every profile, themed or not; and the most important one, small, beside the name on a
   post in the feed. Hovering one (a mouse) or pressing it (a phone) shows a small tooltip: its name, and one line.

   A badge is data: an id, its name, its line, and its picture, the file assets/badges/<id>.svg (the owner swaps in
   final art: whatever file is there is shown). Who has which is data too, a list of badges per person:
     founder    the usernames in FOUNDERS
     early-100  the first 100 profiles by signup order. Deciding that needs the database (private profiles can't be
                read from the page): docs/proposed-0012-badges.sql adds badges_of(), and once it's run, FROM_DB = true
                below makes the pages ask it. Until then: the usernames in EARLY, everyone on the live site when this
                was written (5 public profiles, so all of them are in the first 100).
   More badges later: a line in BADGES, and their people (with 0012, a row in the badges table).

   Badges.list(username)      the badges known now, most important first (no asking)
   Badges.of(profile)         a Promise of the same, asking the database first with 0012
   Badges.load(usernames)     asks the database for many at once (a page of posts), with 0012; nothing before
   Badges.row(ul, list)       fills a profile's row
   Badges.one(username)       the most important badge as a small button for a post's name line, or ''
   Load it before the page's own script; it needs nothing else. */
(() => {
  if (window.Badges) return;
  const ROOT = new URL('.', document.currentScript.src).href;   // the site's root: this file sits there
  const FROM_DB = false;   // set to true once docs/proposed-0012-badges.sql is run (badges_of())
  // in order of importance: the first a person has is the one beside their name on a post
  const BADGES = [
    {id: 'founder', name: 'Founder', line: 'built shelfstackd'},
    {id: 'early-100', name: 'Early 100', line: 'one of the first 100 on shelfstackd'},
  ];
  const FOUNDERS = ['viraaj'];
  const EARLY = ['viraaj', 'prathmesh', 'rudra', 'hardik', 'div'];   // the live site's people on 6 October 2026, by signup
  const SB_URL = String(window.SPINESTACK_SUPABASE_URL || '').trim().replace(/\/+$/, ''), SB_KEY = String(window.SPINESTACK_SUPABASE_KEY || '').trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fromDb = new Map();   // username -> [badge id], as badges_of() said

  const css = document.createElement('style');
  css.textContent = `
.badges{list-style:none;margin:var(--s1,4px) 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.badges li{line-height:0}
.badge{position:relative;display:block;width:22px;height:22px;padding:0;margin:0;border:0;border-radius:var(--radius,3px);background:none;cursor:pointer;line-height:0}
.badge img{display:block;width:100%;height:100%;border-radius:var(--radius,3px)}
.badge:focus-visible{outline:2px solid var(--ink,#000);outline-offset:2px}
.pbadge{width:14px;height:14px;flex:none;align-self:center}
.badgetip{position:fixed;z-index:60;max-width:min(280px,calc(100vw - 16px));padding:var(--s2,8px) var(--s4,16px);border-radius:var(--radius,3px);background:var(--ink,#000);color:var(--paper,#fff);
  font:400 var(--fs-small,11px)/1.45 var(--mono,monospace);pointer-events:none}
.badgetip b{display:block;font-weight:700}
@media (pointer:coarse){ .badge::before{content:"";position:absolute;top:-11px;bottom:-11px;left:-3px;right:-3px} }   /* a press: 44px tall, and to half the gap each side */`;
  document.head.appendChild(css);

  const byId = id => BADGES.find(b => b.id === id);
  const sorted = ids => BADGES.filter(b => ids.includes(b.id));
  function list(username){
    const u = String(username || '').toLowerCase();
    if (FROM_DB && fromDb.has(u)) return sorted(fromDb.get(u));
    return sorted([...(FOUNDERS.includes(u) ? ['founder'] : []), ...(EARLY.includes(u) ? ['early-100'] : [])]);
  }
  async function load(usernames){
    const want = [...new Set((usernames || []).map(u => String(u || '').toLowerCase()).filter(u => /^[a-z0-9_]{3,20}$/.test(u) && !fromDb.has(u)))];
    if (!FROM_DB || !want.length || !SB_URL) return;
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/badges_of`, {method: 'POST', headers: {apikey: SB_KEY, 'Content-Type': 'application/json'}, body: JSON.stringify({names: want.slice(0, 200)})});
      if (!r.ok) return;
      for (const row of await r.json()) fromDb.set(String(row.username).toLowerCase(), (row.badges || []).filter(byId));
      for (const u of want) if (!fromDb.has(u)) fromDb.set(u, []);
    } catch {}
  }
  async function of(p){ if (!p || !p.username) return []; await load([p.username]); return list(p.username); }
  const src = b => ROOT + 'assets/badges/' + b.id + '.svg';
  const button = (b, cls = '') => `<button type="button" class="badge${cls}" data-badge="${esc(b.id)}" aria-label="${esc(b.name)}: ${esc(b.line)}"><img src="${esc(src(b))}" alt="" width="22" height="22" decoding="async"></button>`;
  function row(ul, items){
    if (!ul) return;
    ul.innerHTML = items.map(b => `<li>${button(b)}</li>`).join('');
    ul.hidden = !items.length;
  }
  const one = username => { const b = list(username)[0]; return b ? button(b, ' pbadge') : ''; };

  /* the tooltip: one for the page, put by the badge, inside the window. A mouse shows it while it's over a badge; a
     press shows it until the next press, anywhere; the keyboard while a badge has the focus. Esc shuts it */
  let tip = null, on = null;
  function show(btn){
    const b = byId(btn.dataset.badge); if (!b) return;
    if (!tip){ tip = document.createElement('div'); tip.className = 'badgetip'; tip.id = 'badgeTip'; tip.setAttribute('role', 'tooltip'); document.body.append(tip); }
    tip.innerHTML = `<b>${esc(b.name)}</b>${esc(b.line)}`;
    tip.hidden = false; on = btn; btn.setAttribute('aria-describedby', 'badgeTip');
    const r = btn.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
    tip.style.top = (r.bottom + 8 + h > innerHeight - 8 ? r.top - 8 - h : r.bottom + 8) + 'px';
  }
  function hide(){ if (tip) tip.hidden = true; if (on) on.removeAttribute('aria-describedby'); on = null; }
  const badgeOf = e => e.target && e.target.closest ? e.target.closest('.badge[data-badge]') : null;
  document.addEventListener('pointerover', e => { const b = badgeOf(e); if (b && e.pointerType === 'mouse') show(b); });
  document.addEventListener('pointerout', e => { const b = badgeOf(e); if (b && e.pointerType === 'mouse' && on === b) hide(); });
  document.addEventListener('focusin', e => { const b = badgeOf(e); if (b && b.matches(':focus-visible')) show(b); });
  document.addEventListener('focusout', e => { if (badgeOf(e)) hide(); });
  document.addEventListener('click', e => {
    const b = badgeOf(e);
    if (!b){ if (on) hide(); return; }
    e.preventDefault(); e.stopPropagation();   // a badge on a post doesn't open the post
    if (on === b && e.pointerType !== 'mouse') hide(); else show(b);
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && on) hide(); });
  addEventListener('scroll', () => { if (on) hide(); }, {passive: true});

  window.Badges = {BADGES, list, of, load, row, one};
})();
