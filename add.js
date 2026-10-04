/* + ADD: the Add dialog, the same on every page. At the top, what to do with the title: Put on shelf (the default),
   Log it, or Watchlist. Under that, a search box (All / Films / Books under it) that suggests titles as you type: up
   to six, films and books together, the closest titles first; ↑ ↓ move through them and Enter picks.
   Put on shelf: picking a result goes to step 2, which finds that title's spines (the Worker finds DVD and book scans,
   the browser cuts the spine out of each) and shows the choices with an Add to shelf button. On the builder that puts
   the spine on your shelf there. Anywhere else the choice is handed to the builder (sessionStorage), which opens your
   shelf with it on.
   Log it: the cover as the feed will show it (worn, wear.js), a caption if you want one, and Post, which saves a log
   (the logs table, supabase/migrations/0007_logs_watchlist.sql). Watchlist: the cover and Add to watchlist. Both need you
   signed in, with a username; Nav.account() says who that is. Nothing is searched for spines in either.
   After a log or a watchlist add, the dialog shuts and says so on document as "shelfstackd:added" ({what: 'log' or
   'watch', item}), so a page can show it. Add.open({mode, item}) opens on a mode, and with an item ({kind, title,
   year, creator, cover}) goes straight to its step 2 (a profile's Watched / Read).
   The search, the colour picking and the spine finder moved here from the builder as they were. Needs shelf.js.
   nav.js loads this file the first time + ADD is pressed; the builder loads it itself. */
(() => {
if (window.Add) return;
const {hex, lum, contrast, sat, dist, crop, posterTitle, loadImg, isCase, makeSpine} = Shelf;
const ROOT = new URL('.', document.currentScript.src).href;   // the site's root: this file sits there

/* ---------- colour ---------- */
function extractPalette(img){
  const c = document.createElement('canvas'); c.width = 48; c.height = 72;
  const x = c.getContext('2d', {willReadFrequently:true}), iw = img.width, ih = img.height;
  x.drawImage(img, iw*.06, ih*.06, iw*.88, ih*.66, 0, 0, 48, 72);
  const d = x.getImageData(0,0,48,72).data, buckets = new Map();
  for (let i = 0; i < d.length; i += 4){
    const k = (d[i]>>4)<<8 | (d[i+1]>>4)<<4 | (d[i+2]>>4), e = buckets.get(k) || {n:0,r:0,g:0,b:0};
    e.n++; e.r += d[i]; e.g += d[i+1]; e.b += d[i+2]; buckets.set(k, e);
  }
  const list = [...buckets.values()].map(e => ({n:e.n, c:[e.r/e.n, e.g/e.n, e.b/e.n]})).sort((a,b) => b.n - a.n);
  if (!list.length) return {bg:'#333333', fg:'#FFFFFF', accent:'#CCCCCC'};
  const score = e => e.n * (.35 + sat(e.c)*1.8), dom = list.slice(0,10).sort((a,b) => score(b)-score(a))[0].c, bg = hex(...dom);
  const others = list.slice(0,14).filter(e => dist(e.c, dom) > 70);
  const ac = others.slice().sort((a,b) => sat(b.c)*Math.sqrt(b.n) - sat(a.c)*Math.sqrt(a.n))[0];
  const accent = ac ? hex(...ac.c) : (lum(bg) > .5 ? '#1A1A1A' : '#F2F2F2');
  let fg = null, best = 0;
  for (const e of others){ const h = hex(...e.c), ct = contrast(h, bg); if (ct > best){ best = ct; fg = h; } }
  if (best < 4.5) fg = contrast('#FFFFFF', bg) >= contrast('#111111', bg) ? '#FFFFFF' : '#111111';
  return {bg, fg, accent};
}

/* ---------- wrap scans: find the spine between back and front ---------- */
/* Returns {x, w, frontX, score} in image pixels, or null when there's no clear spine.
   score is 0-100: how sure we are this is a clean spine (clear edges, where a DVD spine sits,
   an even colour down its height, lettering on it). The same logic lives in backend/api/spine.py. */
function findSpine(img, kind){
  kind = kind || (img.width/img.height >= 1.3 && img.width/img.height <= 1.9 ? 'movie' : 'book');
  const aspect = img.width/img.height, [lo, hi] = kind === 'movie' ? [1.3, 1.9] : [1.2, 2.4];
  if (aspect < lo || aspect > hi) return null;
  const cw = 600, ch = Math.max(40, Math.round(cw/aspect));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d', {willReadFrequently:true}); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, cw, ch);
  const d = x.getImageData(0,0,cw,ch).data, y0 = Math.floor(ch*.08), y1 = Math.floor(ch*.92), cols = [];
  const px = (X, Y) => { const i = (Y*cw+X)*4; return [d[i], d[i+1], d[i+2]]; };
  // a photo of a case or book on a table has a plain background down both sides; a scan runs to the edge
  const band = Math.max(4, Math.floor(cw/50)), sd = (x0, x1) => { const s = [0,0,0], q = [0,0,0]; let n = 0;
    for (let Y = 0; Y < ch; Y++) for (let X = x0; X < x1; X++){ const p = px(X, Y); for (let k = 0; k < 3; k++){ s[k] += p[k]; q[k] += p[k]*p[k]; } n++; }
    return [0,1,2].reduce((a, k) => a + Math.sqrt(Math.max(0, q[k]/n - (s[k]/n)**2)), 0)/3; };
  const border = (sd(0, band) + sd(cw - band, cw))/2;
  if (border < 10) return null;
  for (let X = 0; X < cw; X++){ let r=0,g=0,b=0,n=0; for (let Y = y0; Y < y1; Y += 2){ const i = (Y*cw+X)*4; r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; } cols.push([r/n,g/n,b/n]); }
  const avg = (a, b) => { const s = [0,0,0]; for (let i = a; i <= b; i++){ s[0]+=cols[i][0]; s[1]+=cols[i][1]; s[2]+=cols[i][2]; } const n = b-a+1; return [s[0]/n, s[1]/n, s[2]/n]; };
  const median = list => [0,1,2].map(k => { const v = list.map(p => p[k]).sort((a,b) => a-b), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m-1] + v[m])/2; });
  // colour step between the 3 columns left and right of X: scans have soft, blurred edges
  const edge = cols.map((_, i) => i < 3 || i > cw-4 ? 0 : dist(avg(i-3, i-1), avg(i+1, i+3)));
  const film = kind === 'movie', minW = Math.round(cw*(film ? .025 : .02)), maxW = Math.round(cw*(film ? .09 : .14));
  const cands = [];
  for (let L = Math.floor(cw*.36); L <= Math.floor(cw*.56); L++)
    for (let R = L + minW; R <= Math.min(cw-4, L + maxW); R++){
      const lo = Math.min(edge[L], edge[R]), hi = Math.max(edge[L], edge[R]);
      if (lo < 10 || hi < 25) continue;                           // one edge can be soft (spine and front alike), not both
      const e = .6*lo + .4*hi, wf = (R-L)/cw, off = Math.abs((L+R)/2/cw - .5);
      const fit = film ? ((wf >= .03 && wf <= .07) || (aspect >= 1.65 && wf >= .025 && wf <= .06) ? 1 : .75)*Math.exp(-.5*(off/.035)**2)   // DVD: 129 | 14 | 129 mm; Blu-ray runs wider, spine thinner
                       : Math.exp(-.5*(off/.1)**2);
      cands.push({L, R, e, fit, s:e*fit});
    }
  if (!cands.length) return null;
  cands.sort((a,b) => b.s - a.s);
  // among the best, prefer an even colour down the height (a spine, not a slice of a photo)
  const evenness = (L, R) => {
    const rows = [];
    for (let Y = y0; Y < y1; Y += 2){ let r=0,g=0,b=0; for (let X = L+1; X < R; X++){ const i = (Y*cw+X)*4; r+=d[i]; g+=d[i+1]; b+=d[i+2]; } const n = R-L-1; rows.push([r/n,g/n,b/n]); }
    const med = median(rows);
    return rows.filter(v => dist(v, med) < 60).length / rows.length;
  };
  const top40 = cands.slice(0, 40);
  for (const cd of top40){ cd.u = evenness(cd.L, cd.R); cd.f = cd.s*(.5 + .5*cd.u); }
  const ranked = top40.slice().sort((a,b) => b.f - a.f);            // best first; equal ones keep their order
  // drop plain margins above and below the wrap (rows that are one flat colour right across the scan)
  const flat = Y => { let s = 0, q = 0; for (let X = 0; X < cw; X += 2){ const i = (Y*cw+X)*4, v = d[i] + d[i+1] + d[i+2]; s += v; q += v*v; } const n = Math.ceil(cw/2); return Math.sqrt(Math.max(0, q/n - (s/n)**2))/3 < 6; };
  let top = 0, bot = ch - 1;
  while (top < ch*.15 && flat(top)) top++;
  while (bot > ch*.85 && flat(bot)) bot--;
  const k = img.width/cw, ky = img.height/ch;
  const cut = best => {
    // move each edge inward past columns that look more like the back or front cover than the spine
    const bl = best.L, br = best.R, q = Math.floor((br-bl)/4), inner = median(cols.slice(bl+q, br-q+1)), cap = Math.max(2, Math.round(cw*.02));
    const outL = avg(Math.max(0, bl-5), bl-2), outR = avg(br+2, Math.min(cw-1, br+5));
    let L = bl, R = br;
    while (L - bl < cap && R - L > minW && dist(cols[L], inner) > dist(cols[L], outL)) L++;
    while (br - R < cap && R - L > minW && dist(cols[R], inner) > dist(cols[R], outR)) R--;
    // spine and cover the same colour (Gummo: yellow on yellow) leave a soft edge that lettering can beat:
    // widen a thin film spine over columns that still match it, up to a DVD spine's usual 5 %
    if (film) while ((R-L)/cw < .05){ const r = R < cw-4 && dist(cols[R+1], inner) < 35, l = L > 3 && dist(cols[L-1], inner) < 35; if (!r && !l) break; if (r) R++; if (l && (R-L)/cw < .05) L--; }
    L++; R--;                                                         // one more column for the soft edge itself
    // a spine carries lettering: rows change as they cross it. A blank strip is a gap or a case hinge.
    const g = [];
    for (let Y = y0; Y < y1; Y++){ let s = 0; for (let X = L+1; X < R; X++){ const i = (Y*cw+X)*4; s += d[i] + d[i+1] + d[i+2]; } g.push(s/(3*Math.max(1, R-L-1))); }
    let text = 0; for (let i = 1; i < g.length; i++) text += Math.abs(g[i] - g[i-1]); text /= Math.max(1, g.length - 1);
    const penalty = (Math.abs(aspect - 4/3) < .012 ? .6 : 1)*(text < 2 ? .7 : 1);   // 4:3 is a phone photo, not a scan
    // Books: scans are rare and look-alikes common (3D mock-ups, a strip of one cover, two books side by side,
    // wooden boards for "Norwegian Wood"). Keep only a flat scan: a busy edge all round, clear edges on both
    // sides of the spine, straight up and down, and an even colour top to bottom.
    if (!film){
      const at = X => Math.max(...edge.slice(Math.max(0, X-3), X+4));
      const drift = X => { const pos = [[.1, .4], [.6, .9]].map(([a, b]) => { let best = -1, arg = X;
        for (let i = Math.max(3, X-12); i <= Math.min(cw-4, X+12); i++){ const col = (i0, i1) => { const t = [0,0,0]; let n = 0;
          for (let Y = Math.floor(ch*a); Y < Math.floor(ch*b); Y += 2) for (let c2 = i0; c2 <= i1; c2++){ const j = (Y*cw+c2)*4; t[0]+=d[j]; t[1]+=d[j+1]; t[2]+=d[j+2]; n++; } return t.map(v => v/n); };
          const e = dist(col(i+1, i+3), col(i-3, i-1)); if (e > best){ best = e; arg = i; } } return arg; });
        return Math.abs(pos[0] - pos[1])/cw; };
      if (border < 20 || Math.min(at(bl), at(br)) < 25 || best.u < .9 || Math.max(drift(bl), drift(br)) > .012) return null;
    }
    const score = Math.round(100*Math.min(1, best.e/60)*best.fit*(.5 + .5*best.u)*penalty);
    if (score < 20) return null;
    return {x:L*k, w:(R-L+1)*k, frontX:(br+1)*k, y:top*ky, h:(bot-top+1)*ky, score};
  };
  // A spine is never much wider than a real one for its height: a DVD's is 14 x 184 mm (1:13), a Blu-ray's
  // 12 x 148, and scans squash them (right cuts in the tested scans ran up to 1:8). The thickest paperbacks
  // are about 1:3.5. A wider cut has taken in part of the back or front, so the next candidate gets a turn;
  // with none left, there's no clean spine here (the caller moves on to the next scan, or the cover).
  const most = film ? .14 : .3, first = cut(ranked[0]);
  if (!first || first.w/first.h <= most) return first;
  for (const cd of ranked.slice(1)){ const r = cut(cd); if (r && r.w/r.h <= most) return r; }
  return null;
}
/* A photo or scan of a single spine (at least 4 times taller than wide). Trims plain background
   around it. score 0-100: a clean background around it (or none at all) and lettering on it. */
