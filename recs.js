/* Recs: recommend a film or a book to someone you follow who follows you back (migration 0010,
   supabase/migrations/0010_recs.sql). Loaded by Nav.loadRecs() the first time a page needs it.
   Recs.ready()          is 0010 in the database? Asked once a page (rec_stats() answers anyone); until it is, nothing
                         here shows: no Recommend, no Recs tab, no rec in the feed.
   Recs.open(item)       the sheet: who to (the people you both follow, a search when there are many), a note (140, optional),
                         Show in feed (on), Send; and Share to WhatsApp, for anyone. item: {kind, title, year, creator, cover}.
   Recs.whatsapp(text, url)  a wa.me link that opens WhatsApp with that text and address.
   Recs.list(box), keep(id), dismiss(id), thread(id), reply(id, text), stats(uid): what the profile's Recs tab asks.
   Load it after nav.js (Nav.account()). */
(() => {
if (window.Recs) return;
const ROOT = new URL('.', document.currentScript.src).href;
const SB_URL = String(window.SPINESTACK_SUPABASE_URL || '').trim().replace(/\/+$/, ''), SB_KEY = String(window.SPINESTACK_SUPABASE_KEY || '').trim();
const WORKER = String(window.SPINESTACK_WORKER || '').trim().replace(/\/+$/, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const acct = () => (window.Nav && Nav.account ? Nav.account() : {}) || {};
const signedIn = () => { const a = acct(); return !!(a.sb && a.user && a.profile); };
const NOTE = 140;

const css = document.createElement('style');
css.textContent = `
.recsheet .sheetbox{max-width:440px}
.recsheet h2{margin-bottom:var(--s4,16px)}
.recsheet fieldset{border:0;margin:0;padding:0;min-width:0}
.recsheet legend{padding:0;margin-bottom:var(--s1,4px)}
.recsheet .rfind{margin-bottom:var(--s2,8px)}
.recsheet .rwho{list-style:none;margin:0 0 var(--s4,16px);padding:0;max-height:min(40vh,280px);overflow:auto;border-top:1px solid var(--hair,#D9D9D9)}
.recsheet .rwho li{border-bottom:1px solid var(--hair,#D9D9D9)}
.recsheet .rwho label{display:flex;align-items:center;gap:var(--s2,8px);padding:var(--s2,8px) 0;cursor:pointer;min-height:44px;box-sizing:border-box}
.recsheet .rwho input{flex:none;margin:0}
.recsheet .rwho .ra{flex:none;width:24px;height:24px;border-radius:50%;border:1px solid var(--ink,#000);background:var(--wash,#F3F3F3);overflow:hidden;display:grid;place-items:center;font-size:var(--fs-small,11px);text-transform:uppercase}
.recsheet .rwho .ra img{width:100%;height:100%;object-fit:cover;display:block}
.recsheet .rwho .rn{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.recsheet .rwho .rn span{color:var(--grey,#6B6B6B)}
.recsheet .rwho .rfull{margin-left:auto;color:var(--grey,#6B6B6B);font-size:var(--fs-small,11px);white-space:nowrap}
.recsheet .rwho label:has(input:disabled){cursor:default;color:var(--grey,#6B6B6B)}
.recsheet .rnone{color:var(--grey,#6B6B6B);margin:0 0 var(--s4,16px)}
.recsheet .rnote{display:grid;gap:var(--s1,4px);margin-bottom:var(--s2,8px)}
.recsheet .rnote textarea{resize:vertical}
.recsheet .rcount{font-size:var(--fs-small,11px);color:var(--grey,#6B6B6B);text-align:right}
.recsheet .row{display:flex;flex-wrap:wrap;gap:var(--s4,16px);align-items:center;margin-top:var(--s4,16px)}
.recsheet .rsay{margin:var(--s2,8px) 0 0;color:var(--grey,#6B6B6B);font-size:var(--fs-small,11px)}
.recsheet .rsay:empty{display:none}
`;
document.head.appendChild(css);

/* ---------- is 0010 there? ---------- */
const KEPT = 'shelfstackd-0010', NO_FOR = 10 * 60 * 1000;
let readyP = null;
function ready(){
  if (readyP) return readyP;
  if (!SB_URL || !SB_KEY) return readyP = Promise.resolve(false);
  try {
    if (sessionStorage.getItem(KEPT) === 'yes') return readyP = Promise.resolve(true);
    if (Date.now() - (+localStorage.getItem(KEPT + '-no') || 0) < NO_FOR) return readyP = Promise.resolve(false);
  } catch {}
  return readyP = fetch(`${SB_URL}/rest/v1/rpc/rec_stats?uid=00000000-0000-0000-0000-000000000000`, {headers: {apikey: SB_KEY}})
    .then(r => { try { if (r.ok) sessionStorage.setItem(KEPT, 'yes'); else localStorage.setItem(KEPT + '-no', String(Date.now())); } catch {} return r.ok; }, () => false);
}

/* ---------- Supabase ---------- */
async function rest(path, opt = {}){
  const a = acct(); let t = null;
  if (a.sb) try { const {data: {session}} = await a.sb.auth.getSession(); t = session ? session.access_token : null; } catch {}
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {...opt,
    headers: {apikey: SB_KEY, 'Content-Type': 'application/json', ...(t ? {Authorization: 'Bearer ' + t} : {}), ...(opt.headers || {})}});
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok){ const e = new Error((j && j.message) || 'That didn’t work. Try again in a moment.'); e.code = j && j.code; e.status = r.status; throw e; }
  return j;
}
const rpc = (fn, args) => rest('rpc/' + fn, {method: 'POST', body: JSON.stringify(args || {})});
function friendly(e, who){
  const c = (e && e.code) || '', m = (e && e.message) || '';
  if (c === '23505') return `You’ve recommended it to @${who} already.`;
  if (c === '42501') return `You can recommend to someone you follow who follows you back.`;
  if ((c === 'P0001' || c === '23514' || c === 'P0002') && m) return m;
  if (/fetch|network/i.test(m)) return 'Couldn’t reach shelfstackd. Check your connection and try again.';
  return 'That didn’t work. Try again in a moment.';
}
const COVER_OK = /^https:\/\/(image\.tmdb\.org|covers\.openlibrary\.org)\/\S+$/;
const rowOf = m => ({kind: m.kind === 'movie' ? 'movie' : 'book', title: String(m.title || '').trim().slice(0, 200), author: String(m.creator || '').slice(0, 200),
  year: /^\d{4}$/.test(String(m.year || '')) ? +m.year : null, cover_src: m.cover && COVER_OK.test(m.cover) && m.cover.length <= 396 ? 'url:' + m.cover : null});
const avaHtml = p => p && p.avatar_key ? `<img src="${esc(`${WORKER}/m/img?k=${encodeURIComponent(p.avatar_key)}`)}" alt="" loading="lazy">`
  : esc((((p && p.display_name) || '').trim() || (p && p.username) || '·').trim()[0] || '·');
const label = m => `${m.title}${m.year ? ` (${m.year})` : ''}`;

/* ---------- WhatsApp ---------- */
const whatsapp = (text, url) => window.Nav && Nav.whatsapp ? Nav.whatsapp(text, url) : `https://wa.me/?text=${encodeURIComponent([text, url].filter(Boolean).join(' '))}`;

function toast(msg){
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4200);
}

