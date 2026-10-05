/* One search for the whole site, from the search icon in the top bar (nav.js loads this file the first time the icon
   is pressed, or a pointer or finger is on it). Search.open(from) opens a box at the top of the page; on a phone it's
   the whole screen, with the keyboard up. As you type, three groups: Films, Books and People, five each, with See all
   for the rest of what was found.
     Films and books: the Worker's /identify, the same search as + ADD's (up to five of each, closest title first), each
     with a small cover, its title, year and director or author, to its title's page (/t/, Nav.titleUrl()).
     People: find_people() (0006), by the start of a username or a name, with their photo, to their profile.
   With nothing typed it shows your recent searches (the last 8 you went somewhere from), kept in this browser only,
   with Clear. ↓ ↑ go through what's shown, Enter on the box opens the first thing found, Esc shuts it.
   The People page keeps its own Find box. Load it after nav.js and worker-address.js. */
(() => {
if (window.Search) return;
const ROOT = new URL('.', document.currentScript.src).href;   // the site's root: this file sits there
const SB_URL = String(window.SPINESTACK_SUPABASE_URL || '').trim().replace(/\/+$/, ''), SB_KEY = String(window.SPINESTACK_SUPABASE_KEY || '').trim();
const worker = () => String(window.SPINESTACK_WORKER || '').trim().replace(/\/+$/, '');   // read each time: worker-address.js can change it
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SHOW = 5, WAIT = 250, KEEP = 'shelfstackd-searches', MOST = 8;
// Lucide 1.49.0 (ISC), as in the bar
const ICON = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const GLASS = '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>', CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';

const css = document.createElement('style');
css.textContent = `
.srch{position:fixed;inset:0;z-index:45;background:rgba(0,0,0,.35);display:flex;justify-content:center;align-items:flex-start;padding:72px var(--s4,16px) var(--s4,16px)}
.srch[hidden]{display:none}
.srch .vh{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;padding:0}
.srchbox{background:var(--paper,#fff);color:var(--ink,#000);border:1px solid var(--ink,#000);border-radius:var(--radius,3px);width:100%;max-width:640px;max-height:calc(100% - 16px);display:flex;flex-direction:column;overflow:hidden}
.srchtop{display:flex;align-items:center;gap:var(--s2,8px);padding:var(--s2,8px) var(--s4,16px);border-bottom:1px solid var(--hair,#D9D9D9)}
.srchtop svg{width:16px;height:16px;flex:none;color:var(--grey,#6B6B6B)}
.srchtop input{flex:1;min-width:0;border:0;border-radius:0;padding:var(--s2,8px) 0;font:400 16px var(--mono,monospace);background:none;color:inherit;-webkit-appearance:none;appearance:none}
.srchtop input:focus{outline:0}
.srchtop input::-webkit-search-cancel-button{display:none}
.srchbody{overflow:auto;overscroll-behavior:contain;padding:0 0 var(--s4,16px)}
.srchg{margin:0}
.srchg h2,.srchrec h2{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s4,16px);margin:var(--s4,16px) var(--s4,16px) var(--s1,4px);padding:0;border:0;font:400 var(--fs-label,10px)/1.5 var(--mono,monospace);letter-spacing:var(--track,.08em);text-transform:uppercase;color:var(--grey,#6B6B6B)}
.srchg ul,.srchrec ul{list-style:none;margin:0;padding:0}
.srch .sr{display:flex;align-items:center;gap:var(--s4,16px);width:100%;box-sizing:border-box;padding:var(--s1,4px) var(--s4,16px);min-height:44px;text-decoration:none;color:inherit;background:none;border:0;font:inherit;text-align:left;cursor:pointer}
.srch .sr:hover,.srch .sr:focus-visible{background:var(--wash,#F3F3F3);outline:0}
.srch .sr .cv{width:32px;height:48px;flex:none;display:block;object-fit:cover;background:var(--wash,#F3F3F3);outline:1px solid var(--hair,#D9D9D9);outline-offset:-1px}
.srch .sr .av{width:32px;height:32px;flex:none;border-radius:50%;border:1px solid var(--ink,#000);background:var(--wash,#F3F3F3);overflow:hidden;display:grid;place-items:center;text-transform:uppercase;font-size:var(--fs-small,11px)}
.srch .sr .av img{width:100%;height:100%;object-fit:cover;display:block}
.srch .sr .tx{min-width:0;display:grid}
.srch .sr .tx b{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srch .sr .tx span{color:var(--grey,#6B6B6B);font-size:var(--fs-small,11px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srch .sr > svg{width:16px;height:16px;flex:none;color:var(--grey,#6B6B6B)}
.srch .srall,.srch .srclear{background:none;border:0;padding:0;font:400 var(--fs-small,11px) var(--mono,monospace);letter-spacing:0;text-transform:none;color:var(--grey,#6B6B6B);cursor:pointer;position:relative}
.srch .srall:hover,.srch .srclear:hover,.srch .srall:focus-visible,.srch .srclear:focus-visible{color:var(--ink,#000)}
.srch .srnote{margin:var(--s4,16px) var(--s4,16px) 0;color:var(--grey,#6B6B6B)}
.srch .srnote:empty{display:none}
.srch .srnone{margin:0 var(--s4,16px);color:var(--grey,#6B6B6B);font-size:var(--fs-small,11px)}
@media (max-width:640px){
  /* a phone: the whole screen, the box at the top with Cancel beside it */
  .srch{padding:0;background:var(--paper,#fff)}
  .srchbox{max-width:none;max-height:none;height:100%;border:0;border-radius:0}
}
@media (pointer:coarse){
  .srchtop .dash{min-height:44px}
  /* See all and Clear: 44px to press, the group's label as tall */
  .srchg h2,.srchrec h2{align-items:center;margin-top:var(--s2,8px);margin-bottom:0}
  .srch .srall,.srch .srclear{min-height:44px;min-width:44px;text-align:right}
}`;
document.head.appendChild(css);

/* ---------- recent searches: this browser only ---------- */
const recent = () => { try { const a = JSON.parse(localStorage.getItem(KEEP) || '[]'); return Array.isArray(a) ? a.filter(s => typeof s === 'string' && s.trim()).slice(0, MOST) : []; } catch { return []; } };
function remember(q){
  q = String(q || '').trim().replace(/\s+/g, ' ').slice(0, 120); if (!q) return;
  try { localStorage.setItem(KEEP, JSON.stringify([q, ...recent().filter(s => s.toLowerCase() !== q.toLowerCase())].slice(0, MOST))); } catch {}
}
const forget = () => { try { localStorage.removeItem(KEEP); } catch {} };

/* ---------- the box ---------- */
const box = document.createElement('div');
box.className = 'srch'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Search');
box.innerHTML = `<div class="srchbox">
  <div class="srchtop">${ICON(GLASS)}<label class="vh" for="srchQ">Search films, books and people</label><input type="search" id="srchQ" placeholder="Films, books, people" maxlength="120" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" aria-controls="srchBody"><button class="dash" type="button" data-shut>Cancel</button></div>
  <div class="srchbody" id="srchBody"><p class="srnote" role="status" aria-live="polite"></p><div class="srchres"></div></div>
</div>`;
document.body.appendChild(box);
const $ = s => box.querySelector(s), input = $('#srchQ'), res = $('.srchres'), note = $('.srnote');

let from = null, t = 0, run = 0, ctl = null, shownFor = '';
const S = {q: '', movie: null, book: null, people: null, all: {}};   // null: still looking; 'error': no answer

function open(btn){
  from = btn || document.activeElement;
  if (box.hidden){
    box.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  input.focus(); input.select();
  if (!input.value.trim()) paintRecent();
}
function shut(){
  if (box.hidden) return;
  box.hidden = true; clearTimeout(t); run++; if (ctl){ ctl.abort(); ctl = null; }
  document.documentElement.style.overflow = '';
  if (from && from.setAttribute) from.setAttribute('aria-expanded', 'false');
  if (from && from.focus && from.isConnected) from.focus();
}

/* ---------- what's shown ---------- */
const avaHtml = p => p.avatar_key ? `<img src="${esc(`${worker()}/m/img?k=${encodeURIComponent(p.avatar_key)}`)}" alt="" loading="lazy">` : esc((((p.display_name || '').trim() || p.username || '·').trim()[0]) || '·');
const titleRow = m => {
  const cover = m.cover ? `${worker()}/img?url=${encodeURIComponent(m.cover)}` : '', what = [m.year, m.creator].filter(Boolean).join(' · ');
  return `<li><a class="sr" href="${esc(window.Nav && Nav.titleUrl ? Nav.titleUrl(m) : ROOT + 't/')}">${cover ? `<img class="cv" src="${esc(cover)}" alt="" loading="lazy">` : '<span class="cv" aria-hidden="true"></span>'}<span class="tx"><b>${esc(m.title)}</b>${what ? `<span>${esc(what)}</span>` : ''}</span></a></li>`;
};
const personRow = p => {
  const name = (p.display_name || '').trim();
  return `<li><a class="sr" href="${esc(ROOT + 'u/?' + encodeURIComponent(p.username))}"><span class="av" aria-hidden="true">${avaHtml(p)}</span><span class="tx"><b>${name ? esc(name) : '@' + esc(p.username)}</b>${name ? `<span>@${esc(p.username)}</span>` : ''}</span></a></li>`;
};
const GROUPS = [['movie', 'Films', titleRow], ['book', 'Books', titleRow], ['people', 'People', personRow]];
function paint(){
  const q = S.q, looking = GROUPS.some(([k]) => S[k] === null), any = GROUPS.some(([k]) => Array.isArray(S[k]) && S[k].length);
  res.innerHTML = GROUPS.filter(([k]) => Array.isArray(S[k]) && S[k].length).map(([k, label, row]) => {
    const list = S[k], all = !!S.all[k], more = list.length - SHOW;
    return `<section class="srchg" data-g="${k}" aria-labelledby="srh-${k}"><h2 id="srh-${k}"><span>${label}</span>${more > 0 && !all ? `<button class="srall" type="button" data-all="${k}" aria-label="See all ${list.length} ${label.toLowerCase()}">See all (${list.length})</button>` : ''}</h2>
      <ul>${(all ? list : list.slice(0, SHOW)).map(row).join('')}</ul></section>`;
  }).join('');
  const failed = GROUPS.filter(([k]) => S[k] === 'error').length;
  note.textContent = looking && !any ? 'Searching…' : !looking && !any ? (failed ? 'The search didn’t answer. Try again in a moment.' : `Nothing found for “${q}”.`) : '';
}
function paintRecent(){
  S.q = ''; shownFor = '';
  const list = recent();
  note.textContent = '';
  res.innerHTML = list.length ? `<section class="srchrec" aria-labelledby="srh-rec"><h2 id="srh-rec"><span>Recent searches</span><button class="srclear" type="button" data-clear>Clear</button></h2>
    <ul>${list.map(s => `<li><button class="sr" type="button" data-again="${esc(s)}">${ICON(CLOCK)}<span class="tx"><b>${esc(s)}</b></span></button></li>`).join('')}</ul></section>` : '';
}

/* ---------- searching ---------- */
// people: the username or name as typed first, then those starting with it, then the rest (as the People page has them)
function closestFirst(rows, q){
  const w = q.replace(/^@+/, '').toLowerCase(), how = p => { const u = (p.username || '').toLowerCase(), n = (p.display_name || '').toLowerCase();
    return u === w || n === w ? 0 : u.startsWith(w) || n.startsWith(w) ? 1 : 2; };
  return rows.map((p, i) => ({p, i, c: how(p)})).sort((a, b) => a.c - b.c || a.i - b.i).map(x => x.p);
}
async function go(q){
  clearTimeout(t);
  q = q.trim();
  if (!q){ paintRecent(); return; }
  if (q === shownFor) return;
  const mine = ++run; shownFor = q;
  if (ctl) ctl.abort();
  const c = ctl = new AbortController(), signal = c.signal;
  Object.assign(S, {q, movie: null, book: null, people: null, all: {}});
  paint();
  const titles = q.replace(/^@+/, '').length < 2 || /^@/.test(q) ? Promise.resolve([])   // "@div" is a person
    : fetch(`${worker()}/identify?want=all&q=${encodeURIComponent(q)}&suggest=1`, {signal}).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status))).then(j => j.results || []);
  const people = !SB_URL ? Promise.resolve([]) : fetch(`${SB_URL}/rest/v1/rpc/find_people`, {method: 'POST', signal, headers: {apikey: SB_KEY, 'Content-Type': 'application/json'}, body: JSON.stringify({q})})
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)));
  const done = fn => v => { if (mine !== run) return; fn(v); paint(); };
  const failed = keys => e => { if (mine !== run || (e && e.name === 'AbortError')) return; for (const k of keys) S[k] = 'error'; paint(); };
  titles.then(done(list => { S.movie = list.filter(m => m.kind === 'movie'); S.book = list.filter(m => m.kind !== 'movie'); }), failed(['movie', 'book']));
  people.then(done(rows => { S.people = closestFirst(Array.isArray(rows) ? rows : [], q); }), failed(['people']));
}