function findSoloSpine(img){
  const ch = 600, cw = Math.max(6, Math.round(ch*img.width/img.height));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d', {willReadFrequently:true}); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, cw, ch);
  const d = x.getImageData(0, 0, cw, ch).data, px = (X, Y) => { const i = (Y*cw+X)*4; return [d[i], d[i+1], d[i+2]]; };
  // background: the colour of the outer ring of pixels
  const ring = [];
  for (let X = 0; X < cw; X++){ ring.push(px(X, 0), px(X, ch-1)); }
  for (let Y = 0; Y < ch; Y++){ ring.push(px(0, Y), px(cw-1, Y)); }
  const bg = [0,1,2].map(k => ring.map(p => p[k]).sort((a,b) => a-b)[ring.length >> 1]);
  const plain = ring.filter(p => dist(p, bg) < 30).length/ring.length;   // 1: a clean background all round
  const isBg = p => plain > .6 && dist(p, bg) < 30;
  const colBg = X => { let n = 0; for (let Y = 0; Y < ch; Y += 2) n += isBg(px(X, Y)); return n/Math.ceil(ch/2) > .9; };
  const rowBg = Y => { let n = 0; for (let X = 0; X < cw; X++) n += isBg(px(X, Y)); return n/cw > .9; };
  let L = 0, R = cw-1, T = 0, B = ch-1;
  while (L < R && colBg(L)) L++;
  while (R > L && colBg(R)) R--;
  while (T < B && rowBg(T)) T++;
  while (B > T && rowBg(B)) B--;
  const w = R-L+1, h = B-T+1;
  if (w < 4 || h < ch*.5 || h/w < 4 || h/w > 40) return null;
  // lettering: rows change as they cross the spine
  let text = 0, prev = null;
  for (let Y = T; Y <= B; Y++){ let s = 0; for (let X = L; X <= R; X++){ const p = px(X, Y); s += p[0]+p[1]+p[2]; } s /= 3*w; if (prev !== null) text += Math.abs(s - prev); prev = s; }
  text /= Math.max(1, h-1);
  const score = Math.round(100*(plain > .6 ? 1 : .6)*(.4 + .6*Math.min(1, text/6)));
  if (score < 20) return null;
  const k = img.width/cw, ky = img.height/ch;
  return {x:L*k, y:T*ky, w:w*k, h:h*ky, score};
}
/* Lettering along a spine: a real one has its title, author and publisher down it; a false one (a plain strip at the
   join of a design with no spine, docs/BOOK-SPINES.md) has next to nothing. The strip is drawn 300 rows tall; a row is
   lettered when 6 to 90 % of its middle differs clearly from the strip's own colour. Returns {rows, parts}: the share
   of rows lettered, and in how many of 12 equal parts down its length at least 15 % of rows are. */
function lettering(img, x, y, w, h){
  const H = 300, W = Math.max(8, Math.round(H*w/h));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', {willReadFrequently:true}); g.imageSmoothingQuality = 'high'; g.drawImage(img, x, y, w, h, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, px = (X, Y) => { const i = (Y*W+X)*4; return [d[i], d[i+1], d[i+2]]; };
  const all = []; for (let Y = 0; Y < H; Y += 2) for (let X = 0; X < W; X++) all.push(px(X, Y));
  const bg = [0,1,2].map(k => all.map(p => p[k]).sort((a,b) => a-b)[all.length >> 1]);
  const x0 = Math.floor(W*.15), x1 = Math.max(x0 + 1, Math.ceil(W*.85)), lit = [];
  for (let Y = 0; Y < H; Y++){ let n = 0; for (let X = x0; X < x1; X++) n += dist(px(X, Y), bg) > 60; const f = n/(x1 - x0); lit.push(f > .06 && f < .9); }
  let parts = 0;
  for (let p = 0; p < 12; p++){ const a = Math.floor(p*H/12), z = Math.floor((p+1)*H/12); if (lit.slice(a, z).filter(Boolean).length/(z - a) > .15) parts++; }
  return {rows: lit.filter(Boolean).length/H, parts};
}
const lettered = (img, x, y, w, h) => { const l = lettering(img, x, y, w, h); return l.rows >= .1 && l.parts >= 3; };
const API = String(window.SPINESTACK_API || '').replace(/\/+$/, '');
let server = false;   // the old self-hosted backend (backend/): the builder looks for it and says so with Add.setServer()

