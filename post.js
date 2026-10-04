/* A log is a post. The feed (/feed/), a post's own page (/p/?<id>) and + ADD's Log it all use this file.
   Posts.ready()            is migration 0009 in the database (supabase/migrations/0009_social.sql)? It adds a log's rating,
                            review, spoiler, rewatch and date, likes, replies, me-too and notifications. Asked once a
                            page; until it's there nothing it adds shows, and a log is a caption of 280 as before.
   Posts.fields(host, m)    the composer's fields once a title is picked: the rating (five spines, halves, optional), the review,
                            and with 0009 Spoilers, Rewatch (Reread for a book) and the day. Gives {values(), clear(), focus()}.
   Posts.composer(host, {onPosted}) "What did you watch or read?": the title search, the picked title, the fields, Post.
   Posts.save(m, values)    posts a log of m ({kind, title, year, creator, cover}): {ok, row} or {error}.
   Posts.stats(ids)         post_stats() for these logs (0009): a Map of id to {rating, review, likes, replies, ...}.
   Posts.item(x, opt)       one post, an <li>: photo, @name, "watched Gummo", the stars, the worn cover, the review
                            (blurred until pressed when it has spoilers), when; and the row of actions: like, reply and
                            me too (0009), + Watchlist or In watchlist, Share, and ··· with Report (0009) or Delete.
                            Counts change at once and go back if the database says no.
   Posts.ago(t), Posts.stars(v): a rating (1 to 10) as five small spines in the logo's colours
   Load it after nav.js (Nav.account(), Nav.loadAdd(), Nav.needAccount()) and wear.js. */