/* ---------- the sheet ---------- */
let n = 0;
async function open(m){
  const id = ++n, from = document.activeElement, sh = document.createElement('div');
  const kind = m.kind === 'movie' ? 'film' : 'book', share = whatsapp(`${label(m)}: a ${kind} I think you’d like.`, ROOT);
  sh.className = 'sheet recsheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', `rt${id}`);
  sh.innerHTML = `<div class="sheetbox"><button class="x" data-no type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button><div>
    <h2 id="rt${id}">Recommend ${esc(label(m))}</h2>
    <div class="rto"><p class="grey" role="status">Loading…</p></div>
    <label class="rnote"><span class="lbl">Note <i>(optional)</i></span><textarea maxlength="${NOTE}" rows="2" placeholder="Why they’d like it"></textarea><span class="rcount" aria-hidden="true">0 / ${NOTE}</span></label>
    <label class="check"><input type="checkbox" data-feed checked>Show in feed</label>
    <div class="row"><button class="btn primary" type="button" data-send disabled>Send</button><a class="dash sm" href="${esc(share)}" target="_blank" rel="noopener" data-wa>Share to WhatsApp</a><button class="dash sm" type="button" data-no>Cancel</button></div>
    <p class="rsay" role="status"></p>
  </div></div>`;
  document.body.append(sh);
  const q = s => sh.querySelector(s), ta = q('textarea'), send = q('[data-send]'), say = q('.rsay');
  ta.addEventListener('input', () => { q('.rcount').textContent = `${ta.value.length} / ${NOTE}`; });
  const done = () => { sh.remove(); document.removeEventListener('keydown', onKey, true); if (from && from.focus) from.focus(); };
  const onKey = e => { if (e.key === 'Escape'){ e.stopPropagation(); done(); } };
  sh.addEventListener('click', e => { if (e.target === sh || e.target.closest('[data-no]')) done(); });
  document.addEventListener('keydown', onKey, true);
  q('h2').setAttribute('tabindex', '-1'); q('h2').focus();

  // who to: the people you both follow, a search over them when there are more than 8
  let people = [];
  try { people = (await rpc('mutuals')) || []; } catch (e){ q('.rto').innerHTML = `<p class="rnone">${esc(friendly(e))}</p>`; return; }
  if (!sh.isConnected) return;
  if (!people.length){ q('.rto').innerHTML = '<p class="rnone">You can recommend to someone you follow who follows you back. Nobody does yet, so share it instead.</p>'; return; }
  q('.rto').innerHTML = `<fieldset><legend class="lbl">To</legend>${people.length > 8 ? `<input type="text" class="rfind" placeholder="Find someone" aria-label="Find someone you both follow" maxlength="40" autocomplete="off">` : ''}
    <ul class="rwho">${people.map(p => { const full = p.waiting >= 6, nm = (p.display_name || '').trim();
      return `<li data-name="${esc((p.username + ' ' + nm).toLowerCase())}"><label><input type="radio" name="rto${id}" value="${esc(p.id)}" data-user="${esc(p.username)}"${full ? ' disabled' : ''}><span class="ra" aria-hidden="true">${avaHtml(p)}</span><span class="rn">${nm ? `${esc(nm)} ` : ''}<span>@${esc(p.username)}</span></span>${full ? '<span class="rfull">6 waiting</span>' : ''}</label></li>`; }).join('')}</ul></fieldset>`;
  const find = q('.rfind');
  if (find) find.addEventListener('input', () => { const w = find.value.trim().replace(/^@/, '').toLowerCase(); for (const li of sh.querySelectorAll('.rwho li')) li.hidden = !!w && !li.dataset.name.includes(w); });
  sh.addEventListener('change', e => { if (e.target.matches('.rwho input')) send.disabled = false; });
  send.addEventListener('click', async () => {
    const to = q('.rwho input:checked'); if (!to) return;
    const a = acct(); if (!signedIn()){ done(); if (window.Nav) Nav.signIn(); return; }
    send.disabled = true; say.textContent = 'Sending…';
    let r;
    try { r = await a.sb.from('recs').insert({...rowOf(m), receiver: to.value, note: ta.value.trim().slice(0, NOTE), in_feed: q('[data-feed]').checked}); } catch (err){ r = {error: err}; }
    if (r.error){ send.disabled = false; say.textContent = friendly(r.error, to.dataset.user); return; }
    done(); toast(`Sent to @${to.dataset.user}.`);
    document.dispatchEvent(new CustomEvent('shelfstackd:rec', {detail: {item: m, to: to.dataset.user}}));
  });
}

/* ---------- the profile's Recs tab ---------- */
const list = box => rpc('recs_list', {box});
const keep = rid => rpc('rec_keep', {rid});
async function dismiss(rid){
  const a = acct(); let r;
  try { r = await a.sb.from('recs').update({status: 'dismissed'}).eq('id', rid); } catch (err){ r = {error: err}; }
  if (r.error) throw r.error;
}
const thread = rid => rpc('rec_thread', {rid});
async function reply(rid, text){
  const a = acct(); let r;
  try { r = await a.sb.from('rec_replies').insert({rec: rid, text: String(text || '').trim().slice(0, 280)}).select('id,created_at,text').single(); } catch (err){ r = {error: err}; }
  if (r.error) throw r.error;
  return r.data;
}
async function stats(uid){ const r = await rpc('rec_stats', {uid}); return (r && r[0]) || {sent: 0, watched: 0}; }

window.Recs = {ready, open, whatsapp, list, keep, dismiss, thread, reply, stats, friendly, rowOf};
})();