/* ---------- the dialog ---------- */
const ICON = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;   // Lucide 1.49.0 (ISC)
const css = document.createElement('style');
css.textContent = `
#addDialog{box-sizing:border-box;width:min(680px,calc(100vw - 24px));max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;margin:auto;padding:var(--s5,24px);
  border:1px solid var(--ink,#000);border-radius:var(--radius,3px);background:var(--paper,#fff);color:var(--ink,#000);font:400 var(--fs-body,13px)/1.55 var(--mono,monospace)}
#addDialog::backdrop{background:rgba(0,0,0,.35)}
#addDialog *{box-sizing:border-box}
#addDialog h2{display:block;margin:0 0 var(--s4,16px);padding:0 var(--s6,40px) 0 0;border:0;font-size:var(--fs-dialog,16px);font-weight:400;text-transform:none;letter-spacing:0;color:inherit}
#addDialog h3{margin:0 0 var(--s3,12px);font-size:var(--fs-body,13px);font-weight:500;display:flex;flex-wrap:wrap;gap:var(--s1,4px) var(--s3,12px);align-items:baseline}
#addDialog h3 small{font-size:var(--fs-small,11px);font-weight:400;color:var(--grey,#6B6B6B)}
#addDialog p{margin:0 0 var(--s3,12px)}
#addDialog .addx{position:absolute;top:var(--s3,12px);right:var(--s3,12px);width:32px;height:32px;display:grid;place-items:center;background:none;border:0;padding:0;color:inherit;cursor:pointer}
#addDialog .addx svg{width:16px;height:16px}
#addDialog .addsearch{position:relative;margin:0}
#addDialog .addsearch input{width:100%;min-width:0;height:36px;font:400 var(--fs-body,13px) var(--mono,monospace);color:inherit;background:var(--paper,#fff);border:1px solid var(--ink,#000);border-radius:var(--radius,3px);padding:var(--s2,8px) var(--s6,40px) var(--s2,8px) var(--s3,12px)}
#addDialog .addsearch input::placeholder{color:#767676}
#addDialog .addsearch button{position:absolute;top:1px;right:1px;bottom:1px;width:var(--s6,40px);display:grid;place-items:center;background:none;border:0;padding:0;color:inherit;cursor:pointer}
#addDialog .addsearch button svg{width:16px;height:16px}
/* under the box: All · Films · Books, and at the right of that row what the search says ("Searching…", what it found).
   Nothing is held open for it, and nothing moves when it comes. A line too long for the row has the next one, from
   the left: the empty ::before between them takes the room on the row, and stays on it when the line goes under */
#addDialog .addunder{display:flex;flex-wrap:wrap;gap:var(--s2,8px) var(--s4,16px);margin-top:var(--s3,12px);align-items:center}
#addDialog .addunder::before{content:"";flex:1 1 0;order:1}
#addDialog .addopts{display:flex;flex-wrap:wrap;gap:var(--s2,8px) var(--s4,16px);align-items:center}
#addDialog .addopts label{cursor:pointer;display:flex;gap:var(--s1,4px);align-items:center}
#addDialog .addopts input{accent-color:var(--ink,#000);margin:0}
#addDialog .addstatus{order:2;min-width:0;max-width:100%;overflow-wrap:anywhere}
#addDialog .addstatus:empty{display:none}
#addDialog .addstatus.err{font-weight:500}
#addDialog #addMode,#addDialog #addRecent{margin:var(--s3,12px) 0 0}
#addDialog .addlist{list-style:none;margin:var(--s2,8px) 0 0;padding:0;border-top:1px solid var(--hair,#D9D9D9)}
#addDialog .addlist li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 var(--s3,12px);align-items:baseline;padding:var(--s2,8px);border-bottom:1px solid var(--hair,#D9D9D9);cursor:pointer}
#addDialog .addlist li:hover{background:var(--wash,#F3F3F3)}
#addDialog .addlist li[aria-selected="true"]{background:var(--ink,#000);color:var(--paper,#fff)}
#addDialog .addlist .t{font-weight:500;overflow-wrap:anywhere}
#addDialog .addlist .y{font-weight:400;color:var(--grey,#6B6B6B);margin-left:2px;font-variant-numeric:tabular-nums}
#addDialog .addlist .k{font-size:var(--fs-label,10px);text-transform:uppercase;letter-spacing:var(--track,1px);color:var(--grey,#6B6B6B);white-space:nowrap}
#addDialog .addlist .by{grid-column:1/-1;font-size:var(--fs-small,11px);color:var(--grey,#6B6B6B);overflow-wrap:anywhere}
#addDialog .addlist li[aria-selected="true"] :is(.y,.k,.by){color:inherit}
#addDialog #addSpines{margin-top:var(--s4,16px)}
#addDialog .addfound{--th:300px;--tw:104px;display:flex;gap:var(--s4,16px);overflow-x:auto;padding:var(--s2,8px) var(--s1,4px) var(--s1,4px);margin-bottom:var(--s2,8px);align-items:flex-start}
#addDialog .pick{flex:none;display:grid;grid-template-rows:var(--th) 16px;gap:var(--s2,8px);justify-items:center;width:max-content;min-width:var(--tw)}
#addDialog .pick .art{height:var(--th);display:flex;align-items:flex-end;background:none;border:0;padding:0;cursor:pointer;outline-offset:4px;border-radius:2px}
#addDialog .pick .art[aria-checked="true"]{outline:2px solid var(--ink,#000)}
#addDialog .pick .art img,#addDialog .pick .art canvas{height:var(--th);width:auto;display:block}
#addDialog .pick img.cov{aspect-ratio:auto 2/3;background:var(--wash,#F3F3F3)}
#addDialog .pick .lbl{font-size:var(--fs-label,10px);letter-spacing:0;text-transform:none;color:var(--grey,#6B6B6B);white-space:nowrap;width:var(--tw);text-align:center;overflow:hidden;text-overflow:ellipsis;align-self:center}
#addDialog .pick .lbl a{color:inherit}
#addDialog .addfound .rule{flex:none;width:1px;height:var(--th);background:var(--hair,#D9D9D9)}
/* no real spine for a book: "Have it? Photograph the spine", first, opens a picture of your own copy */
#addDialog .pick .snap{width:var(--tw);flex-direction:column;align-items:center;justify-content:center;gap:var(--s2,8px);border:1px solid var(--hair,#D9D9D9);border-radius:var(--radius,3px);
  font:400 var(--fs-small,12px)/1.35 var(--mono,monospace);color:var(--ink,#000);text-align:center;padding:var(--s2,8px)}
#addDialog .pick .snap:hover{border-color:var(--ink,#000)}
#addDialog .pick .snap svg{width:20px;height:20px}
#addDialog .addbar{display:flex;justify-content:flex-end;align-items:center;gap:var(--s3,12px);margin-top:var(--s4,16px)}
/* under the spines a search found, at the left of the bar: "Search by Brave", small and grey (Brave asks for it where its results show) */
#addDialog .addby{margin-right:auto;font-size:var(--fs-small,11px);color:var(--grey,#6B6B6B)}
/* what to do with it: three choices in a row, as the tabs are (the one picked black, a line under it) */
#addDialog .addwhat{display:flex;flex-wrap:wrap;gap:var(--s2,8px) var(--s5,24px);margin:0 0 var(--s4,16px);border-bottom:1px solid var(--hair,#D9D9D9)}
#addDialog .addwhat label{position:relative;cursor:pointer}
#addDialog .addwhat input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
#addDialog .addwhat span{display:block;padding:0 0 var(--s2,8px);margin-bottom:-1px;color:var(--grey,#6B6B6B);border-bottom:1px solid transparent;white-space:nowrap}
#addDialog .addwhat input:checked + span{color:var(--ink,#000);border-bottom-color:var(--ink,#000)}
#addDialog .addwhat input:focus-visible + span{outline:2px solid var(--ink,#000);outline-offset:3px}
#addDialog .addneed{margin:0;display:flex;flex-wrap:wrap;gap:var(--s2,8px) var(--s3,12px);align-items:baseline}
/* Log it and Watchlist: the cover, and beside it the title, the caption and what happens */
#addDialog #addPost{margin-top:var(--s4,16px)}
#addDialog .addpost{display:grid;grid-template-columns:120px minmax(0,1fr);gap:var(--s4,16px);align-items:start}
#addDialog .addcov{display:block;width:120px;aspect-ratio:2/3;line-height:0}
#addDialog .addcov canvas{width:100%;height:auto;display:block}
#addDialog .addcov img{width:100%;height:100%;object-fit:cover;display:block;border-radius:var(--radius,3px);background:var(--wash,#F3F3F3)}
#addDialog .addcov .blank{display:block;width:100%;height:100%;border-radius:var(--radius,3px);background:var(--wash,#F3F3F3)}
#addDialog .addpostf{display:grid;gap:var(--s3,12px);min-width:0}
#addDialog .addpostf h3{margin:0}
#addDialog .addsay{display:grid;gap:var(--s1,4px)}
#addDialog .addsay textarea{width:100%;min-width:0;font:400 var(--fs-body,13px)/1.5 var(--mono,monospace);color:inherit;background:var(--paper,#fff);border:1px solid var(--ink,#000);border-radius:var(--radius,3px);padding:var(--s2,8px) var(--s3,12px);resize:vertical}
#addDialog .addsay .lbl{font-size:var(--fs-label,10px);text-transform:uppercase;letter-spacing:var(--track,1px);color:var(--grey,#6B6B6B)}
#addDialog .addsay .lbl i{font-style:normal;text-transform:none;letter-spacing:0}
#addDialog .addfeedline{margin:0;font-size:var(--fs-small,11px);color:var(--grey,#6B6B6B);overflow-wrap:anywhere}
/* a touch screen: every control takes a press in the 44 x 44px round its middle (as site.css does), and the fields
   are 16px so the phone doesn't zoom in */
@media (pointer:coarse){
  #addDialog .addopts label,#addDialog .addopts input,#addDialog .pick .art{position:relative}   /* a box or circle stays on top of its own press area */
  #addDialog .addby{position:relative}
  :is(#addDialog .addx,#addDialog .addsearch button,#addDialog .addopts label,#addDialog .addwhat label,#addDialog .pick .art,#addDialog .addby)::before{content:"";position:absolute;top:min(0px,calc(50% - 22px));right:min(0px,calc(50% - 22px));bottom:min(0px,calc(50% - 22px));left:min(0px,calc(50% - 22px))}
  #addDialog .addsearch input{height:44px;font-size:16px}
  #addDialog .addsay textarea{font-size:16px}
}
/* on a phone it sits at the top, so the box and its suggestions stay above the keyboard */
@media (max-width:520px){ #addDialog{padding:var(--s4,16px);margin-top:var(--s3,12px)} #addDialog .addfound{--th:220px;--tw:84px}
  #addDialog .addpost{grid-template-columns:88px minmax(0,1fr);gap:var(--s3,12px)} #addDialog .addcov{width:88px} }`;
document.head.appendChild(css);
const dlg = document.createElement('dialog');
dlg.id = 'addDialog'; dlg.setAttribute('aria-labelledby', 'addTitle');
dlg.innerHTML = `
  <button class="addx" id="addClose" type="button" aria-label="Close">${ICON('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>')}</button>
  <h2 id="addTitle">Add to your shelf</h2>
  <div class="addwhat" role="radiogroup" aria-label="What to do with it">
    <label><input type="radio" name="addWhat" value="shelf" checked><span>Put on shelf</span></label>
    <label><input type="radio" name="addWhat" value="log"><span>Log it</span></label>
    <label><input type="radio" name="addWhat" value="watch"><span>Watchlist</span></label>
  </div>
  <p class="addneed" id="addNeed" hidden><span id="addNeedText"></span> <button class="dash sm" id="addNeedGo" type="button"></button></p>
  <div id="addFind">
  <form class="addsearch" id="addForm" autocomplete="off">
    <input type="text" id="addQ" placeholder="Gummo, The Waves, Kids" aria-label="Film or book name" maxlength="120" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="addRows">
    <button type="submit" aria-label="Search">${ICON('<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>')}</button>
  </form>
  <div class="addunder">
    <div class="addopts" role="radiogroup" aria-label="Search in">
      <label><input type="radio" name="addKind" value="all" checked>All</label>
      <label><input type="radio" name="addKind" value="movie">Films</label>
      <label><input type="radio" name="addKind" value="book">Books</label>
    </div>
    <div class="addstatus" id="addStatus" role="status"></div>
  </div>
  <p class="grey" id="addMode" hidden>Search needs the shelfstackd server, so it's off in this preview. Uploading a scan on the builder still works.</p>
  <p class="grey" id="addRecent" hidden>Recently found: <span></span></p>
  <div id="addMatches" hidden>
    <ul class="addlist" id="addRows" role="listbox" aria-label="Films and books"></ul>
  </div>
  <div id="addSpines" hidden>
    <h3><span id="addSpinesTitle">Spines</span> <small id="addSpinesBy"></small> <button class="dash sm" id="addChange" type="button">Change</button></h3>
    <p id="addDup" hidden><span id="addDupText"></span> <button class="dash sm" id="addDupAdd" type="button">Add again</button> <button class="dash sm" id="addDupCancel" type="button">Cancel</button></p>
    <div class="addfound" id="addFound" role="radiogroup" aria-label="Which spine"></div>
    <input type="file" id="addPhoto" accept="image/*" hidden>
    <p class="grey" id="addNote" hidden>Real DVD and book spines show up once the shelfstackd server is connected. Until then, upload a full DVD scan on the builder.</p>
    <div class="addbar"><a class="addby" id="addBy" href="https://search.brave.com/" target="_blank" rel="noopener">Search by Brave</a><button class="btn primary" id="addGo" type="button" disabled>Add to shelf</button></div>
  </div>
  <div id="addPost" hidden>
    <div class="addpost">
      <span class="addcov" id="addCov"></span>
      <div class="addpostf">
        <h3><span id="addPostTitle"></span> <small id="addPostBy"></small> <button class="dash sm" id="addPostChange" type="button">Change</button></h3>
        <label class="addsay" id="addSayWrap"><span class="lbl">Caption <i>(optional)</i></span><textarea id="addSay" maxlength="280" rows="3"></textarea></label>
        <p class="addfeedline" id="addFeedLine"></p>
      </div>
    </div>
    <div class="addbar"><button class="btn primary" id="addPostGo" type="button">Post</button></div>
  </div>
  </div>`;
