/* A log is a post. The feed (/feed/), a post's own page (/p/?<id>) and + ADD's Log it all use this file.
   Posts.ready()            is migration 0009 in the database (docs/proposed-0009-social.sql)? It adds a log's rating,
                            review, spoiler, rewatch and date, likes, replies, me-too and notifications. Asked once a
                            page; until it's there nothing it adds shows, and a log is a caption of 280 as before.
   Posts.fields(host, m)    the composer's fields once a title is picked: the stars (half stars, optional), the review,
                            and with 0009 Spoilers, Rewatch (Reread for a book) and the day. Gives {values(), clear(), focus()}.
   Posts.composer(host, {onPosted}) "What did you watch or read?": the title search, the picked title, the fields, Post.
   Posts.save(m, values)    posts a log of m ({kind, title, year, creator, cover}): {ok, row} or {error}.
   Posts.stats(ids)         post_stats() for these logs (0009): a Map of id to {rating, review, likes, replies, ...}.
   Posts.item(x, opt)       one post, an <li>: photo, @name, "watched Gummo", the stars, the worn cover, the review
                            (blurred until pressed when it has spoilers), when; and the row of actions: like, reply and
                            me too (0009), + Watchlist or In watchlist, Share, and ··· with Report (0009) or Delete.
                            Counts change at once and go back if the database says no.
   Posts.ago(t), Posts.stars(v)
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
const STAR = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';
const DOTS = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';

const css = document.createElement('style');
css.textContent = `
.compose{display:grid;gap:var(--s2,8px);padding-bottom:var(--s5,24px);border-bottom:1px solid var(--hair,#D9D9D9);margin-bottom:var(--s5,24px)}
.compose > .lbl{font:700 var(--fs-body,13px) var(--mono,monospace);letter-spacing:0;text-transform:none;color:var(--ink,#000)}
.csearch{position:relative;display:grid;gap:var(--s1,4px);max-width:520px}
.csearch .note{margin:0;min-height:1.5em}
.csugg{list-style:none;margin:0;padding:var(--s1,4px) 0;position:absolute;top:calc(100% - 1.5em);left:0;right:0;z-index:7;background:var(--paper,#fff);border:1px solid var(--ink,#000);border-radius:var(--radius,3px)}
.csugg li{padding:var(--s2,8px) var(--s3,12px);cursor:pointer;display:flex;gap:var(--s1,4px) var(--s2,8px);flex-wrap:wrap;align-items:baseline}
.csugg li[aria-selected="true"]{background:var(--ink,#000);color:var(--paper,#fff)}
.csugg .y,.csugg .k,.csugg .by{color:var(--grey,#6B6B6B);font-size:var(--fs-small,11px)}
.csugg li[aria-selected="true"] :is(.y,.k,.by){color:inherit}
.cpost{display:grid;grid-template-columns:var(--cover,72px) minmax(0,1fr);gap:var(--s4,16px);align-items:start}
.ccov{line-height:0}
.ccov canvas{width:100%;height:auto;display:block}
.cpost h3{margin:0 0 var(--s3,12px);font-size:var(--fs-body,13px)}
.cpost h3 small{color:var(--grey,#6B6B6B);font-weight:400}
.cbar{display:flex;justify-content:flex-end;gap:var(--s4,16px);align-items:center;margin-top:var(--s3,12px)}
.cbar .note{margin:0 auto 0 0}
.stars{display:inline-flex;gap:2px;vertical-align:-2px;color:var(--ink,#000)}
.stars svg{width:16px;height:16px;display:block}
.stars .on{fill:currentColor}
.stars.sm svg{width:12px;height:12px}
.stars[role=slider]{cursor:pointer;padding:var(--s1,4px) 0;outline-offset:4px;touch-action:manipulation}
.stars[role=slider] svg{width:20px;height:20px}
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
.items .post .tag{margin-left:var(--s1,4px)}
.items .post .say{display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;overflow:hidden}
.items .post.whole .say{display:block;-webkit-line-clamp:none}
.spoil{position:relative}
.spoil .sayt{filter:blur(6px);user-select:none;pointer-events:none}
.spoil .spoilbtn{position:absolute;inset:0;width:100%;background:none;border:0;padding:0;font:600 var(--fs-btn,11px) var(--mono,monospace);color:var(--ink,#000);cursor:pointer;text-align:left}
.spoil .spoilbtn span{background:var(--paper,#fff);padding:2px var(--s1,4px)}
.acts{grid-column:2;display:flex;align-items:center;gap:var(--s1,4px) var(--s4,16px);flex-wrap:wrap;margin:calc(-1 * var(--s1,4px)) 0 0;min-width:0}
.acts > *{display:inline-flex;align-items:center;gap:var(--s1,4px);background:none;border:0;padding:var(--s1,4px) 0;font:400 var(--fs-small,11px)/1.3 var(--mono,monospace);color:var(--grey,#6B6B6B);text-decoration:none;cursor:pointer;white-space:nowrap}
.acts > button:hover:not(:disabled),.acts > a:hover,.acts > button:focus-visible,.acts > a:focus-visible{color:var(--ink,#000)}
.acts > [aria-pressed=true]{color:var(--ink,#000)}
.acts > [aria-pressed=true] svg{fill:currentColor}
.acts svg{width:16px;height:16px;display:block;flex:none}
.acts .state{cursor:default}
.acts > :disabled{cursor:default}
.acts .n{font-variant-numeric:tabular-nums}
.pmenuwrap{position:relative;margin-left:auto;display:inline-flex}
.acts .more{display:inline-flex;align-items:center;background:none;border:0;padding:var(--s1,4px) 0;color:var(--grey,#6B6B6B);cursor:pointer}
.acts .more:hover,.acts .more:focus-visible,.acts .more[aria-expanded=true]{color:var(--ink,#000)}
.pmenu{position:absolute;right:0;top:100%;z-index:8;background:var(--paper,#fff);border:1px solid var(--ink,#000);border-radius:var(--radius,3px);padding:var(--s1,4px) 0;white-space:nowrap}
.pmenu.up{top:auto;bottom:100%}
.pmenu button{display:block;width:100%;text-align:left;background:none;border:0;padding:var(--s2,8px) var(--s4,16px);font:500 var(--fs-nav,12px) var(--mono,monospace);color:inherit;cursor:pointer}
.pmenu button:hover,.pmenu button:focus-visible{background:var(--wash,#F3F3F3);outline:0}
.pask{border:1px solid var(--ink,#000);border-radius:var(--radius,3px);padding:var(--s5,24px);max-width:340px;background:var(--paper,#fff);color:var(--ink,#000)}
.pask::backdrop{background:rgba(0,0,0,.35)}
.pask p{margin:0 0 var(--s4,16px)}
.pask .row{display:flex;gap:var(--s4,16px);align-items:center}
@media (pointer:coarse){   /* 44 x 44px to press on a touch screen */
  .acts > *,.acts .more,.pmenu button{min-height:44px}
  .acts > :not(.pmenuwrap),.acts .more{min-width:44px;justify-content:center}
  .acts{gap:0 var(--s2,8px)}
}`;
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
// a rating (1 to 10, half stars) in words: "3.5 stars"
const starWords = v => v ? `${v / 2} star${v === 2 ? '' : 's'}` : 'No rating';
// five stars, v of them in halves, filled (a half star is the left half filled)
function stars(v, cls = ''){
  let h = '';
  for (let i = 1; i <= 5; i++){
    const full = v >= 2 * i, half = v === 2 * i - 1;
    h += `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>${full || half ? `<path class="on" d="${STAR}"${half ? ' style="clip-path:inset(0 50% 0 0)"' : ''}/>` : ''}</svg>`;
  }
  return `<span class="stars ${cls}" role="img" aria-label="${starWords(v)}">${h}</span>`;
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
    ${social ? `<div class="prate"><span class="lbl" id="prl${n}">Rating</span><span class="stars" role="slider" tabindex="0" aria-labelledby="prl${n}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0" aria-valuetext="No rating"></span><span class="rv" aria-hidden="true"></span><button class="dash sm grey" type="button" data-clear hidden>Clear</button></div>` : ''}
    <div class="psay"><label><span class="lbl">${social ? 'Review' : 'Caption'} <i>(optional)</i></span><textarea maxlength="${max}" rows="3"></textarea></label><span class="pcount" aria-hidden="true">0 / ${max}</span></div>
    ${social ? `<div class="popts"><label class="check"><input type="checkbox" name="spoiler">Spoilers</label><label class="check"><input type="checkbox" name="rewatch">${kind === 'movie' ? 'Rewatch' : 'Reread'}</label>
      <label class="pdate"><span class="lbl">${kind === 'movie' ? 'Watched on' : 'Read on'}</span><input type="date" name="day" max="${today()}" value="${today()}"></label></div>` : ''}
  </div>`;
  const q = s => host.querySelector(s), ta = q('textarea'), count = q('.pcount');
  ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / ${max}`; });
  let v = 0;
  const slider = q('.stars[role=slider]');
  const paint = () => {
    if (!slider) return;
    slider.innerHTML = stars(v).replace(/^<span[^>]*>|<\/span>$/g, '');
    slider.setAttribute('aria-valuenow', String(v)); slider.setAttribute('aria-valuetext', starWords(v));
    q('.rv').textContent = v ? starWords(v) : ''; q('[data-clear]').hidden = !v;
  };
  if (slider){
    // a press on a star's left half is half a star, on its right half the whole star; the same again clears it
    slider.addEventListener('click', e => {
      const svgs = [...slider.querySelectorAll('svg')], i = svgs.findIndex(s => { const r = s.getBoundingClientRect(); return e.clientX <= r.right + 1; });
      if (i < 0) return;
      const r = svgs[i].getBoundingClientRect(), to = 2 * (i + 1) - (e.clientX < r.left + r.width / 2 ? 1 : 0);
      v = v === to ? 0 : to; paint();
    });
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
   Posts.composer(host, {onPosted(row)}): the title search (+ ADD's, from add.js), then the picked title with its cover
   as the feed will show it, the fields, and Post. Gives {open(item)}: straight to a title (a Log button). */
let compN = 0;
async function composer(host, opt = {}){
  const n = ++compN;
  host.classList.add('compose');
  host.innerHTML = `<label class="lbl" for="cq${n}">What did you watch or read?</label>
    <div class="csearch"><input type="text" id="cq${n}" placeholder="Gummo, The Waves, Kids" maxlength="120" autocomplete="off"><p class="note grey" role="status"></p><ul class="csugg" hidden></ul></div>
    <div class="cpicked" hidden>
      <div class="cpost"><span class="ccov"></span><div class="cmain"><h3><span class="ct"></span> <small class="cby"></small> <button class="dash sm" type="button" data-change>Change</button></h3><div class="cfields"></div></div></div>
      <div class="cbar"><p class="note grey" role="status"></p><button class="btn primary" type="button" data-post>Post</button></div>
    </div>`;
  const q = s => host.querySelector(s), input = q('input'), picked = q('.cpicked'), search = q('.csearch'), go = q('[data-post]'), say = q('.cbar .note');
  let m = null, f = null, run = 0;
  async function pick(item){
    const mine = ++run;
    m = item; say.textContent = '';
    q('.ct').textContent = m.title + (m.year ? ` (${m.year})` : ''); q('.cby').textContent = m.creator ? '· ' + m.creator : '';
    const cov = q('.ccov'); cov.replaceChildren();
    if (window.Wear) cov.append(Wear.cover({src: m.cover ? `${WORKER}/img?url=${encodeURIComponent(m.cover)}` : '', seed: keyOf(m), at: new Date().toISOString(), label: `The cover of ${m.title}, as the feed will show it`, width: 72}));
    search.hidden = true; picked.hidden = false; go.disabled = false;
    f = await fields(q('.cfields'), m);
    if (mine === run) f.focus();
  }
  q('[data-change]').addEventListener('click', () => { m = null; picked.hidden = true; search.hidden = false; input.focus(); });
  go.addEventListener('click', async () => {
    if (!m || !f) return;
    go.disabled = true; say.textContent = 'Posting…';
    const r = await save(m, f.values());
    if (r.error){ go.disabled = false; say.textContent = r.error; return; }
    say.textContent = ''; m = null; f.clear(); picked.hidden = true; search.hidden = false; input.value = '';
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
// the titles on your watchlist, read once, so a post says In watchlist from the start
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

/* x: a log as activity() gives it, with post_stats() for it when 0009 is there; opt: {social, whole (the post's own
   page: the review in full), cover (its width), watch (the Set of titles on your watchlist), onGone()} */
function item(x, opt = {}){
  const a = acct(), mine = !!(a.user && x.owner === a.user.id), social = !!opt.social && x.likes != null;
  const li = document.createElement('li');
  li.className = 'item log post' + (opt.whole ? ' whole' : ''); li.dataset.id = x.id;
  const review = x.review != null && x.review !== '' ? x.review : (x.caption || '');
  const ava = x.avatar_key ? `<img src="${esc(`${WORKER}/m/img?k=${encodeURIComponent(x.avatar_key)}`)}" alt="" loading="lazy">` : esc(((x.display_name || '').trim() || x.username || '·').trim()[0] || '·');
  const at = x.at || x.created_at, url = postUrl(x.id), label = `${x.title}${x.year ? ` (${x.year})` : ''}`;
  const say = !review ? '' : x.spoiler && social
    ? `<div class="say spoil"><p class="sayt" aria-hidden="true">${esc(review)}</p><button class="spoilbtn" type="button" aria-label="Show the review. It has spoilers."><span>Spoilers. Show</span></button></div>`
    : `<p class="say">${esc(review)}</p>`;
  li.innerHTML = `<a class="fa" href="${esc(profileUrl(x.username))}" tabindex="-1" aria-hidden="true">${ava}</a>
    <p class="line"><a href="${esc(profileUrl(x.username))}">${x.mine ? 'You' : '@' + esc(x.username)}</a> ${verb(x.kind)} <a href="${esc(url)}"><b>${esc(x.title)}</b></a>${social && x.rating ? ' ' + stars(x.rating, 'sm') : ''}${social && x.rewatch ? ` <span class="tag">${x.kind === 'movie' ? 'rewatch' : 'reread'}</span>` : ''}
      <span class="ago">· <a href="${esc(url)}"><time datetime="${esc(at)}" title="${esc(new Date(at).toLocaleString())}">${ago(at)}</time></a></span></p>
    <div class="logbody"><span class="cover"></span>${say}</div>
    <div class="acts"></div>`;
  if (window.Wear) li.querySelector('.cover').append(Wear.cover({src: coverSrc(x), seed: x.id, at, label: `${label}, ${verb(x.kind)} by @${x.username}`, width: opt.cover || 72}));
  const sp = li.querySelector('.spoilbtn');
  if (sp) sp.addEventListener('click', () => { const box = sp.parentNode; box.classList.remove('spoil'); box.querySelector('.sayt').removeAttribute('aria-hidden'); sp.remove(); });
  acts(li.querySelector('.acts'), x, {mine, social, opt, li});
  return li;
}

function acts(row, x, {mine, social, opt, li}){
  const m = itemOf(x), name = x.title;
  const btn = (cls, html, label, extra = '') => `<button type="button" class="${cls}" aria-label="${esc(label)}" ${extra}>${html}</button>`;
  let h = '';
  if (social){
    h += btn('like', `${ICON(HEART)}<span class="n">${x.likes || ''}</span>`, `Like. ${x.likes || 0} like${x.likes === 1 ? '' : 's'}`, `aria-pressed="${!!x.liked}"`);
    h += `<a class="reply" href="${esc(postUrl(x.id))}#reply" aria-label="Reply. ${x.replies || 0} repl${x.replies === 1 ? 'y' : 'ies'}">${ICON(BUBBLE)}<span class="n">${x.replies || ''}</span></a>`;
    if (!mine) h += x.logged ? `<span class="state metoo" aria-label="You logged ${esc(name)} too. ${x.metoos || 0} me too">Me too <span class="n">${x.metoos || ''}</span></span>`
      : btn('metoo', `Me too <span class="n">${x.metoos || ''}</span>`, `Me too: log ${name} as ${verb(x.kind)} by you. ${x.metoos || 0} me too`);
    else if (x.metoos) h += `<span class="state metoo">Me too <span class="n">${x.metoos}</span></span>`;
  }
  if (!mine) h += `<span class="wslot"></span>`;
  h += btn('share', 'Share', `Share a link to @${x.username}'s post about ${name}`);
  const menu = (social && !mine) || mine;
  if (menu) h += `<span class="pmenuwrap"><button type="button" class="more" aria-label="More for this post" aria-haspopup="menu" aria-expanded="false">${ICON(DOTS)}</button>
    <span class="pmenu" role="menu" hidden>${mine ? '<button type="button" role="menuitem" data-del>Delete</button>' : '<button type="button" role="menuitem" data-report>Report</button>'}</span></span>`;
  row.innerHTML = h;
  const q = s => row.querySelector(s);

  // + Watchlist, or In watchlist (grey) when it's on it
  const slot = q('.wslot');
  if (slot){
    const add = document.createElement('button'); add.type = 'button'; add.className = 'watch'; add.textContent = '+ Watchlist'; add.setAttribute('aria-label', `Add ${name} to your watchlist`);
    slot.replaceWith(add);
    const showIn = () => { if (!add.isConnected) return; const s = document.createElement('span'); s.className = 'state win'; s.textContent = 'In watchlist'; add.replaceWith(s); };
    (opt.watch ? Promise.resolve(opt.watch) : watched()).then(keys => { if (keys.has(keyOf(m))) showIn(); });
    add.addEventListener('click', async () => {
      if (!signedIn()){ if (window.Nav && Nav.visitor && Nav.visitor()) Nav.needAccount('watch', m); else if (window.Nav) Nav.signIn(); return; }
      add.disabled = true;
      const ok = window.Nav && await Nav.loadAdd();
      const r = ok ? await Add.watch(m, {from: x.owner}) : {error: 'That didn’t work. Try again in a moment.'};
      if (r.ok) showIn(); else { add.disabled = false; toast(r.error); }
    });
  }

  // like: the count changes at once, and goes back if it didn't save
  const like = q('.like');
  if (like) like.addEventListener('click', async () => {
    if (!signedIn()){ if (window.Nav) Nav.signIn(); return; }
    const was = like.getAttribute('aria-pressed') === 'true', a = acct();
    const set = on => { x.liked = on; x.likes = Math.max(0, (x.likes || 0) + (on ? 1 : -1)); like.setAttribute('aria-pressed', String(on)); like.querySelector('.n').textContent = x.likes || '';
      like.setAttribute('aria-label', `Like. ${x.likes} like${x.likes === 1 ? '' : 's'}`); };
    set(!was); like.disabled = true;
    let r;
    try { r = was ? await a.sb.from('likes').delete().eq('log', x.id).eq('owner', a.user.id) : await a.sb.from('likes').insert({log: x.id}); } catch (err){ r = {error: err}; }
    like.disabled = false;
    if (r.error && r.error.code !== '23505'){ set(was); toast(friendly(r.error)); }
  });

  // me too: logs the same title as yours, at once
  const metoo = q('button.metoo');
  if (metoo) metoo.addEventListener('click', async () => {
    if (!signedIn()){ if (window.Nav) Nav.signIn(); return; }
    metoo.disabled = true;
    x.metoos = (x.metoos || 0) + 1; metoo.querySelector('.n').textContent = x.metoos;
    const r = await save(m, {metoo: x.id});
    if (r.ok){ x.logged = true; const s = document.createElement('span'); s.className = 'state metoo'; s.innerHTML = `Me too <span class="n">${x.metoos}</span>`; metoo.replaceWith(s); toast(`Logged ${name}. It’s on the feed.`); }
    else { x.metoos--; metoo.querySelector('.n').textContent = x.metoos || ''; metoo.disabled = false; toast(r.error); }
  });

  // share: the post's own address (the phone's share sheet where there is one)
  q('.share').addEventListener('click', async () => {
    const url = new URL(postUrl(x.id), location.href).href, text = `@${x.username} ${verb(x.kind)} ${name}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches){ try { await navigator.share({url, title: text}); return; } catch (e){ if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { toast(url); }
  });

  // ···: Report someone else's, Delete your own (it asks first)
  const more = q('.more'), pm = q('.pmenu');
  if (more){
    const shut = () => { pm.hidden = true; more.setAttribute('aria-expanded', 'false'); };
    more.addEventListener('click', e => {
      e.stopPropagation(); const open = pm.hidden; pm.hidden = !open; more.setAttribute('aria-expanded', String(open));
      if (open){ pm.classList.remove('up'); if (pm.getBoundingClientRect().bottom > innerHeight - 8) pm.classList.add('up'); pm.querySelector('button').focus(); }
    });
    document.addEventListener('click', e => { if (!row.contains(e.target)) shut(); });
    pm.addEventListener('keydown', e => { if (e.key === 'Escape'){ shut(); more.focus(); } });
    const del = pm.querySelector('[data-del]'), rep = pm.querySelector('[data-report]');
    if (del) del.addEventListener('click', async () => {
      shut();
      if (!(await ask({text: `Delete your post about ${name}?`, yes: 'Delete'}))) return;
      const a = acct(); let r;
      try { r = await a.sb.from('logs').delete().eq('id', x.id).eq('owner', a.user.id); } catch (err){ r = {error: err}; }
      if (r.error){ toast(friendly(r.error)); return; }
      li.remove(); toast('Deleted.');
      if (opt.onGone) opt.onGone(x);
    });
    if (rep) rep.addEventListener('click', async () => {
      shut();
      if (!signedIn()){ if (window.Nav) Nav.signIn(); return; }
      const r = await report('log', x.id);
      toast(r);
      if (r === 'Reported. Thanks.'){ rep.disabled = true; rep.textContent = 'Reported'; }
    });
  }
}
async function report(type, id){
  const a = acct(); let r;
  try { r = await a.sb.from('reports').insert({target_type: type, target_id: id}); } catch (err){ r = {error: err}; }
  if (!r.error || r.error.code === '23505') return 'Reported. Thanks.';
  return friendly(r.error);
}

window.Posts = {ready, fields, composer, save, stats, item, ago, stars, ask, report, rest, rpc, watched, friendly, postUrl, verb};
})();