(() => {
if (window.Posts) return;
const ROOT = new URL('.', document.currentScript.src).href;   // the site's root: this file sits there
const SB_URL = String(window.SPINESTACK_SUPABASE_URL || '').trim().replace(/\/+$/, ''), SB_KEY = String(window.SPINESTACK_SUPABASE_KEY || '').trim();
const WORKER = String(window.SPINESTACK_WORKER || '').trim().replace(/\/+$/, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const acct = () => (window.Nav && Nav.account ? Nav.account() : {}) || {};
const signedIn = () => { const a = acct(); return !!(a.sb && a.user && a.profile); };
// Lucide 1.49.0 (ISC), as in the bar
const ICON = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const HEART = '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>';
const BUBBLE = '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>';
const DOTS = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';

const css = document.createElement('style');
css.textContent = `
.vh{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;padding:0}
/* the composer: a box like a tweet's, your photo at its left; it grows while it has the focus */
.compose{display:grid;grid-template-columns:40px minmax(0,1fr);gap:var(--s3,12px);padding:var(--s4,16px) 0;border-bottom:1px solid var(--hair,#D9D9D9)}
.cava{width:40px;height:40px;border-radius:50%;border:1px solid var(--ink,#000);background:var(--wash,#F3F3F3);overflow:hidden;display:grid;place-items:center;text-transform:uppercase}
.cava img{width:100%;height:100%;object-fit:cover;display:block}
.cmain{min-width:0;display:grid;gap:var(--s2,8px)}
.csearch{position:relative;display:grid;gap:var(--s1,4px)}
.csearch input{border:0;border-radius:0;padding:var(--s2,8px) 0;font-size:var(--fs-dialog,16px);min-height:40px}
.csearch input:focus{outline:0}
.compose.open .csearch input{min-height:64px}
.csearch .note{margin:0;min-height:1.5em}
.compose:not(.open) .csearch .note:empty{display:none}
.csugg{list-style:none;margin:0;padding:var(--s1,4px) 0;position:absolute;top:calc(100% - 1.5em);left:0;right:0;z-index:7;background:var(--paper,#fff);border:1px solid var(--ink,#000);border-radius:var(--radius,3px)}
.csugg li{padding:var(--s2,8px) var(--s3,12px);cursor:pointer;display:flex;gap:var(--s1,4px) var(--s2,8px);flex-wrap:wrap;align-items:baseline}
.csugg li[aria-selected="true"]{background:var(--ink,#000);color:var(--paper,#fff)}
.csugg .y,.csugg .k,.csugg .by{color:var(--grey,#6B6B6B);font-size:var(--fs-small,11px)}
.csugg li[aria-selected="true"] :is(.y,.k,.by){color:inherit}
.cpost{display:grid;grid-template-columns:minmax(0,1fr) var(--cover,72px);gap:var(--s4,16px);align-items:start}
.ccov{line-height:0}
.ccov canvas{width:100%;height:auto;display:block}
.cpost h3{margin:0 0 var(--s3,12px);font-size:var(--fs-body,13px)}
.cpost h3 small{color:var(--grey,#6B6B6B);font-weight:400}
.cbar{display:flex;justify-content:flex-end;gap:var(--s4,16px);align-items:center;border-top:1px solid var(--hair,#D9D9D9);padding-top:var(--s2,8px)}
.compose:not(.open) .cbar{display:none}
.cbar .note{margin:0 auto 0 0}
/* a rating: five small rounded spines (see spineSvgs) */
.rating{display:inline-flex;align-items:flex-end;gap:3px;vertical-align:-2px}
.rating svg{width:7px;height:20px;display:block}
.rating.sm svg{width:6px;height:16px}
.rating[role=slider]{cursor:pointer;gap:6px;padding:var(--s2,8px) 0;outline-offset:4px;touch-action:none;user-select:none}
.rating[role=slider] svg{width:12px;height:32px}
.pfields{display:grid;gap:var(--s3,12px);min-width:0}
.pfields .lbl{display:block;margin-bottom:var(--s1,4px)}
.pfields textarea{font-size:var(--fs-body,13px)}
.prate{display:flex;align-items:center;gap:var(--s3,12px);flex-wrap:wrap}
.prate .lbl{margin:0}
.prate .rv{color:var(--grey,#6B6B6B);font-size:var(--fs-small,11px);min-width:6ch}
.popts{display:flex;gap:var(--s2,8px) var(--s5,24px);flex-wrap:wrap;align-items:center}
.popts input[type=date]{font:400 var(--fs-body,13px) var(--mono,monospace);border:1px solid var(--ink,#000);border-radius:var(--radius,3px);padding:var(--s1,4px) var(--s2,8px);background:var(--paper,#fff);color:var(--ink,#000)}
.pdate{display:flex;align-items:center;gap:var(--s2,8px)}
.pdate .lbl{margin:0}
.pcount{display:block;text-align:right;color:var(--grey,#6B6B6B);font-size:var(--fs-small,11px);margin-top:var(--s1,4px)}
/* a post, as on a timeline: no box, a thin rule under it (the list draws it); the photo at its left, the cover at its
   right, and the whole post a press through to its page */
.post{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:0 var(--s3,12px);align-items:start;padding:var(--s4,16px) 0;cursor:pointer}
.post.whole{cursor:auto}
.post .pava{width:40px;height:40px;border-radius:50%;border:1px solid var(--ink,#000);background:var(--wash,#F3F3F3);overflow:hidden;display:grid;place-items:center;text-transform:uppercase;text-decoration:none;color:var(--ink,#000)}
.post .pava img{width:100%;height:100%;object-fit:cover;display:block}
.post .pbody{min-width:0}
.post .cover{display:block;width:var(--cover,72px);line-height:0}
.post.whole .cover{width:120px}
.post .cover canvas{display:block;width:100%;height:auto}
.phead{display:flex;align-items:baseline;gap:var(--s1,4px);margin:0;min-width:0}
.phead .pwho{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
.phead .pwho b{font-weight:700}
.phead .pwho span,.phead .ago,.phead .ago a{color:var(--grey,#6B6B6B);text-decoration:none;white-space:nowrap}
.phead .pwho:hover b,.phead .ago a:hover{text-decoration:underline;text-underline-offset:3px}
.phead .pmore{margin-left:auto}
.pwhat{margin:var(--s1,4px) 0 0;font-weight:700;overflow-wrap:anywhere}
.pwhat a{text-decoration:none}
.pwhat a:hover,.pwhat a:focus-visible{text-decoration:underline;text-underline-offset:3px}
.pwhat .tag{font-weight:700;margin-left:var(--s1,4px)}
.prating{margin:var(--s1,4px) 0 0;line-height:0}
.post .say{margin:var(--s2,8px) 0 0;white-space:pre-line;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;overflow:hidden}
.post.whole .say{display:block;-webkit-line-clamp:none}
.spoil{position:relative}
.spoil .sayt{filter:blur(6px);user-select:none;pointer-events:none;margin:0}
.spoil .spoilbtn{position:absolute;inset:0;width:100%;background:none;border:0;padding:0;font:600 var(--fs-btn,11px) var(--mono,monospace);color:var(--ink,#000);cursor:pointer;text-align:left}
.spoil .spoilbtn span{background:var(--paper,#fff);padding:2px var(--s1,4px)}
/* reply · Same · like · share, icons and their counts, spread under the post */
.pacts{display:flex;align-items:center;justify-content:space-between;max-width:360px;margin:var(--s2,8px) 0 0 calc(-1 * var(--s1,4px));min-width:0}
.pacts > *,.pacts .share,.phead .more{display:inline-flex;align-items:center;gap:var(--s1,4px);background:none;border:0;padding:var(--s1,4px);font:400 var(--fs-small,11px)/1.3 var(--mono,monospace);color:var(--grey,#6B6B6B);text-decoration:none;cursor:pointer;white-space:nowrap}
.pacts > a:hover,.pacts button:hover:not(:disabled),.pacts > a:focus-visible,.pacts button:focus-visible,.phead .more:hover,.phead .more:focus-visible,.phead .more[aria-expanded=true]{color:var(--ink,#000)}
.pacts [aria-pressed=true]{color:var(--ink,#000)}
.pacts [aria-pressed=true] svg{fill:currentColor}
.pacts .metoo[aria-pressed=true] svg{fill:none;stroke-width:2.6}
.pacts svg,.phead .more svg{width:16px;height:16px;display:block;flex:none}
.pacts :disabled{cursor:default}
.pacts .n{font-variant-numeric:tabular-nums;min-width:1ch}
.pmenuwrap{position:relative;display:inline-flex}
.pmenu{position:absolute;right:0;top:100%;z-index:8;background:var(--paper,#fff);border:1px solid var(--ink,#000);border-radius:var(--radius,3px);padding:var(--s1,4px) 0;white-space:nowrap}
.pmenu.up{top:auto;bottom:100%}
.pmenu button{display:block;width:100%;text-align:left;background:none;border:0;padding:var(--s2,8px) var(--s4,16px);font:500 var(--fs-nav,12px) var(--mono,monospace);color:inherit;cursor:pointer}
.pmenu button:hover:not(:disabled),.pmenu button:focus-visible{background:var(--wash,#F3F3F3);outline:0}
.pmenu button:disabled{color:var(--grey,#6B6B6B);cursor:default}
.pask{border:1px solid var(--ink,#000);border-radius:var(--radius,3px);padding:var(--s5,24px);max-width:340px;background:var(--paper,#fff);color:var(--ink,#000)}
.pask::backdrop{background:rgba(0,0,0,.35)}
.pask p{margin:0 0 var(--s4,16px)}
.pask .row{display:flex;gap:var(--s4,16px);align-items:center}
@media (max-width:520px){ .post{grid-template-columns:40px minmax(0,1fr) 56px} .post .cover{width:56px} .post.whole{grid-template-columns:40px minmax(0,1fr)} .post.whole .cover{grid-column:2;width:120px;margin-top:var(--s3,12px)} }
@media (pointer:coarse){   /* 44 x 44px to press on a touch screen */
  .post .pava{position:relative;overflow:visible}
  .post .pava img{position:absolute;inset:0;border-radius:50%}
  .post .pava::before{content:"";position:absolute;inset:-4px}
  .phead .pwho{padding:12px 0;margin:-12px 0}
  .pwhat{margin-top:var(--s3,12px)}   /* clear of the name's press area */
  .post{padding-top:var(--s5,24px)}   /* and the name's press area clear of what's above the post */
  .csearch input{min-height:48px}
  .pacts > *,.pacts .share,.phead .more,.pmenu button{min-height:44px}
  .pacts > *,.pacts .share,.phead .more{min-width:44px;justify-content:center}
}
`;
document.head.appendChild(css);

/* ---------- is 0009 there ---------- */
// The likes table answers a visitor once 0009 is run (an empty list), and 404 before, which the browser also reports
// in its console. A yes is kept for this tab; a no for 10 minutes on this device, so the 404 comes that seldom and the
// day 0009 is run pages see it soon after.
const KEPT = 'shelfstackd-0009', NO_FOR = 10 * 60e3;
let readyP = null;
function ready(){
  if (readyP) return readyP;
  try {
    if (sessionStorage.getItem(KEPT) === 'yes') return readyP = Promise.resolve(true);
    if (Date.now() - (+localStorage.getItem(KEPT + '-no') || 0) < NO_FOR) return readyP = Promise.resolve(false);
  } catch {}
  return readyP = fetch(`${SB_URL}/rest/v1/likes?select=log&limit=1`, {headers: {apikey: SB_KEY}})
    .then(r => { try { if (r.ok) sessionStorage.setItem(KEPT, 'yes'); else localStorage.setItem(KEPT + '-no', String(Date.now())); } catch {} return r.ok; }, () => false);
}

/* ---------- Supabase ---------- */
async function token(){
  const a = acct(); if (!a.sb) return null;
  try { const {data: {session}} = await a.sb.auth.getSession(); return session ? session.access_token : null; } catch { return null; }
}
async function rest(path, opt = {}){
  const t = await token(), r = await fetch(`${SB_URL}/rest/v1/${path}`, {...opt,
    headers: {apikey: SB_KEY, 'Content-Type': 'application/json', ...(t ? {Authorization: 'Bearer ' + t} : {}), ...(opt.headers || {})}});
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok){ const e = new Error((j && j.message) || 'That didn’t work. Try again in a moment.'); e.code = j && j.code; e.status = r.status; throw e; }
  return j;
}
const rpc = (fn, args) => rest('rpc/' + fn, {method: 'POST', body: JSON.stringify(args)});
async function stats(ids){
  const out = new Map();
  if (!ids.length || !(await ready())) return out;
  for (let i = 0; i < ids.length; i += 100) for (const s of (await rpc('post_stats', {ids: ids.slice(i, i + 100)})) || []) out.set(s.id, s);
  return out;
}
function friendly(e){
  const m = (e && e.message) || '';
  if (/fetch|network/i.test(m)) return 'Couldn’t reach shelfstackd. Check your connection and try again.';
  if (e && e.code === 'P0001' && m) return m;
  return 'That didn’t work. Try again in a moment.';
}

/* ---------- small things ---------- */
const RTF = new Intl.RelativeTimeFormat('en', {style: 'narrow', numeric: 'always'});
// 2h, 3d: how long ago (the same as the feed's and the profile's)
function ago(t){
  const s = Math.max(0, (Date.now() - new Date(t)) / 1000), D = 86400;
  if (s < 60) return 'now';
  const [n, unit] = s < 3600 ? [s / 60, 'minute'] : s < D ? [s / 3600, 'hour'] : s < 7*D ? [s / D, 'day'] : s < 30*D ? [s / (7*D), 'week'] : s < 365*D ? [s / (30*D), 'month'] : [s / (365*D), 'year'];
  return RTF.format(-Math.floor(n), unit).replace(/\s*ago$/, '').replace(/\s+/g, '');
}
// a rating (1 to 10: halves of 5) in words: "3.5 of 5"
const rateWords = v => v ? `${v / 2} of 5` : 'No rating';
/* A rating as five small rounded spines, standing side by side: a whole point is a spine filled in the logo's colours
   (yellow, pink, purple, blue, then yellow again), half a point a spine filled half its height, the rest grey outlines.
   The data stays 1 to 10. cls 'sm' is a post's size. */
const SPINE_COLOURS = ['#FFD000', '#FF2E93', '#6A4BFF', '#00D5E6'];
function spineSvgs(v){
  let h = '';
  for (let i = 1; i <= 5; i++){
    const full = v >= 2 * i, half = v === 2 * i - 1, c = SPINE_COLOURS[(i - 1) % SPINE_COLOURS.length];
    h += `<svg viewBox="0 0 10 28" aria-hidden="true" data-fill="${full ? 'full' : half ? 'half' : 'none'}">`
      + (full ? `<rect x="1" y="1" width="8" height="26" rx="3" fill="${c}"/>`
        : `<rect x="1.5" y="1.5" width="7" height="25" rx="2.5" fill="none" stroke="#B5B5B5"/>${half ? `<rect x="1" y="14" width="8" height="13" rx="3" fill="${c}"/>` : ''}`)
      + '</svg>';
  }
  return h;
}
function stars(v, cls = ''){
  return `<span class="rating ${cls}" role="img" aria-label="${rateWords(v)}">${spineSvgs(v)}</span>`;
}
let toastT = 0;
function toast(msg){ const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200); }
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };   // the day here
const COVER_OK = /^https:\/\/(image\.tmdb\.org|covers\.openlibrary\.org)\/\S+$/;
const rowOf = m => ({kind: m.kind === 'movie' ? 'movie' : 'book', title: String(m.title || '').trim().slice(0, 200), author: String(m.creator || m.author || '').slice(0, 200),
  year: /^\d{4}$/.test(String(m.year || '')) ? +m.year : null, cover_src: m.cover && COVER_OK.test(m.cover) && m.cover.length <= 396 ? 'url:' + m.cover : null});