document.body.appendChild(dlg);
const $ = s => dlg.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* The builder says what its shelf holds and takes a new spine: Add.setShelf({has(key), count(key), add(fields)}).
   has: is this title on the shelf; count: how many times; add: put it on, false when it couldn't (the shelf is full). */
let shelf = null;
let say = null;   // the page's own toast, when it has one (Add.setToast)
const toast = msg => { if (say) say(msg); else sstatus(esc(msg)); };

/* ---------- search: the Spinestack server, or TMDB + Open Library straight from the browser ---------- */
const sstatus = (msg, err) => { const s = $('#addStatus'); s.classList.toggle('err', !!err); s.innerHTML = msg; };
const TMDB = String(window.SPINESTACK_TMDB || '').trim();
const WORKER = String(window.SPINESTACK_WORKER || '').trim().replace(/\/+$/, '');
const direct = !window.claude;   // the Claude preview can't reach other sites
const viaWorker = u => WORKER ? WORKER + '/img?url=' + encodeURIComponent(u) : u;
const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
const getJSON = (url, opt) => fetch(url, opt).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
async function tmdbFilms(q){
  const bearer = TMDB.length > 40, opt = bearer ? {headers:{Authorization:'Bearer ' + TMDB}} : {}, key = bearer ? '' : '&api_key=' + encodeURIComponent(TMDB);
  const find = (s, y) => getJSON('https://api.themoviedb.org/3/search/movie?include_adult=false&query=' + encodeURIComponent(s) + (y ? '&year=' + y : '') + key, opt);
  const yq = q.match(/^(.+?)[\s,(]+((?:19|20)\d\d)\)?$/);   // "kids 1995": TMDB finds nothing when the year is in the query
  let r = yq ? await find(yq[1], yq[2]) : await find(q);
  if (yq && !(r.results || []).length) r = await find(yq[1]);
  const films = (r.results || []).map((m, i) => ({m, i, c: closeness(m.title || '', q)})).sort((a, b) => a.c - b.c || (b.m.vote_count || 0) - (a.m.vote_count || 0) || a.i - b.i).map(x => x.m);   // as the Worker ranks them
  return Promise.all(films.slice(0,5).map(async (m,i) => {
    let creator = '';
    if (i < 3) try { const c = await getJSON(`https://api.themoviedb.org/3/movie/${m.id}/credits?` + key.slice(1), opt); creator = ((c.crew || []).find(p => p.job === 'Director') || {}).name || ''; } catch {}
    return {kind:'movie', title:m.title || '', year:(m.release_date || '').slice(0,4), creator, cover:m.poster_path ? 'https://image.tmdb.org/t/p/w500' + m.poster_path : ''};
  }));
}
async function olBooks(q){
  const r = await getJSON('https://openlibrary.org/search.json?limit=5&fields=title,author_name,author_alternative_name,author_key,first_publish_year,cover_i&q=' + encodeURIComponent(q));
  const docs = r.docs || [], authors = await Promise.all(docs.map(latinAuthor));
  return docs.map((d, i) => ({kind:'book', title:d.title || '', year:String(d.first_publish_year || ''), creator:authors[i], cover:d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : ''}));
}
// the author in Latin letters, as the Worker's /identify gives it: a name in another script (村上春樹) gives way to the
// first Latin-script name in author_alternative_name, then in the author record's alternate_names; else it stays
const LATIN = /^[\p{Script=Latin}\p{M}\p{N}\s.,'’()&-]+$/u, isLatin = n => !!n && LATIN.test(n) && /\p{Script=Latin}/u.test(n);
/* (the same as the Worker's) A person's name as they'd write it, from the Latin-script names Open Library has for them: "MURAKAMI HARUKI",
   "Murakami Haruki" and "Haruki MURAKAMI" are Haruki Murakami. A word in capitals (three letters or more, not an
   initial) is put in ordinary case. The family name is the word a library writes in capitals beside a given name in
   ordinary case ("Haruki MURAKAMI"); it goes last. A name already in ordinary case is kept as it is. */
const CAPS = w => (w.match(/\p{L}/gu) || []).length >= 3 && !w.includes('.') && w === w.toUpperCase();
const cased = w => CAPS(w) ? w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : w;
function personName(names){
  const list = names.filter(Boolean).map(n => String(n).trim().replace(/\s+/g, ' ')).filter(n => n && n.split(' ').length <= 4);
  if (!list.length) return '';
  let family = '', marked = '';
  for (const n of list){ const ws = n.split(' '), caps = ws.filter(CAPS); if (ws.length >= 2 && caps.length === 1){ family = caps[0].toLowerCase(); marked = n; break; } }
  const ordinary = n => !n.split(' ').some(CAPS);
  const best = list.find(n => ordinary(n) && (!family || n.split(' ').slice(-1)[0].toLowerCase() === family)) || marked || list.find(ordinary) || list[0];
  let ws = best.split(' ').map(cased);
  if (family && ws.length === 2 && ws[0].toLowerCase() === family) ws = [ws[1], ws[0]];
  return ws.join(' ');
}
async function latinAuthor(d){
  const name = (d.author_name || [''])[0];
  if (!name || isLatin(name) && !name.split(/\s+/).some(CAPS)) return name;
  const alts = [...(isLatin(name) ? [name] : []), ...(d.author_alternative_name || []).filter(isLatin)];
  if (alts.length) return personName(alts) || name;
  const key = (d.author_key || [])[0]; if (!key) return name;
  try { return personName(((await getJSON(`https://openlibrary.org/authors/${encodeURIComponent(key)}.json`)).alternate_names || []).filter(isLatin)) || name; } catch { return name; }
}
async function identifyDirect(q, want){
  const films = want !== 'book' && TMDB, books = want !== 'movie';
  const [f, b] = await Promise.allSettled([films ? tmdbFilms(q) : [], books ? olBooks(q) : []]);
  if ((!films || f.status === 'rejected') && (!books || b.status === 'rejected')) throw new Error('no answer');
  return [...(f.value || []), ...(b.value || [])];
}
/* Suggestions while you type: a search starts 250 ms after the last key (Enter starts it at once), and a newer one
   cancels the one before, whose answer is dropped if it still comes. Up to six results, films and books together,
   by how well the title matches what was typed: the same, then starting with it, then containing it. */
const SHOWN = 6, WAIT = 250;
let matches = [], active = -1;   // active: the highlighted result
let shownFor = null;             // "<kind>|<text>" the results on screen answer
let typing = 0, run = 0, asking = null;
const seen = new Map();          // answers already had in this dialog, so going back over a word asks nothing
const wanted = () => ($('input[name=addKind]:checked') || {}).value || 'all';
const plain = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
// 0: the title is what was typed, 1: it starts with it, 2: it has it, 3: neither (a near miss the search still found).
// A leading "the", "a" or "an" doesn't count, and a year in figures is also its words (1984 is Nineteen Eighty-Four,
// just after a title that is 1984). The same as closeness() in the Worker: keep them in step
const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = 'x x twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const under100 = n => n < 20 ? ONES[n] : TENS[Math.floor(n/10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
const yearWords = y => y >= 2000 && y < 2010 ? 'two thousand' + (y % 10 ? ' ' + ONES[y % 10] : '') : under100(Math.floor(y/100)) + ' ' + (y % 100 === 0 ? 'hundred' : y % 100 < 10 ? 'oh ' + ONES[y % 100] : under100(y % 100));
const spelled = s => s.replace(/\b(1[0-9]|20)\d\d\b/g, y => yearWords(+y));
const bare = s => plain(s).replace(/^(the|a|an) /, '');
function closeness(title, q){
  const t = bare(title), want = bare(q.replace(/[\s,(]+(?:19|20)\d\d\)?$/, ''));   // "kids 1995": the year isn't part of the title
  if (!want) return 3;
  const how = w => t === w ? 0 : t.startsWith(w) ? 1 : (' ' + t + ' ').includes(' ' + w + ' ') || t.includes(w) ? 2 : 3;
  const say = spelled(want);
  return say === want ? how(want) : Math.min(how(want), how(say) + .5);
}
function rank(results, q){
  const nth = {movie: 0, book: 0};   // each kind keeps the order it came in; a film and a book as close as each other take turns
  return results.map(m => ({m, c: closeness(m.title, q), i: nth[m.kind === 'movie' ? 'movie' : 'book']++}))
    .sort((a, b) => a.c - b.c || a.i - b.i || (a.m.kind === 'movie' ? 0 : 1) - (b.m.kind === 'movie' ? 0 : 1)).slice(0, SHOWN).map(x => x.m);
}
async function lookUp(q, want, typed, signal){
  if (server) return (await fetch(API + '/api/identify?q=' + encodeURIComponent(q), {signal}).then(r => r.json())).results;
  // suggest=1: an answer for a half-typed title isn't kept by the Worker the way a finished search is
  if (WORKER) return getJSON(`${WORKER}/identify?want=${want}&q=${encodeURIComponent(q)}${typed ? '&suggest=1' : ''}`, {signal}).then(r => r.results)
    .catch(err => { if (err && err.name === 'AbortError') throw err; return identifyDirect(q, want); });
  return identifyDirect(q, want);
}
function paintActive(){
  const rows = [...dlg.querySelectorAll('#addRows [role=option]')];
  rows.forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
  const q = $('#addQ'), on = rows[active];
  if (on){ q.setAttribute('aria-activedescendant', on.id); on.scrollIntoView({block: 'nearest'}); } else q.removeAttribute('aria-activedescendant');
  q.setAttribute('aria-expanded', String(!$('#addMatches').hidden && rows.length > 0));
}
function showMatches(){
  $('#addRows').innerHTML = matches.map((m, i) => `<li role="option" id="addOpt${i}" data-i="${i}" aria-selected="false"><span class="t">${esc(m.title)}${m.year ? ` <span class="y">${esc(m.year)}</span>` : ''}</span> <span class="k">${m.kind === 'movie' ? 'Film' : 'Book'}</span>${m.creator ? ` <span class="by">${esc(m.creator)}</span>` : ''}</li>`).join('');
  $('#addMatches').hidden = !matches.length;
  active = matches.length ? 0 : -1; paintActive();
}
// typed: asked for by the typing itself, not by Enter
async function search(typed){
  clearTimeout(typing);
  const q = $('#addQ').value.trim(), want = wanted(), key = want + '|' + q.toLowerCase(), mine = ++run;
  if (asking){ asking.abort(); asking = null; }
  if (!q){ matches = []; shownFor = null; showMatches(); sstatus(''); return; }
  const noFilms = !server && !WORKER && !TMDB && want !== 'book';
  if (!server && !direct){ sstatus('Search runs on the shelfstackd server, which this preview doesn’t have. Upload a scan on the builder instead.', true); return; }
  if (noFilms && want === 'movie'){ sstatus('Film search needs a TMDB key. Books work without one.', true); $('#addMatches').hidden = true; paintActive(); return; }
  current = null; picked = null; $('#addSpines').hidden = true; $('#addPost').hidden = true;
  let results = seen.get(key);
  if (!results){
    sstatus('Searching…');
    const ctl = asking = new AbortController();
    try { results = await lookUp(q, want, typed, ctl.signal); }
    catch (err){
      if (mine !== run || (err && err.name === 'AbortError')) return;   // a newer search took over
      matches = []; shownFor = null; showMatches();   // the last search's titles go, so Enter can't pick one for this
      sstatus((server ? 'The search server' : 'The search') + ' didn’t answer. Try again in a moment.', true); return;
    }
    finally { if (asking === ctl) asking = null; }
    if (mine !== run) return;
    results = (results || []).filter(m => want === 'all' || m.kind === want);
    seen.set(key, results);
  }
  matches = rank(results, q); shownFor = key;
  showMatches();
  sstatus(matches.length ? (noFilms ? 'Film search needs a TMDB key.' : '') : 'Nothing found for "' + esc(q) + '". Try the original title or the author.', !matches.length);
}
$('#addQ').addEventListener('input', () => {
  clearTimeout(typing);
  if ($('#addQ').value.trim().length < 2){   // one letter: nothing is suggested yet (Enter still searches it)
    run++; if (asking){ asking.abort(); asking = null; }
    matches = []; shownFor = null; showMatches(); sstatus(''); return;
  }
  typing = setTimeout(() => search(true), WAIT);
});
dlg.querySelectorAll('input[name=addKind]').forEach(r => r.addEventListener('change', () => { if ($('#addQ').value.trim()) search(false); }));
// a result picked: its spines (Put on shelf), or its post (Log it, Watchlist)
let picked = null;
const pick = i => { const m = matches[i]; if (!m) return; picked = m; if (what() === 'shelf') findSpines(m); else showPost(m); };
// Enter: picks the highlighted result when the results on screen answer what's in the box; otherwise it searches now
$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const key = wanted() + '|' + $('#addQ').value.trim().toLowerCase();
  if (shownFor === key && active >= 0 && !$('#addMatches').hidden) pick(active); else search(false);
});
$('#addQ').addEventListener('keydown', e => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  if ($('#addMatches').hidden || !matches.length) return;
  e.preventDefault();
  active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; paintActive();
});
$('#addRows').addEventListener('click', e => { const li = e.target.closest('[role=option]'); if (li) pick(+li.dataset.i); });
$('#addRows').addEventListener('pointermove', e => { const li = e.target.closest('[role=option]'); if (li && +li.dataset.i !== active){ active = +li.dataset.i; paintActive(); } });