input.addEventListener('input', () => {
  clearTimeout(t);
  if (!input.value.trim()){ run++; if (ctl){ ctl.abort(); ctl = null; } paintRecent(); return; }
  t = setTimeout(() => go(input.value), WAIT);
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter'){
    e.preventDefault();
    const q = input.value.trim(); if (!q) return;
    if (q !== shownFor){ go(q); return; }   // at once, without the wait
    const first = res.querySelector('a.sr'); if (first){ remember(q); first.click(); }
  } else if (e.key === 'ArrowDown'){ const f = res.querySelector('.sr'); if (f){ e.preventDefault(); f.focus(); } }
});
// ↓ ↑ through what's shown, from the box
box.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ e.preventDefault(); shut(); return; }
  if (e.key === 'Tab'){   // the focus stays in the box while it's open
    const all = [...box.querySelectorAll('input, button, a[href]')].filter(el => el.offsetParent !== null), i = all.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0){ e.preventDefault(); all[all.length - 1].focus(); } else if (!e.shiftKey && i === all.length - 1){ e.preventDefault(); all[0].focus(); }
    return;
  }
  if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.target === input) return;
  const rows = [...res.querySelectorAll('.sr')], i = rows.indexOf(document.activeElement); if (i < 0) return;
  e.preventDefault();
  if (e.key === 'ArrowUp' && i === 0){ input.focus(); return; }
  rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
});
box.addEventListener('click', e => {
  if (e.target === box || e.target.closest('[data-shut]')){ shut(); return; }
  const all = e.target.closest('[data-all]');
  if (all){ const k = all.dataset.all; S.all[k] = true; paint(); const first = res.querySelectorAll(`[data-g="${k}"] .sr`)[SHOW]; if (first) first.focus(); return; }
  if (e.target.closest('[data-clear]')){ forget(); paintRecent(); input.focus(); return; }
  const again = e.target.closest('[data-again]');
  if (again){ input.value = again.dataset.again; go(input.value); input.focus(); return; }
  const a = e.target.closest('a.sr');
  if (a) remember(S.q);   // where it went from: the link goes on as links do
});

window.Search = {open, shut, isOpen: () => !box.hidden, recent};
})();