const verb = kind => kind === 'movie' ? 'watched' : 'read';

// asks first, in a small sheet of its own: {text, yes} -> true when the person said yes
function ask({text, yes}){
  return new Promise(res => {
    const d = document.createElement('dialog');
    d.className = 'pask'; d.setAttribute('aria-label', text);
    d.innerHTML = `<p>${esc(text)}</p><div class="row"><button class="btn primary" type="button" data-yes>${esc(yes)}</button><button class="dash" type="button" data-no>Cancel</button></div>`;
    document.body.append(d);
    const done = v => { if (d.open) d.close(); d.remove(); res(v); };
    d.addEventListener('click', e => { if (e.target.closest('[data-yes]')) done(true); else if (e.target.closest('[data-no]') || e.target === d) done(false); });
    d.addEventListener('cancel', e => { e.preventDefault(); done(false); });
    d.showModal(); d.querySelector('[data-no]').focus();
  });
}

/* ---------- the composer's fields ---------- */
let fieldN = 0;
async function fields(host, m, opt = {}){
  const social = await ready(), n = ++fieldN, kind = m.kind === 'movie' ? 'movie' : 'book', max = social ? 2000 : 280;
  host.innerHTML = `<div class="pfields">
    ${social ? `<div class="prate"><span class="lbl" id="prl${n}">Rating</span><span class="rating" role="slider" tabindex="0" aria-labelledby="prl${n}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0" aria-valuetext="No rating"></span><span class="rv" aria-hidden="true"></span><button class="dash sm grey" type="button" data-clear hidden>Clear</button></div>` : ''}
    <div class="psay"><label><span class="lbl">${social ? 'Review' : 'Caption'} <i>(optional)</i></span><textarea maxlength="${max}" rows="3"></textarea></label><span class="pcount" aria-hidden="true">0 / ${max}</span></div>
    ${social ? `<div class="popts"><label class="check"><input type="checkbox" name="spoiler">Spoilers</label><label class="check"><input type="checkbox" name="rewatch">${kind === 'movie' ? 'Rewatch' : 'Reread'}</label>
      <label class="pdate"><span class="lbl">${kind === 'movie' ? 'Watched on' : 'Read on'}</span><input type="date" name="day" max="${today()}" value="${today()}"></label></div>` : ''}
  </div>`;
  const q = s => host.querySelector(s), ta = q('textarea'), count = q('.pcount');
  ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / ${max}`; });
  let v = 0;
  const slider = q('.rating[role=slider]');
  const paint = () => {
    if (!slider) return;
    slider.innerHTML = spineSvgs(v);
    slider.setAttribute('aria-valuenow', String(v)); slider.setAttribute('aria-valuetext', rateWords(v));
    q('.rv').textContent = v ? rateWords(v) : ''; q('[data-clear]').hidden = !v;
  };
  if (slider){
    // tap: a spine's left half is half a point, its right half the whole one; the same again clears it. Drag across
    // the spines to set it as you go
    const at = x => {
      const svgs = [...slider.querySelectorAll('svg')], first = svgs[0].getBoundingClientRect(), last = svgs[svgs.length - 1].getBoundingClientRect();
      if (x <= first.left) return 1;
      if (x >= last.right) return 10;
      let i = svgs.findIndex(sv => x <= sv.getBoundingClientRect().right + 3); if (i < 0) i = svgs.length - 1;
      const r = svgs[i].getBoundingClientRect();
      return 2 * (i + 1) - (x < r.left + r.width / 2 ? 1 : 0);
    };
    let down = null;
    slider.addEventListener('pointerdown', e => {
      e.preventDefault(); slider.focus();
      down = {x: e.clientX, moved: false, was: v};
      try { slider.setPointerCapture(e.pointerId); } catch {}
      v = at(e.clientX); paint();
    });
    slider.addEventListener('pointermove', e => {
      if (!down) return;
      if (Math.abs(e.clientX - down.x) > 3) down.moved = true;
      if (down.moved){ v = at(e.clientX); paint(); }
    });
    const up = () => { if (!down) return; if (!down.moved && down.was === v) { v = 0; paint(); } down = null; };
    slider.addEventListener('pointerup', up);
    slider.addEventListener('pointercancel', () => { down = null; });
    slider.addEventListener('keydown', e => {
      const k = e.key, to = k === 'ArrowRight' || k === 'ArrowUp' ? v + 1 : k === 'ArrowLeft' || k === 'ArrowDown' ? v - 1 : k === 'Home' || k === 'Delete' || k === 'Backspace' ? 0 : k === 'End' ? 10 : null;
      if (to === null) return;
      e.preventDefault(); v = Math.max(0, Math.min(10, to)); paint();
    });
    q('[data-clear]').addEventListener('click', () => { v = 0; paint(); slider.focus(); });
    paint();
  }
  return {
    values: () => ({review: ta.value.trim().slice(0, max), rating: v || null, spoiler: !!(q('[name=spoiler]') || {}).checked, rewatch: !!(q('[name=rewatch]') || {}).checked,
      watched_on: (q('[name=day]') || {}).value || null}),
    clear(){ ta.value = ''; count.textContent = `0 / ${max}`; v = 0; paint(); for (const c of host.querySelectorAll('input[type=checkbox]')) c.checked = false; const d = q('[name=day]'); if (d) d.value = today(); },
    focus(){ (slider || ta).focus(); },
    social,
  };
}

/* ---------- the composer: "What did you watch or read?" ----------
   Posts.composer(host, {onPosted(row)}): a box like a tweet's, your photo at its left. It grows when it has the focus;
   in it, the title search (+ ADD's, from add.js), then the picked title with its cover as the feed will show it, the
   fields, and Post. Gives {open(item)}: straight to a title (a Log button). */
let compN = 0;
const avaHtml = p => p && p.avatar_key ? `<img src="${esc(`${WORKER}/m/img?k=${encodeURIComponent(p.avatar_key)}`)}" alt="" loading="lazy">`
  : esc((((p && p.display_name) || '').trim() || (p && p.username) || '·').trim()[0] || '·');
async function composer(host, opt = {}){
  const n = ++compN, p = acct().profile;
  host.classList.add('compose');
  host.innerHTML = `<span class="cava" aria-hidden="true">${avaHtml(p)}</span>
    <div class="cmain">
      <div class="csearch"><label class="vh" for="cq${n}">What did you watch or read?</label><input type="text" id="cq${n}" placeholder="What did you watch or read?" maxlength="120" autocomplete="off"><p class="note grey" role="status"></p><ul class="csugg" hidden></ul></div>
      <div class="cpicked" hidden>
        <div class="cpost"><div class="cmain2"><h3><span class="ct"></span> <small class="cby"></small> <button class="dash sm" type="button" data-change>Change</button></h3><div class="cfields"></div></div><span class="ccov"></span></div>
      </div>
      <div class="cbar"><p class="note grey" role="status"></p><button class="btn primary" type="button" data-post disabled>Post</button></div>
    </div>`;
  const q = s => host.querySelector(s), input = q('input'), picked = q('.cpicked'), search = q('.csearch'), go = q('[data-post]'), say = q('.cbar .note');
  let m = null, f = null, run = 0;
  // open while it has the focus, or something is typed or picked
  const sizeUp = () => host.classList.toggle('open', !!m || !!input.value || host.contains(document.activeElement));
  host.addEventListener('focusin', sizeUp);
  host.addEventListener('focusout', () => setTimeout(sizeUp, 0));
  input.addEventListener('input', sizeUp);
  async function pick(item){
    const mine = ++run;
    m = item; say.textContent = '';
    q('.ct').textContent = m.title + (m.year ? ` (${m.year})` : ''); q('.cby').textContent = m.creator ? '· ' + m.creator : '';
    const cov = q('.ccov'); cov.replaceChildren();
    if (window.Wear) cov.append(Wear.cover({src: m.cover ? `${WORKER}/img?url=${encodeURIComponent(m.cover)}` : '', seed: keyOf(m), at: new Date().toISOString(), label: `The cover of ${m.title}, as the feed will show it`, width: 72}));
    search.hidden = true; picked.hidden = false; go.disabled = false; sizeUp();
    f = await fields(q('.cfields'), m);
    if (mine === run) f.focus();
  }
  q('[data-change]').addEventListener('click', () => { m = null; picked.hidden = true; search.hidden = false; go.disabled = true; input.focus(); sizeUp(); });
  go.addEventListener('click', async () => {
    if (!m || !f) return;
    go.disabled = true; say.textContent = 'Posting…';
    const r = await save(m, f.values());
    if (r.error){ go.disabled = false; say.textContent = r.error; return; }
    say.textContent = ''; m = null; f.clear(); picked.hidden = true; search.hidden = false; input.value = ''; sizeUp();
    toast(`Logged ${r.row.title}. It’s on the feed.`);
    if (opt.onPosted) opt.onPosted(r.row);
  });
  if (window.Nav && await Nav.loadAdd()) Add.attachSearch({input, list: q('.csugg'), say: t => { search.querySelector('.note').textContent = t; }, onPick: pick});
  return {open: item => { pick(item); host.scrollIntoView({block: 'nearest'}); }};
}

/* ---------- posting ---------- */
async function save(m, v = {}){
  const a = acct();
  if (!(a.sb && a.user && a.profile)) return {error: a.user ? 'Pick a username first.' : 'Sign in to log films and books.'};
  const social = await ready();
  const day = v.watched_on && v.watched_on <= today() ? v.watched_on : null;
  const row = {...rowOf(m), ...(social
    ? {review: String(v.review || '').slice(0, 2000), rating: v.rating >= 1 && v.rating <= 10 ? Math.round(v.rating) : null, spoiler: !!v.spoiler, rewatch: !!v.rewatch, ...(day ? {watched_on: day} : {}), ...(v.metoo ? {metoo_of: v.metoo} : {})}
    : {caption: String(v.review || '').slice(0, 280)})};
  let r;
  try { r = await a.sb.from('logs').insert(row).select('id,created_at').single(); } catch (err){ r = {error: err}; }
  if (r.error){
    const c = r.error.code || '';
    return {error: r.status === 404 || /^(PGRST20[25]|42P01|42883)$/.test(c) ? 'Logging isn’t open yet. Try again soon.' : c === 'P0001' && r.error.message ? r.error.message : friendly(r.error)};
  }
  const p = a.profile, at = (r.data && r.data.created_at) || new Date().toISOString();
  const posted = {what: 'log', id: r.data && r.data.id, at, created_at: at, owner: p.id, username: p.username, display_name: p.display_name, avatar_key: p.avatar_key,
    ...row, caption: String(v.review || '').slice(0, 280), ...(social ? {review: row.review, rating: row.rating, spoiler: row.spoiler, rewatch: row.rewatch, watched_on: day || today(), likes: 0, replies: 0, metoos: 0, liked: false, logged: false} : {})};
  document.dispatchEvent(new CustomEvent('shelfstackd:added', {detail: {what: 'log', item: m, post: posted}}));
  return {ok: true, row: posted};
}

/* ---------- a post ---------- */
const keyOf = m => [m.kind === 'movie' ? 'movie' : 'book', String(m.title || '').trim().toLowerCase(), String(m.year || '')].join('|');
let watchKeys = null, watchAsk = null;
// the titles on your Up next (the watchlist), read once, so a post's share menu says In Up next from the start
function watched(){
  const a = acct();
  if (!(a.sb && a.user)) return Promise.resolve(new Set());
  if (watchKeys) return Promise.resolve(watchKeys);
  return watchAsk = watchAsk || a.sb.from('watchlist').select('kind,title,year').eq('owner', a.user.id)
    .then(({data}) => (watchKeys = new Set((data || []).map(keyOf))), () => new Set());
}
document.addEventListener('shelfstackd:added', e => { const d = e.detail || {}; if (d.what === 'watch' && d.item && watchKeys) watchKeys.add(keyOf(d.item)); });
const postUrl = id => ROOT + 'p/?' + id;
const profileUrl = name => ROOT + 'u/?' + name;
const coverSrc = x => x.cover_src ? `${WORKER}/img?url=${encodeURIComponent(String(x.cover_src).replace(/^url:/, ''))}` : '';
const itemOf = x => ({kind: x.kind, title: x.title, year: x.year ? String(x.year) : '', creator: x.author || '', cover: x.cover_src ? String(x.cover_src).replace(/^url:/, '') : ''});

// a small menu under a button: items [{label, run(), disabled}], shut by Esc, a press elsewhere, or picking one
function menuOn(btn, list){
  const wrap = btn.parentNode, menu = document.createElement('span');
  menu.className = 'pmenu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  wrap.append(menu);
  const shut = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    if (!menu.hidden){ shut(); return; }
    const items = await list();
    menu.replaceChildren(...items.map(it => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = it.label; b.disabled = !!it.disabled;
      b.addEventListener('click', ev => { ev.stopPropagation(); shut(); it.run(); });
      return b;
    }));
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    menu.classList.remove('up'); if (menu.getBoundingClientRect().bottom > innerHeight - 8) menu.classList.add('up');
    const first = menu.querySelector('button:not(:disabled)'); if (first) first.focus();
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) shut(); });
  menu.addEventListener('keydown', e => {
    const bs = [...menu.querySelectorAll('button:not(:disabled)')], i = bs.indexOf(document.activeElement);
    if (e.key === 'Escape'){ shut(); btn.focus(); }
    else if (e.key === 'ArrowDown' && bs.length){ e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    else if (e.key === 'ArrowUp' && bs.length){ e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  });
}

/* x: a log as activity() gives it, with post_stats() for it when 0009 is there; opt: {social, whole (the post's own
   page: the review in full, and no tapping through), cover (its width), watch (the Set of titles on your Up next),
   onGone()} */
function item(x, opt = {}){
  const a = acct(), mine = !!(a.user && x.owner === a.user.id), social = !!opt.social && x.likes != null;
  const li = document.createElement('li');
  li.className = 'post' + (opt.whole ? ' whole' : ''); li.dataset.id = x.id;
  const review = x.review != null && x.review !== '' ? x.review : (x.caption || '');
  const at = x.at || x.created_at, url = postUrl(x.id), label = `${x.title}${x.year ? ` (${x.year})` : ''}`, name = (x.display_name || '').trim();
  const say = !review ? '' : x.spoiler && social
    ? `<div class="say spoil"><p class="sayt" aria-hidden="true">${esc(review)}</p><button class="spoilbtn" type="button" aria-label="Show the review. It has spoilers."><span>Spoilers. Show</span></button></div>`
    : `<p class="say">${esc(review)}</p>`;
  li.innerHTML = `<a class="pava" href="${esc(profileUrl(x.username))}" tabindex="-1" aria-hidden="true">${avaHtml(x)}</a>
    <div class="pbody">
      <p class="phead"><a class="pwho" href="${esc(profileUrl(x.username))}">${name ? `<b>${esc(name)}</b> ` : ''}<span>@${esc(x.username)}</span></a><span class="ago">· <a href="${esc(url)}"><time datetime="${esc(at)}" title="${esc(new Date(at).toLocaleString())}">${ago(at)}</time></a></span><span class="pmenuwrap pmore"></span></p>
      <p class="pwhat">${verb(x.kind)} <a href="${esc(url)}">${esc(x.title)}</a>${x.year ? ` (${esc(x.year)})` : ''}${social && x.rewatch ? ` <span class="tag">${x.kind === 'movie' ? 'rewatch' : 'reread'}</span>` : ''}</p>
      ${social && x.rating ? `<p class="prating">${stars(x.rating, 'sm')}</p>` : ''}
      ${say}
      <div class="pacts"></div>
    </div>
    <span class="cover"></span>`;
  if (window.Wear) li.querySelector('.cover').append(Wear.cover({src: coverSrc(x), seed: x.id, at, label: `${label}, ${verb(x.kind)} by @${x.username}`, width: opt.cover || 72}));
  const sp = li.querySelector('.spoilbtn');
  if (sp) sp.addEventListener('click', e => { e.stopPropagation(); const box = sp.parentNode; box.classList.remove('spoil'); box.querySelector('.sayt').removeAttribute('aria-hidden'); sp.remove(); });
  acts(li.querySelector('.pacts'), x, {mine, social, opt, li});
  // the whole post goes to its page (but not a press on a link, a button, a menu, or text being selected)
  if (!opt.whole) li.addEventListener('click', e => {
    if (e.target.closest('a, button, input, textarea, [role=menu], .spoil')) return;
    if (String(getSelection && getSelection()).trim()) return;
    location.href = url;
  });
  return li;
}

const REPEAT = '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>';
const SHARE = '<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>';
const count = (n, one, many) => `${n || 0} ${n === 1 ? one : many}`;
function acts(row, x, {mine, social, opt, li}){
  const m = itemOf(x), name = x.title;
  const btn = (cls, html, label, extra = '') => `<button type="button" class="${cls}" aria-label="${esc(label)}" ${extra}>${html}</button>`;
  let h = '';
  if (social){
    h += `<a class="reply" href="${esc(postUrl(x.id))}#reply" aria-label="Reply. ${count(x.replies, 'reply', 'replies')}">${ICON(BUBBLE)}<span class="n">${x.replies || ''}</span></a>`;
    // Same: you watched or read it too, logged at once. Pressed once you've logged it; your own post just counts them
    h += btn('metoo', `${ICON(REPEAT)}<span class="n">${x.metoos || ''}</span>`, mine ? `Same. ${count(x.metoos, 'person', 'people')} logged it too` : x.logged ? `You logged ${name} too. ${count(x.metoos, 'Same', 'Same')}` : `Same: log ${name} as ${verb(x.kind)} by you. ${count(x.metoos, 'Same', 'Same')}`,
      `aria-pressed="${!!x.logged && !mine}"${mine || x.logged ? ' disabled' : ''}`);
    h += btn('like', `${ICON(HEART)}<span class="n">${x.likes || ''}</span>`, `Like. ${count(x.likes, 'like', 'likes')}`, `aria-pressed="${!!x.liked}"`);
  }
  h += `<span class="pmenuwrap">${btn('share', ICON(SHARE), `Share @${x.username}'s post about ${name}`)}</span>`;
  row.innerHTML = h;
  const q = s => row.querySelector(s);

  // like: the count changes at once, and goes back if it didn't save
  const like = q('.like');
  if (like) like.addEventListener('click', async () => {
    if (!signedIn()){ if (window.Nav) Nav.signIn(); return; }
    const was = like.getAttribute('aria-pressed') === 'true', a = acct();
    const set = on => { x.liked = on; x.likes = Math.max(0, (x.likes || 0) + (on ? 1 : -1)); like.setAttribute('aria-pressed', String(on)); like.querySelector('.n').textContent = x.likes || '';
      like.setAttribute('aria-label', `Like. ${count(x.likes, 'like', 'likes')}`); };
    set(!was); like.disabled = true;
    let r;
    try { r = was ? await a.sb.from('likes').delete().eq('log', x.id).eq('owner', a.user.id) : await a.sb.from('likes').insert({log: x.id}); } catch (err){ r = {error: err}; }
    like.disabled = false;
    if (r.error && r.error.code !== '23505'){ set(was); toast(friendly(r.error)); }
  });

  // Same: logs the same title as yours, at once
  const same = q('.metoo');
  if (same && !same.disabled) same.addEventListener('click', async () => {
    if (!signedIn()){ if (window.Nav) Nav.signIn(); return; }
    same.disabled = true;
    x.metoos = (x.metoos || 0) + 1; same.querySelector('.n').textContent = x.metoos;
    const r = await save(m, {metoo: x.id});
    if (r.ok){ x.logged = true; same.setAttribute('aria-pressed', 'true'); same.setAttribute('aria-label', `You logged ${name} too. ${count(x.metoos, 'Same', 'Same')}`); toast(`Logged ${name}. It’s on the feed.`); }
    else { x.metoos--; same.querySelector('.n').textContent = x.metoos || ''; same.disabled = false; toast(r.error); }
  });

  // share: Copy link, the phone's own share sheet where there is one, and (someone else's) Up next
  const url = () => new URL(postUrl(x.id), location.href).href;
  menuOn(q('.share'), async () => {
    const list = [{label: 'Copy link', run: async () => { try { await navigator.clipboard.writeText(url()); toast('Link copied.'); } catch { toast(url()); } }}];
    if (navigator.share) list.push({label: 'Share…', run: async () => { try { await navigator.share({url: url(), title: `@${x.username} ${verb(x.kind)} ${name}`}); } catch {} }});
    if (!mine){
      const keys = opt.watch || await watched(), on = keys.has(keyOf(m));
      list.push({label: on ? 'In Up next' : 'Add to Up next', disabled: on, run: async () => {
        if (!signedIn()){ if (window.Nav && Nav.visitor && Nav.visitor()) Nav.needAccount('watch', m); else if (window.Nav) Nav.signIn(); return; }
        const ok = window.Nav && await Nav.loadAdd();
        const r = ok ? await Add.watch(m, {from: x.owner}) : {error: 'That didn’t work. Try again in a moment.'};
        if (!r.ok) toast(r.error);
      }});
    }
    return list;
  });

  // ···, in the post's top line: Report someone else's (0009), Delete your own (it asks first)
  const slot = li.querySelector('.pmore');
  if (mine || social){
    slot.innerHTML = `<button type="button" class="more" aria-label="More for this post">${ICON(DOTS)}</button>`;
    menuOn(slot.querySelector('.more'), () => mine ? [{label: 'Delete', run: async () => {
      if (!(await ask({text: `Delete your post about ${name}?`, yes: 'Delete'}))) return;
      const a = acct(); let r;
      try { r = await a.sb.from('logs').delete().eq('id', x.id).eq('owner', a.user.id); } catch (err){ r = {error: err}; }
      if (r.error){ toast(friendly(r.error)); return; }
      li.remove(); toast('Deleted.');
      if (opt.onGone) opt.onGone(x);
    }}] : [{label: x.reported ? 'Reported' : 'Report', disabled: !!x.reported, run: async () => {
      if (!signedIn()){ if (window.Nav) Nav.signIn(); return; }
      const r = await report('log', x.id);
      toast(r);
      if (r === 'Reported. Thanks.') x.reported = true;
    }}]);
  } else slot.remove();
}
async function report(type, id){
  const a = acct(); let r;
  try { r = await a.sb.from('reports').insert({target_type: type, target_id: id}); } catch (err){ r = {error: err}; }
  if (!r.error || r.error.code === '23505') return 'Reported. Thanks.';
  return friendly(r.error);
}

window.Posts = {ready, fields, composer, save, stats, item, ago, stars, ask, report, rest, rpc, watched, friendly, postUrl, verb, menuOn, avaHtml};
})();