/* An image that fails this couldn’t be drawn into a shelf’s picture or its story, so it never goes on the shelf. */
const canvasSafe = img => { try { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 1, 1); c.toDataURL(); return true; } catch { return false; } };
/* Picking a match looks for real spines in DVD and book scans (the Worker finds them, the browser cuts them).
   A clearly good one is picked for you; otherwise you pick. With no scans, the pick is a spine made from the
   poster or cover. Add to shelf puts the picked one on the shelf. */
const AUTO_SCORE = 75, SHOW_SCORE = 45;   // tested: right spines scored 76-97, wrong ones up to 69; below 45 mostly photos of open cases
// Edition (English or Any) is one of the builder's Style choices; it's remembered on this device
const EDITION = 'shelfstackd-edition';
const englishOnly = () => { try { return localStorage.getItem(EDITION) !== 'any'; } catch { return true; } };
// the Worker flags each scan: en = no sign of another language or region, vhs = a tape
const isEnglish = c => c.en !== false && !c.vhs;
// best first: with English on, English DVD/Blu-ray above other editions; VHS below everything else either way
const rankCut = (c, english) => (english && !isEnglish(c) ? -1000 : 0) + (c.vhs ? -500 : 0) + c.score;
let current = null;
const keyOf = m => [m.kind, m.title.toLowerCase(), m.year || ''].join('|');
// what goes on the shelf for a choice: 'real:<n>' (a spine cut from a scan), 'spine' (made from the poster or cover)
// or 'cover' (the poster or cover, face out). The builder turns these fields into a book on its shelf.
function bookFields(cur, choice){
  const m = cur.m, film = m.kind === 'movie', base = {title:m.title, author:m.creator || '', kind:m.kind, year:m.year || '', coverUrl:m.cover || '', font:'oswald', key:cur.key, choice};
  if (choice.startsWith('real:')){
    const r = cur.real[+choice.slice(5)], front = r.front || cur.img || r.spine, pal = extractPalette(front);
    return Object.assign(base, {img:front, spineImg:r.spine, archiveId:r.archive ? r.id : undefined, source:r.archive ? 'the archive' : r.photo ? 'your photo' : hostOf(r.source), bg:pal.bg, fg:pal.fg, accent:pal.accent, style:'real'}, front.src ? {thumb:front.src} : {});
  }
  const img = cur.img, pal = extractPalette(img), t = film ? cur.title : null;
  const bg = t ? t.bg : film ? '#111111' : pal.bg, fg = t ? (contrast('#F4F4F2', bg) >= contrast('#111111', bg) ? '#F4F4F2' : '#111111') : film ? '#F4F4F2' : pal.fg;
  return Object.assign(base, {img, thumb:img.src, bg, fg, accent:pal.accent, titleImg:t && t.img, style:choice === 'cover' ? 'cover' : film ? 'dvd' : 'art'});
}
const tileCanvas = (b, w, H0) => { const dpr = Math.min(2, window.devicePixelRatio || 1), sp = makeSpine(b, w*dpr, H0*dpr); sp.style.width = sp.width/dpr + 'px'; sp.setAttribute('aria-hidden', 'true'); return sp; };
function paintGo(){ const cur = current; $('#addGo').disabled = !cur || !cur.choice; }   // while scans load too: the spine made from the cover is ready
function showTiles(cur){
  const m = cur.m, noun = m.kind === 'movie' ? 'poster' : 'cover';
  // every option in one row at one height: the spine (press it to pick it), then one line saying where it's from
  const tile = (c, art, label, what) => `<div class="pick" data-c="${c}"><button type="button" class="art" role="radio" aria-checked="${cur.choice === c}" data-use="${c}" aria-label="${what}">${art}</button><span class="lbl">${label}</span></div>`;
  const tiles = cur.real.map((r,i) => tile('real:' + i, '', r.photo ? 'Your photo' : r.archive
    ? `From the archive · <a href="#" data-report="${esc(r.id)}">Report</a>`
    : `<a class="src" href="${esc(r.source)}" target="_blank" rel="noopener">${esc(hostOf(r.source))}</a>`, r.photo ? 'Your photo of the spine' : 'A real spine from ' + esc(r.archive ? 'the archive' : hostOf(r.source))));
  // a book with no real spine found: photographing your own copy comes first, Generated next
  if (!cur.busy && WORKER && !server && m.kind === 'book' && !cur.real.length)
    tiles.unshift(`<div class="pick" data-c="photo"><button type="button" class="art snap" id="addSnap">${ICON('<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>')}Have it? Photograph the spine</button><span class="lbl">Your copy</span></div>`);
  if (cur.img){
    tiles.push(tile('spine', '', 'Generated', 'A spine made from the ' + noun));
    tiles.push('<span class="rule" aria-hidden="true"></span>');
    tiles.push(tile('cover', `<img class="cov" src="${esc(cur.img.src)}" crossorigin="anonymous" alt="">`, 'Cover', 'The ' + noun + ', face out'));
  }
  $('#addFound').innerHTML = tiles.join('') || (cur.busy ? '' : '<p class="grey">No scans and no ' + noun + ' found for this title. Upload a scan on the builder.</p>');
  const H0 = parseFloat(getComputedStyle($('#addFound')).getPropertyValue('--th')) || 300;
  cur.real.forEach((r,i) => $(`#addFound [data-c="real:${i}"] .art`).append(tileCanvas({style:'real', spineImg:r.spine}, H0*r.spine.width/r.spine.height, H0)));
  const gen = $('#addFound [data-c="spine"] .art');
  if (gen){
    const b = cur.preview || (cur.preview = Object.assign({id:'preview', cat:'D10000', wf:1, hf:1, jit:0, kind:'book', author:'', studio:'', status:''}, bookFields(cur, 'spine')));
    gen.append(tileCanvas(b, isCase(b) ? H0/11 : Math.min(H0/5, 220*b.wf*H0/1160), H0));
  }
  paintGo();
}
/* Loads one scan through the Worker and cuts its spine: an archive spine is used as it is,
   a tall thin image is a single spine, anything else is a wrap (back | spine | front). */
async function cutOne(s, kind){
  try {
    const img = await timeout(loadImg(s.archive ? WORKER + s.img : viaWorker(s.img)), 15000);
    if (!canvasSafe(img)) return null;
    const base = {source:s.source, img:s.img, scan:img, archive:!!s.archive, id:s.id, front:null, en:s.en !== false, vhs:!!s.vhs};
    if (s.archive) return Object.assign(base, {spine:img, score:100});   // checked by hand before it was approved
    // a book's spine must have lettering down it; a picture of one spine alone (1:6 or narrower) is the whole spine
    const book = kind === 'book';
    if (book && img.width/img.height <= 1/6) return lettered(img, 0, 0, img.width, img.height) ? Object.assign(base, {spine:img, score:80, solo:true}) : null;
    if (img.height/img.width >= 4){ const c = findSoloSpine(img); return c && (!book || lettered(img, c.x, c.y, c.w, c.h)) ? Object.assign(base, {spine:crop(img, c.x, c.y, c.w, c.h), score:c.score, solo:true}) : null; }
    const cut = findSpine(img, kind); if (!cut || (book && !lettered(img, cut.x, cut.y, cut.w, cut.h))) return null;
    return Object.assign(base, {spine:crop(img, cut.x, cut.y, cut.w, cut.h), front:crop(img, cut.frontX, cut.y, img.width - cut.frontX, cut.h), score:cut.score});
  } catch { return null; }
}
/* Asks the Worker for scans one round (one search) at a time and stops once two good spines turn up,
   so most titles cost one or two searches. While round 0 searches, the later rounds are asked for what the Worker
   already keeps (cacheonly: no search spent), so a round kept from before is there at once; a round that has to
   search is still asked only when the ones before it weren't enough. LIVE rounds may search at the same time (1: one
   after another, as the search budget wants; more makes a slow title quicker and can spend searches that weren't
   needed). Each spine is passed to onCut as soon as it's cut. Returns the cuts, best first: the same ones, in the same
   order, as asking one round after another. A book has three rounds (round 0, then "<title>" <author> book spine,
   then the dust jacket full wrap) and asks for the next only while it still has no clean spine to show: each one
   after round 0 is a paid search, and most books have no scan to find (docs/BOOK-SPINES.md). */
const LIVE = 1, roundsFor = kind => kind === 'book' ? 3 : 4;
async function cutScans(cur, english, onCut){
  const ROUNDS = roundsFor(cur.m.kind), book = cur.m.kind === 'book';
  const q = `${WORKER}/scans?kind=${cur.m.kind}&title=${encodeURIComponent(cur.m.title)}&year=${encodeURIComponent(cur.m.year || '')}&creator=${encodeURIComponent(cur.m.creator || '')}`;
  const get = (round, cacheOnly) => timeout(getJSON(q + '&round=' + round + (cacheOnly ? '&cacheonly=1' : '')), 20000);
  const kept = [Promise.resolve(null)];   // per round: what's kept, or null (a Worker from before cached= says nothing, so it's asked)
  for (let r = 1; r < ROUNDS; r++) kept.push(get(r, true).then(x => x && x.cached === true ? x : null, () => null));
  const live = [], ask = round => live[round] || (live[round] = get(round, false));
  const seen = new Set(), cuts = []; let scans = 0, rounds = 0, busy = false, capped = false;
  for (let round = 0; round < ROUNDS && cur === current; round++){
    if (round) sstatus(`Looking for more scans (${round + 1} of ${ROUNDS})…`);
    let r = await kept[round];
    if (!r){
      for (let k = round + 1; k < Math.min(ROUNDS, round + LIVE); k++) if (!(await kept[k])) ask(k);   // the next ones that would search, together
      try { r = await ask(round); }
      catch (err){ if (!cuts.length && !rounds) throw err; busy = /429/.test(err.message); break; }   // keep what the earlier rounds found
    }
    rounds++;
    const fresh = (r.results || []).filter(s => !seen.has(s.img) && seen.add(s.img));
    scans += fresh.length;
    // capped: today's Brave searches are used up, so this round held only archive spines and scans kept from before.
    // With nothing in it there's no more to ask for.
    if (r.capped){ capped = true; if (!fresh.length) break; }
    if (fresh.length && cur === current) sstatus(`Cutting spines from ${scans} scan${scans > 1 ? 's' : ''}…`);
    // cut at once, each shown as it's done; kept in the order they came, as before
    const got = new Array(fresh.length);
    await Promise.all(fresh.map((s, i) => cutOne(s, cur.m.kind).then(c => { got[i] = c; if (c && onCut && cur === current) onCut(bestCuts(cur.m.kind, [...cuts, ...got.filter(Boolean)], english)); })));
    cuts.push(...got.filter(Boolean));
    if (cuts.filter(c => c.score >= AUTO_SCORE && (!english || isEnglish(c))).length >= 2 || !r.more) break;
    if (book && bestCuts('book', cuts, english).length) break;   // a book: one clean spine is enough, no more searches
  }
  return {scans, rounds, busy, capped, cuts: bestCuts(cur.m.kind, cuts, english)};
}
// one option per page, best first: the same scan often comes at several sizes (reddit previews, eBay listings)
function bestCuts(kind, cuts, english){
  const best = new Map();
  const show = kind === 'book' ? 20 : SHOW_SCORE;   // a book cut has already passed the strict flat-scan checks in findSpine
  for (const c of cuts.filter(c => c.score >= show && c.spine.width <= c.spine.height/5).sort((a,b) => rankCut(b, english) - rankCut(a, english)))
    if (!best.has(c.source)) best.set(c.source, c);
  return [...best.values()].slice(0, 8);
}
async function findSpines(m, again){
  const key = keyOf(m), cur = current = {m, key, real:[], res:{spines:[]}, img:null, busy:true, choice:null}, noun = m.kind === 'movie' ? 'poster' : 'cover';
  $('#addSpines').hidden = false; $('#addMatches').hidden = true; paintActive();
  $('#addSpinesTitle').textContent = m.title + (m.year ? ' (' + m.year + ')' : ''); $('#addSpinesBy').textContent = m.creator ? '· ' + m.creator : '';
  $('#addNote').hidden = server || !!WORKER; $('#addFound').innerHTML = ''; $('#addDup').hidden = true; paintGo();
  $('#addBy').hidden = server || !WORKER;   // the Worker's scan search is the one that asks Brave
  if (!again && shelf && shelf.has(key)){
    // already on the shelf: ask before adding it a second time
    $('#addDupText').textContent = m.title + ' is already on your shelf.'; $('#addDup').hidden = false; cur.busy = false; sstatus('');
    return;
  }
  if (again && shelf) cur.key = key + '#' + (1 + shelf.count(key));
  const poster = m.cover ? timeout(loadImg(server ? API + '/api/image?url=' + encodeURIComponent(m.cover) : viaWorker(m.cover)), 15000).catch(() => null) : Promise.resolve(null);
  let found = {scans:0, cuts:[]}, failed = false;
  const english = englishOnly();
  // while the scans load there's already something to pick: the spine made from the poster or cover, and the Cover,
  // as soon as the picture comes; each real spine joins them as soon as it's cut. A pick stays picked
  const realPicked = () => /^real:/.test(cur.choice || '') ? cur.real[+cur.choice.slice(5)] : null;
  const repaint = list => {
    const was = realPicked(); cur.real = list;
    if (was){ const at = list.indexOf(was); cur.choice = at >= 0 ? 'real:' + at : cur.img ? 'spine' : null; }
    showTiles(cur);
  };
  const posterIn = poster.then(img => {
    if (cur !== current) return;
    if (img && canvasSafe(img)){ cur.img = img; if (m.kind === 'movie') cur.title = posterTitle(img); if (!cur.choice) cur.choice = 'spine'; if (cur.busy) showTiles(cur); }
    else if (m.cover) toast('The ' + noun + ' from ' + hostOf(m.cover) + ' can’t be used in a story. Try another match.');
  });
  if (!server && WORKER){
    sstatus('Searching ' + (m.kind === 'movie' ? 'DVD' : 'book') + ' scans of “' + esc(m.title) + '”…');
    try { found = await cutScans(cur, english, repaint); } catch (err){ failed = /429/.test(err.message) ? 'busy' : true; }
  }
  await posterIn;
  if (cur !== current) return;
  repaint(found.cuts);
  const best = cur.real[0];
  if (server){
    // the Spinestack backend (backend/): unchanged, it cuts the spines itself
    if (cur.img) cur.choice = 'spine';
    showTiles(cur); sstatus('Searching scans of “' + esc(m.title) + '”. Takes 10 to 20 seconds.');
    try { cur.res = await fetch(`${API}/api/spines?title=${encodeURIComponent(m.title)}&kind=${m.kind}&year=${encodeURIComponent(m.year||'')}&creator=${encodeURIComponent(m.creator||'')}`).then(r => r.json()); }
    catch { if (cur === current) sstatus('The search server didn’t answer. Try again in a moment.', true); }
    if (cur !== current) return;
    cur.real = (await Promise.all(cur.res.spines.map(s => Promise.all([loadImg(API + s.spine), loadImg(API + s.front)]).then(([spine, front]) => ({spine, front, score:s.score, source:s.source})).catch(() => null)))).filter(Boolean);
    if (cur !== current) return;
    cur.busy = false; showTiles(cur);
    const n = cur.real.length;
    sstatus(n ? `${n} real spine${n > 1 ? 's' : ''} found. Pick one to use it instead.` : 'No clean spine in the scans found online.' + (cur.img ? ' Using one made from the ' + noun + '.' : ''), !n);
    return;
  }
  cur.busy = false;
  // picked for you only when it's clearly right: a high score, the English edition (unless Edition is Any),
  // and a film (book scans are rarer and less reliable) or a spine from the checked archive
  const n = found.cuts.length, spines = n + ' possible spine' + (n > 1 ? 's' : '');
  if (best && best.score >= AUTO_SCORE && (!english || isEnglish(best)) && (m.kind === 'movie' || best.archive)){
    if (!cur.touched) cur.choice = 'real:0';   // unless something was picked while the scans loaded sstatus(n > 1 ? `Real spine found. ${n - 1} more here if it’s the wrong edition.` : 'Real spine found.');
  }
  else if (best && english && !found.cuts.some(isEnglish)) sstatus(`${spines} found, but none looks like the English edition. Pick one, or set Edition to Any (in Style, on the builder).`);
  else if (best) sstatus(`${spines} found. Pick the one that looks right.`);
  else if (cur.img){
    if (!cur.touched) cur.choice = 'spine';   // the grey line under the tiles asks for a photo of a real one (books)
    if (found.capped) sstatus('Spine search is resting for today. Here’s one made from the cover.');
    else sstatus(!WORKER ? 'Pick Cover to show the ' + noun + ' face out instead.' : failed === 'busy' ? 'Scan search is busy. This spine is made from the ' + noun + '; try again in a minute.'
      : failed ? 'Scan search didn’t answer, so this spine is made from the ' + noun + '.' : 'No clean spine in the scans found online, so this one is made from the ' + noun + '.', !!WORKER);
  }
  else sstatus('No scans and no ' + noun + ' found for this title. Upload a scan on the builder.', true);
  showTiles(cur);
}
$('#addFound').addEventListener('click', e => {
  const flag = e.target.closest('a[data-report]');
  if (flag){
    e.preventDefault(); e.stopPropagation();
    fetch(`${WORKER}/report?id=${encodeURIComponent(flag.dataset.report)}`, {method:'POST'}).catch(() => {});
    flag.removeAttribute('data-report'); flag.removeAttribute('href'); flag.textContent = 'Reported'; toast('Reported. Thanks.');
    return;
  }
  if (e.target.closest('#addSnap')){ $('#addPhoto').click(); return; }
  const u = e.target.closest('[data-use]'), cur = current; if (!u || !cur) return;
  cur.choice = u.dataset.use; cur.touched = true;
  for (const b of dlg.querySelectorAll('#addFound [data-use]')) b.setAttribute('aria-checked', String(b.dataset.use === cur.choice));
  paintGo();
});
/* a photo of your own copy's spine: cut out of the picture as an upload on the builder is (one spine alone, the strip
   between back and front, or the spine with plain background round it), made at most 900px tall, and picked */
function spineIn(img){
  if (img.width/img.height <= 1/6) return {x:0, y:0, w:img.width, h:img.height};
  return (img.height/img.width < 4 && findSpine(img, 'book')) || findSoloSpine(img);
}
function shrink(c, most){
  if (c.height <= most) return c;
  const k = most/c.height, o = document.createElement('canvas'); o.width = Math.max(1, Math.round(c.width*k)); o.height = most;
  const x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height); return o;
}
$('#addPhoto').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0], cur = current; e.target.value = '';
  if (!f || !cur) return;
  let img; try { img = await loadImg(URL.createObjectURL(f)); } catch { sstatus('That picture couldn’t be read. Try another.', true); return; }
  if (cur !== current) return;
  const c = spineIn(img);
  if (!c){ sstatus('No spine found in that photo. Crop it to the spine and try again.', true); return; }
  const spine = shrink(crop(img, c.x, c.y, c.w, c.h), 900);
  cur.real.unshift({spine, front:null, photo:true, source:'', score:100, en:true, vhs:false, img:spine.toDataURL('image/jpeg', .85)});
  cur.choice = 'real:0'; cur.touched = true; sstatus('');
  showTiles(cur);
});
$('#addDupAdd').addEventListener('click', () => { if (current) findSpines(current.m, true); });
$('#addDupCancel').addEventListener('click', () => { $('#addDup').hidden = true; $('#addSpines').hidden = true; $('#addMatches').hidden = !matches.length; current = null; paintActive(); $('#addQ').focus(); });
// Change: back to the results, with the box ready for the arrow keys
$('#addChange').addEventListener('click', () => { current = null; picked = null; $('#addSpines').hidden = true; $('#addMatches').hidden = !matches.length; sstatus(''); paintActive(); $('#addQ').focus(); });
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return 'source'; } };

/* ---------- Add to shelf ---------- */
/* On the builder the spine goes straight on its shelf. From any other page the choice waits in this tab
   (sessionStorage) and the builder, opening, puts it on: the title, which choice, and for a real spine the scan
   it was cut from (the builder loads that scan again and cuts it the same way). */
const PENDING = 'shelfstackd-add';
$('#addGo').addEventListener('click', () => {
  const cur = current; if (!cur || !cur.choice) return;   // while scans load too
  if (shelf){ if (shelf.add(bookFields(cur, cur.choice)) !== false) close(); return; }
  const r = cur.choice.startsWith('real:') ? cur.real[+cur.choice.slice(5)] : null;
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({at: Date.now(), m: cur.m, choice: r ? 'real' : cur.choice,
      real: r ? {img: r.img, source: r.source, archive: r.archive, id: r.id, en: r.en, vhs: r.vhs, photo: r.photo} : undefined}));
  } catch { sstatus('This browser won’t let the spine be carried over. Open the builder and add it there.', true); return; }
  $('#addGo').disabled = true; sstatus('Opening your shelf…');
  location.href = ROOT + 'build/';
});
// the builder, opening: the choice that's waiting, if there is one (it waits ten minutes at most)
function takePending(){
  try { const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null'); sessionStorage.removeItem(PENDING); return p && p.m && Date.now() - p.at < 600e3 ? p : null; } catch { return null; }
}
// ...and that choice as the fields of a book again (null when its pictures can't be loaded any more)
async function resolve(p){
  const m = p.m, key = keyOf(m), cur = {m, key: shelf && shelf.has(key) ? key + '#' + (1 + shelf.count(key)) : key, real: [], img: null};
  const poster = m.cover ? timeout(loadImg(viaWorker(m.cover)), 15000).catch(() => null) : Promise.resolve(null);
  if (p.choice === 'real' && p.real){
    // a photo of your own copy travels as its picture; a scan is cut again from where it was found
    const c = p.real.photo ? await loadImg(p.real.img).then(spine => ({spine, front:null, photo:true, source:'', score:100}), () => null) : await cutOne(p.real, m.kind);
    if (c) cur.real = [c];
  }
  const img = await poster;
  if (img && canvasSafe(img)){ cur.img = img; if (m.kind === 'movie') cur.title = posterTitle(img); }
  const choice = p.choice === 'real' ? (cur.real.length ? 'real:0' : 'spine') : p.choice;
  if (choice !== 'real:0' && !cur.img) return null;
  return bookFields(cur, choice);
}

/* ---------- Put on shelf, Log it, Watchlist ---------- */
/* The watchlist holds this many titles. The database holds the same number (watchlist_before_insert() in
   supabase/migrations/0007_logs_watchlist.sql): change both together. Pages read it as Add.WATCH_CAP. */
const WATCH_CAP = 6, FULL = `Your watchlist is full (${WATCH_CAP}). Remove one to add another.`;
const TITLES = {shelf: 'Add to your shelf', log: 'Log a film or book', watch: 'Add to your watchlist'};   // no ellipsis: on a title it reads as cut off

const what = () => ($('input[name=addWhat]:checked') || {}).value || 'shelf';
// who is signed in, as the page's bar knows it (nav.js)
const account = () => (window.Nav && Nav.account ? Nav.account() : {}) || {};
// Log it and Watchlist need an account with a username: until there is one, the dialog says so instead of searching
function paintNeed(){
  const a = account(), m = what(), need = m !== 'shelf' && !(a.sb && a.user && a.profile);
  $('#addNeed').hidden = !need; $('#addFind').hidden = need;
  if (need){
    $('#addNeedText').textContent = a.user ? 'Pick a username first.' : m === 'log' ? 'Sign in to log films and books.' : 'Sign in to keep a watchlist.';
    $('#addNeedGo').textContent = a.user ? 'Pick one' : 'Sign in';
  }
  return need;
}
$('#addNeedGo').addEventListener('click', () => { close(); if (window.Nav && Nav.signIn) Nav.signIn(); });
// another choice: the title already picked goes to that choice's step 2
function paintWhat(switched){
  $('#addTitle').textContent = TITLES[what()];
  if (paintNeed() || !switched) return;
  if (!picked){ $('#addQ').focus(); return; }
  if (what() === 'shelf'){ $('#addPost').hidden = true; findSpines(picked); } else showPost(picked);
}
dlg.querySelectorAll('input[name=addWhat]').forEach(r => r.addEventListener('change', () => paintWhat(true)));
// the cover as the feed will show it, worn (wear.js, loaded the first time it's needed)
let wearing = null, covRun = 0;
function withWear(fn){
  if (window.Wear){ fn(); return; }
  wearing = wearing || new Promise(res => { const sc = document.createElement('script'); sc.src = ROOT + 'wear.js?v=20261004a'; sc.onload = sc.onerror = res; document.head.appendChild(sc); });
  wearing.then(() => { if (window.Wear) fn(); });
}
const verb = m => m.kind === 'movie' ? 'watched' : 'read';
function showPost(m){
  current = null; $('#addSpines').hidden = true; $('#addMatches').hidden = true; paintActive(); sstatus('');
  const log = what() === 'log', a = account(), cov = $('#addCov'), src = m.cover ? viaWorker(m.cover) : '', run = ++covRun;
  $('#addPostTitle').textContent = m.title + (m.year ? ' (' + m.year + ')' : ''); $('#addPostBy').textContent = m.creator ? '· ' + m.creator : '';
  $('#addSayWrap').hidden = !log;
  $('#addPostGo').textContent = log ? 'Post' : 'Add to watchlist'; $('#addPostGo').disabled = false;
  $('#addFeedLine').textContent = log ? `On the feed: ${a.profile ? '@' + a.profile.username : 'you'} ${verb(m)} ${m.title} · today` : `It shows on your profile, under Watchlist, which holds ${WATCH_CAP}.`;
  if (log){ cov.replaceChildren(); withWear(() => { if (run === covRun) cov.replaceChildren(Wear.cover({src, seed: keyOf(m), at: new Date().toISOString(), label: `The cover of ${m.title}, as the feed shows it`, width: 120})); }); }
  else cov.innerHTML = src ? `<img src="${esc(src)}" alt="The cover of ${esc(m.title)}" crossorigin="anonymous">` : '<span class="blank"></span>';
  $('#addPost').hidden = false;
}
$('#addPostChange').addEventListener('click', () => { picked = null; $('#addPost').hidden = true; $('#addMatches').hidden = !matches.length; sstatus(''); paintActive(); $('#addQ').focus(); });
// a log or a watchlist row, as the database keeps a title (the same rules as a shelf's spine; the cover only from TMDB
// or Open Library)
const COVER_OK = /^https:\/\/(image\.tmdb\.org|covers\.openlibrary\.org)\/\S+$/;
const rowOf = m => ({kind: m.kind === 'movie' ? 'movie' : 'book', title: String(m.title || '').trim().slice(0, 200), author: String(m.creator || '').slice(0, 200),
  year: /^\d{4}$/.test(String(m.year || '')) ? +m.year : null, cover_src: m.cover && COVER_OK.test(m.cover) && m.cover.length <= 396 ? 'url:' + m.cover : null});
function saveError(e, status, log){
  const c = (e && e.code) || '';
  if (c === '23505') return 'It’s already on your watchlist.';
  if (c === 'P0001' && !log && /watchlist holds/i.test(e.message || '')) return FULL;
  if (c === 'P0001' && e.message) return e.message;
  if (status === 404 || /^(PGRST20[25]|42P01|42883)$/.test(c)) return log ? 'Logging isn’t open yet. Try again soon.' : 'The watchlist isn’t open yet. Try again soon.';
  if (/fetch|network/i.test((e && e.message) || '')) return 'Couldn’t reach shelfstackd. Check your connection and try again.';
  return 'That didn’t save. Try again in a moment.';
}
// the page's own toast line, when the dialog has shut
function pageToast(msg){
  if (say){ say(msg); return; }
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.hidden = false; clearTimeout(pageToast.t); pageToast.t = setTimeout(() => { t.hidden = true; }, 4200);
}
$('#addPostGo').addEventListener('click', async () => {
  const m = picked, a = account(), log = what() === 'log', btn = $('#addPostGo');
  if (!m || paintNeed()) return;
  btn.disabled = true; sstatus(log ? 'Posting…' : 'Adding…');
  let r;
  if (!log){
    const w = await watch(m);
    if (!w.ok || w.already){ btn.disabled = false; sstatus(esc(w.error), true); return; }
    close(); return;
  }
  try { r = await a.sb.from('logs').insert({...rowOf(m), caption: $('#addSay').value.trim().slice(0, 280)}); }
  catch (err){ r = {error: err}; }
  if (r.error){ btn.disabled = false; sstatus(esc(saveError(r.error, r.status, log)), true); return; }
  close();
  pageToast(`Logged ${m.title}. It’s on the feed.`);
  document.dispatchEvent(new CustomEvent('shelfstackd:added', {detail: {what: 'log', item: m}}));
});

/* ---------- opening and closing ---------- */
function reset(){
  clearTimeout(typing); run++; if (asking){ asking.abort(); asking = null; }
  current = null; matches = []; active = -1; shownFor = null; picked = null; covRun++;
  $('#addQ').value = ''; $('#addMatches').hidden = true; $('#addSpines').hidden = true; $('#addPost').hidden = true; $('#addRows').innerHTML = ''; $('#addFound').innerHTML = ''; $('#addSay').value = ''; sstatus(''); paintActive();
  $('#addMode').hidden = server || !!WORKER;
  if (!server && !WORKER && direct) $('#addMode').textContent = TMDB ? 'Search works here. Real DVD and book spines need the shelfstackd server.' : 'Book search works here. Films need a TMDB key, and real spines need the shelfstackd server.';
}
// open({query, mode, item, typed}): with a query it searches at once (typed: it's what was being typed somewhere else,
// so it suggests as typing here does, and the caret goes on from it); mode is 'shelf' (the default), 'log' or 'watch';
// an item ({kind, title, year, creator, cover}) goes straight to its step 2
function open(opt){
  opt = opt || {};
  if (!dlg.open){ reset(); if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); }
  const mode = TITLES[opt.mode] ? opt.mode : 'shelf';
  for (const r of dlg.querySelectorAll('input[name=addWhat]')) r.checked = r.value === mode;
  paintWhat(false);
  if (!$('#addFind').hidden && opt.item && opt.item.title){
    picked = opt.item;
    if (mode === 'shelf') findSpines(picked); else { showPost(picked); ($('#addSayWrap').hidden ? $('#addPostGo') : $('#addSay')).focus(); return; }
  }
  const q = opt.query ? String(opt.query).trim() : '';
  if (q){ $('#addQ').value = q; if (opt.typed) $('#addQ').dispatchEvent(new Event('input')); else search(false); }
  if (!$('#addFind').hidden){ const box = $('#addQ'); box.focus(); if (opt.typed) box.setSelectionRange(box.value.length, box.value.length); }
  else $('#addNeedGo').focus();
}
function close(){ if (dlg.open){ if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); } }
dlg.addEventListener('close', () => { current = null; clearTimeout(typing); run++; if (asking){ asking.abort(); asking = null; } });   // whatever was being looked for stops
$('#addClose').addEventListener('click', close);
dlg.addEventListener('click', e => {   // a click on the dimmed page behind it
  const r = dlg.getBoundingClientRect();
  if (e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) close();
});
function setServer(on, recent){
  server = !!on;
  const el = $('#addRecent'), items = recent || [];
  el.hidden = !items.length; el.querySelector('span').textContent = items.slice(0, 8).join(', ');
}

/* ---------- the watchlist, from anywhere: Add.watch(item, {from}) puts a title ({kind, title, year, creator, cover}) on
   the watchlist of whoever is signed in (from: the id of the person whose log it was kept from), says so in the page's
   toast and on document ("shelfstackd:added"), and gives {ok, already, full, error}. Nothing is searched for. ---------- */
async function watch(m, opt = {}){
  const a = account();
  if (!(a.sb && a.user && a.profile)) return {ok: false, error: a.user ? 'Pick a username first.' : 'Sign in to keep a watchlist.'};
  let r;
  try { r = await a.sb.from('watchlist').insert({...rowOf(m), ...(opt.from ? {from_user: opt.from} : {})}); }
  catch (err){ r = {error: err}; }
  if (r.error){
    const error = saveError(r.error, r.status, false), already = r.error.code === '23505', full = error === FULL;
    return {ok: already, already, full, error};   // already: it's on it, so ok; the caller says so
  }
  pageToast(`${m.title} is on your watchlist.`);
  document.dispatchEvent(new CustomEvent('shelfstackd:added', {detail: {what: 'watch', item: m}}));
  return {ok: true};
}

/* ---------- the same title search, in a page: Add.attachSearch({input, list, onPick}) makes a text box suggest as it's
   typed, as the dialog's does (one search 250 ms after the last key, a newer one cancelling the one before, six at
   most, closest first, ↑ ↓ Enter Esc), in its own list under it. onPick(item) is called with the one picked. Gives
   {clear()}. The list is a <ul role="listbox">; its rows are .t (title, with .y the year), .k (Film or Book), .by. ---------- */
function attachSearch({input, list, onPick, say: tell = () => {}}){
  let t = 0, ctl = null, run = 0, shown = [], on = -1;
  const id = list.id || (list.id = 'sugg' + Math.random().toString(36).slice(2, 7));
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', id); input.setAttribute('aria-expanded', 'false');
  list.setAttribute('role', 'listbox');
  const paint = () => {
    list.innerHTML = shown.map((m, i) => `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${i === on}"><span class="t">${esc(m.title)}${m.year ? ` <span class="y">${esc(m.year)}</span>` : ''}</span> <span class="k">${m.kind === 'movie' ? 'Film' : 'Book'}</span>${m.creator ? ` <span class="by">${esc(m.creator)}</span>` : ''}</li>`).join('');
    list.hidden = !shown.length; input.setAttribute('aria-expanded', String(!!shown.length));
    if (on >= 0) input.setAttribute('aria-activedescendant', `${id}-${on}`); else input.removeAttribute('aria-activedescendant');
  };
  const clear = () => { clearTimeout(t); run++; if (ctl){ ctl.abort(); ctl = null; } shown = []; on = -1; paint(); tell(''); };
  async function go(typed){
    clearTimeout(t);
    const q = input.value.trim(), key = 'all|' + q.toLowerCase(), mine = ++run;
    if (ctl){ ctl.abort(); ctl = null; }
    if (!q){ clear(); return; }
    let results = seen.get(key);
    if (!results){
      tell('Searching…');
      const c = ctl = new AbortController();
      try { results = await lookUp(q, 'all', typed, c.signal); }
      catch (err){ if (mine !== run || (err && err.name === 'AbortError')) return; shown = []; paint(); tell('The search didn’t answer. Try again in a moment.'); return; }
      finally { if (ctl === c) ctl = null; }
      if (mine !== run) return;
      seen.set(key, results = results || []);
    }
    shown = rank(results, q); on = shown.length ? 0 : -1; paint();
    tell(shown.length ? '' : `Nothing found for "${q}". Try the original title or the author.`);
  }
  const pick = i => { const m = shown[i]; if (!m) return; clear(); input.value = ''; onPick(m); };
  input.addEventListener('input', () => {
    clearTimeout(t);
    if (input.value.trim().length < 2){ run++; if (ctl){ ctl.abort(); ctl = null; } shown = []; on = -1; paint(); tell(''); return; }
    t = setTimeout(() => go(true), WAIT);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); if (shown.length && on >= 0) pick(on); else go(false); return; }
    if (e.key === 'Escape'){ if (shown.length){ e.preventDefault(); clear(); } return; }
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !shown.length) return;
    e.preventDefault(); on = (on + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; paint();
  });
  list.addEventListener('mousedown', e => e.preventDefault());   // the box keeps the focus
  list.addEventListener('click', e => { const li = e.target.closest('[role=option]'); if (li) pick(+li.dataset.i); });
  return {clear};
}

window.Add = {open, close, watch, attachSearch, WATCH_CAP, isOpen: () => dlg.open, setShelf: s => { shelf = s; }, setToast: fn => { say = fn; }, setServer, takePending, resolve,
  extractPalette, findSpine, findSoloSpine, lettering, cutOne, personName, rank, EDITION};
})();
