/* + ADD: the Add dialog, the same on every page. At the top, what to do with the title: Put on shelf (the default),
   Log it, or Watchlist. Under that, a search box (All / Films / Books under it) that suggests titles as you type: up
   to six, films and books together, the closest titles first; ↑ ↓ move through them and Enter picks.
   Put on shelf: picking a result goes to step 2, which finds that title's spines (the Worker finds DVD and book scans,
   the browser cuts the spine out of each) and shows the choices with an Add to shelf button. On the builder that puts
   the spine on your shelf there. Anywhere else the choice is handed to the builder (sessionStorage), which opens your
   shelf with it on.
   Log it: the cover as the feed will show it (worn, wear.js), a caption if you want one, and Post, which saves a log
   (the logs table, docs/proposed-0007-logs-watchlist.sql). Watchlist: the cover and Add to watchlist. Both need you
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
#addDialog .addopts{display:flex;flex-wrap:wrap;gap:var(--s2,8px) var(--s4,16px);margin-top:var(--s3,12px);align-items:center}
#addDialog .addopts label{cursor:pointer;display:flex;gap:var(--s1,4px);align-items:center}
#addDialog .addopts input{accent-color:var(--ink,#000);margin:0}
#addDialog .addstatus{min-height:20px;margin-top:var(--s3,12px)}
#addDialog .addstatus.err{font-weight:500}
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
#addDialog .addbar{display:flex;justify-content:flex-end;margin-top:var(--s4,16px)}
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
  :is(#addDialog .addx,#addDialog .addsearch button,#addDialog .addopts label,#addDialog .addwhat label,#addDialog .pick .art)::before{content:"";position:absolute;top:min(0px,calc(50% - 22px));right:min(0px,calc(50% - 22px));bottom:min(0px,calc(50% - 22px));left:min(0px,calc(50% - 22px))}
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
  <h2 id="addTitle">Add to your shelf…</h2>
  <div class="addwhat" role="radiogroup" aria-label="What to do with it">
    <label><input type="radio" name="addWhat" value="shelf" checked><span>Put on shelf</span></label>
    <label><input type="radio" name="addWhat" value="log"><span>Log it</span></label>
    <label><input type="radio" name="addWhat" value="watch"><span>Watchlist</span></label>
  </div>
  <p class="addneed" id="addNeed" hidden><span id="addNeedText"></span> <button class="dash sm" id="addNeedGo" type="button"></button></p>
  <div id="addFind">
  <form class="addsearch" id="addForm" autocomplete="off">
    <input type="text" id="addQ" placeholder="Gummo, The Waves, Kids..." aria-label="Film or book name" maxlength="120" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="addRows">
    <button type="submit" aria-label="Search">${ICON('<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>')}</button>
  </form>
  <div class="addopts" role="radiogroup" aria-label="Search in">
    <label><input type="radio" name="addKind" value="all" checked>All</label>
    <label><input type="radio" name="addKind" value="movie">Films</label>
    <label><input type="radio" name="addKind" value="book">Books</label>
  </div>
  <p class="grey" id="addMode" hidden>Search needs the shelfstackd server, so it's off in this preview. Uploading a scan on the builder still works.</p>
  <p class="grey" id="addRecent" hidden>Recently found: <span></span></p>
  <div class="addstatus" id="addStatus" role="status"></div>
  <div id="addMatches" hidden>
    <ul class="addlist" id="addRows" role="listbox" aria-label="Films and books"></ul>
  </div>
  <div id="addSpines" hidden>
    <h3><span id="addSpinesTitle">Spines</span> <small id="addSpinesBy"></small> <button class="dash sm" id="addChange" type="button">Change</button></h3>
    <p id="addDup" hidden><span id="addDupText"></span> <button class="dash sm" id="addDupAdd" type="button">Add again</button> <button class="dash sm" id="addDupCancel" type="button">Cancel</button></p>
    <div class="addfound" id="addFound" role="radiogroup" aria-label="Which spine"></div>
    <p class="grey" id="addNoReal" hidden>No real spine found yet. Upload a photo of yours on the builder to add it to the archive.</p>
    <p class="grey" id="addNote" hidden>Real DVD and book spines show up once the shelfstackd server is connected. Until then, upload a full DVD scan on the builder.</p>
    <div class="addbar"><button class="btn primary" id="addGo" type="button" disabled>Add to shelf</button></div>
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
  return Promise.all((r.results || []).slice(0,5).map(async (m,i) => {
    let creator = '';
    if (i < 3) try { const c = await getJSON(`https://api.themoviedb.org/3/movie/${m.id}/credits?` + key.slice(1), opt); creator = ((c.crew || []).find(p => p.job === 'Director') || {}).name || ''; } catch {}
    return {kind:'movie', title:m.title || '', year:(m.release_date || '').slice(0,4), creator, cover:m.poster_path ? 'https://image.tmdb.org/t/p/w500' + m.poster_path : ''};
  }));
}
async function olBooks(q){
  const r = await getJSON('https://openlibrary.org/search.json?limit=5&fields=title,author_name,first_publish_year,cover_i&q=' + encodeURIComponent(q));
  return (r.docs || []).map(d => ({kind:'book', title:d.title || '', year:String(d.first_publish_year || ''), creator:(d.author_name || [''])[0], cover:d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : ''}));
}
async function identifyDirect(q, want){
  const films = want !== 'book' && TMDB, books = want !== 'movie';
  const [f, b] = await Promise.allSettled([films ? tmdbFilms(q) : [], books ? olBooks(q) : []]);
  if ((!films || f.status === 'rejected') && (!books || b.status === 'rejected')) throw new Error('no answer');
  return [...(f.value || []), ...(b.value || [])];
}
/* Suggestions while you type: a search starts 300 ms after the last key (Enter starts it at once), and a newer one
   cancels the one before, whose answer is dropped if it still comes. Up to six results, films and books together,
   by how well the title matches what was typed: the same, then starting with it, then containing it. */
const SHOWN = 6, WAIT = 300;
let matches = [], active = -1;   // active: the highlighted result
let shownFor = null;             // "<kind>|<text>" the results on screen answer
let typing = 0, run = 0, asking = null;
const seen = new Map();          // answers already had in this dialog, so going back over a word asks nothing
const wanted = () => ($('input[name=addKind]:checked') || {}).value || 'all';
const plain = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
// 0: the title is what was typed, 1: it starts with it, 2: it has it, 3: neither (a near miss the search still found)
function closeness(title, q){
  const t = plain(title), want = plain(q.replace(/[\s,(]+(?:19|20)\d\d\)?$/, ''));   // "kids 1995": the year isn't part of the title
  if (!want) return 3;
  return t === want ? 0 : t.startsWith(want + ' ') || t.startsWith(want) ? 1 : (' ' + t + ' ').includes(' ' + want + ' ') || t.includes(want) ? 2 : 3;
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
    return Object.assign(base, {img:front, spineImg:r.spine, archiveId:r.archive ? r.id : undefined, source:r.archive ? 'the archive' : hostOf(r.source), bg:pal.bg, fg:pal.fg, accent:pal.accent, style:'real'}, front.src ? {thumb:front.src} : {});
  }
  const img = cur.img, pal = extractPalette(img), t = film ? cur.title : null;
  const bg = t ? t.bg : film ? '#111111' : pal.bg, fg = t ? (contrast('#F4F4F2', bg) >= contrast('#111111', bg) ? '#F4F4F2' : '#111111') : film ? '#F4F4F2' : pal.fg;
  return Object.assign(base, {img, thumb:img.src, bg, fg, accent:pal.accent, titleImg:t && t.img, style:choice === 'cover' ? 'cover' : film ? 'dvd' : 'art'});
}
const tileCanvas = (b, w, H0) => { const dpr = Math.min(2, window.devicePixelRatio || 1), sp = makeSpine(b, w*dpr, H0*dpr); sp.style.width = sp.width/dpr + 'px'; sp.setAttribute('aria-hidden', 'true'); return sp; };
function paintGo(){ const cur = current; $('#addGo').disabled = !cur || cur.busy || !cur.choice; }
function showTiles(cur){
  const m = cur.m, noun = m.kind === 'movie' ? 'poster' : 'cover';
  // every option in one row at one height: the spine (press it to pick it), then one line saying where it's from
  const tile = (c, art, label, what) => `<div class="pick" data-c="${c}"><button type="button" class="art" role="radio" aria-checked="${cur.choice === c}" data-use="${c}" aria-label="${what}">${art}</button><span class="lbl">${label}</span></div>`;
  const tiles = cur.real.map((r,i) => tile('real:' + i, '', r.archive
    ? `From the archive · <a href="#" data-report="${esc(r.id)}">Report</a>`
    : `<a class="src" href="${esc(r.source)}" target="_blank" rel="noopener">${esc(hostOf(r.source))}</a>`, 'A real spine from ' + esc(r.archive ? 'the archive' : hostOf(r.source))));
  if (cur.img){
    tiles.push(tile('spine', '', 'Generated', 'A spine made from the ' + noun));
    tiles.push('<span class="rule" aria-hidden="true"></span>');
    tiles.push(tile('cover', `<img class="cov" src="${esc(cur.img.src)}" crossorigin="anonymous" alt="">`, 'Cover', 'The ' + noun + ', face out'));
  }
  $('#addFound').innerHTML = tiles.join('') || (cur.busy ? '' : '<p class="grey">No scans and no ' + noun + ' found for this title. Upload a scan on the builder.</p>');
  $('#addNoReal').hidden = cur.busy || !WORKER || server || cur.real.length > 0 || m.kind !== 'book';
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
    if (img.height/img.width >= 4){ const c = findSoloSpine(img); return c && Object.assign(base, {spine:crop(img, c.x, c.y, c.w, c.h), score:c.score, solo:true}); }
    const cut = findSpine(img, kind); if (!cut) return null;
    return Object.assign(base, {spine:crop(img, cut.x, cut.y, cut.w, cut.h), front:crop(img, cut.frontX, cut.y, img.width - cut.frontX, cut.h), score:cut.score});
  } catch { return null; }
}
/* Asks the Worker for scans one round (one search) at a time and stops once two good spines turn up,
   so most titles cost one or two searches. Returns the cuts, best first. */
const ROUNDS = 4;
async function cutScans(cur, english){
  const q = `${WORKER}/scans?kind=${cur.m.kind}&title=${encodeURIComponent(cur.m.title)}&year=${encodeURIComponent(cur.m.year || '')}&creator=${encodeURIComponent(cur.m.creator || '')}`;
  const seen = new Set(), cuts = []; let scans = 0, rounds = 0, busy = false, capped = false;
  for (let round = 0; round < ROUNDS && cur === current; round++){
    if (round) sstatus(`Looking for more scans (${round + 1} of ${ROUNDS})…`);
    let r;
    try { r = await timeout(getJSON(q + '&round=' + round), 20000); rounds++; }
    catch (err){ if (!cuts.length && !rounds) throw err; busy = /429/.test(err.message); break; }   // keep what the earlier rounds found
    const fresh = (r.results || []).filter(s => !seen.has(s.img) && seen.add(s.img));
    scans += fresh.length;
    // capped: today's Brave searches are used up, so this round held only archive spines and scans kept from before.
    // With nothing in it there's no more to ask for.
    if (r.capped){ capped = true; if (!fresh.length) break; }
    if (fresh.length && cur === current) sstatus(`Cutting spines from ${scans} scan${scans > 1 ? 's' : ''}…`);
    cuts.push(...(await Promise.all(fresh.map(s => cutOne(s, cur.m.kind)))).filter(Boolean));
    if (cuts.filter(c => c.score >= AUTO_SCORE && (!english || isEnglish(c))).length >= 2 || !r.more) break;
  }
  // one option per page: the same scan often comes at several sizes (reddit previews, eBay listings)
  const best = new Map();
  const show = cur.m.kind === 'book' ? 20 : SHOW_SCORE;   // a book cut has already passed the strict flat-scan checks in findSpine
  for (const c of cuts.filter(c => c.score >= show && c.spine.width <= c.spine.height/5).sort((a,b) => rankCut(b, english) - rankCut(a, english)))
    if (!best.has(c.source)) best.set(c.source, c);
  return {scans, rounds, busy, capped, cuts:[...best.values()].slice(0, 8)};
}
async function findSpines(m, again){
  const key = keyOf(m), cur = current = {m, key, real:[], res:{spines:[]}, img:null, busy:true, choice:null}, noun = m.kind === 'movie' ? 'poster' : 'cover';
  $('#addSpines').hidden = false; $('#addMatches').hidden = true; paintActive();
  $('#addSpinesTitle').textContent = m.title + (m.year ? ' (' + m.year + ')' : ''); $('#addSpinesBy').textContent = m.creator ? '· ' + m.creator : '';
  $('#addNote').hidden = server || !!WORKER; $('#addFound').innerHTML = ''; $('#addNoReal').hidden = true; $('#addDup').hidden = true; paintGo();
  if (!again && shelf && shelf.has(key)){
    // already on the shelf: ask before adding it a second time
    $('#addDupText').textContent = m.title + ' is already on your shelf.'; $('#addDup').hidden = false; cur.busy = false; sstatus('');
    return;
  }
  if (again && shelf) cur.key = key + '#' + (1 + shelf.count(key));
  const poster = m.cover ? timeout(loadImg(server ? API + '/api/image?url=' + encodeURIComponent(m.cover) : viaWorker(m.cover)), 15000).catch(() => null) : Promise.resolve(null);
  let found = {scans:0, cuts:[]}, failed = false;
  const english = englishOnly();
  if (!server && WORKER){
    sstatus('Searching ' + (m.kind === 'movie' ? 'DVD' : 'book') + ' scans of “' + esc(m.title) + '”…');
    try { found = await cutScans(cur, english); } catch (err){ failed = /429/.test(err.message) ? 'busy' : true; }
  }
  const img = await poster;
  if (cur !== current) return;
  if (img && canvasSafe(img)){ cur.img = img; if (m.kind === 'movie') cur.title = posterTitle(img); }
  else if (m.cover) toast('The ' + noun + ' from ' + hostOf(m.cover) + ' can’t be used in a story. Try another match.');
  cur.real = found.cuts;
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
    cur.choice = 'real:0'; sstatus(n > 1 ? `Real spine found. ${n - 1} more here if it’s the wrong edition.` : 'Real spine found.');
  }
  else if (best && english && !found.cuts.some(isEnglish)) sstatus(`${spines} found, but none looks like the English edition. Pick one, or set Edition to Any (in Style, on the builder).`);
  else if (best) sstatus(`${spines} found. Pick the one that looks right.`);
  else if (cur.img){
    cur.choice = 'spine';   // the grey line under the tiles asks for a photo of a real one (books)
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
  const u = e.target.closest('[data-use]'), cur = current; if (!u || !cur) return;
  cur.choice = u.dataset.use;
  for (const b of dlg.querySelectorAll('#addFound [data-use]')) b.setAttribute('aria-checked', String(b.dataset.use === cur.choice));
  paintGo();
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
  const cur = current; if (!cur || cur.busy || !cur.choice) return;
  if (shelf){ if (shelf.add(bookFields(cur, cur.choice)) !== false) close(); return; }
  const r = cur.choice.startsWith('real:') ? cur.real[+cur.choice.slice(5)] : null;
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({at: Date.now(), m: cur.m, choice: r ? 'real' : cur.choice,
      real: r ? {img: r.img, source: r.source, archive: r.archive, id: r.id, en: r.en, vhs: r.vhs} : undefined}));
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
  if (p.choice === 'real' && p.real){ const c = await cutOne(p.real, m.kind); if (c) cur.real = [c]; }
  const img = await poster;
  if (img && canvasSafe(img)){ cur.img = img; if (m.kind === 'movie') cur.title = posterTitle(img); }
  const choice = p.choice === 'real' ? (cur.real.length ? 'real:0' : 'spine') : p.choice;
  if (choice !== 'real:0' && !cur.img) return null;
  return bookFields(cur, choice);
}

/* ---------- Put on shelf, Log it, Watchlist ---------- */
const TITLES = {shelf: 'Add to your shelf…', log: 'Log a film or a book…', watch: 'Add to your watchlist…'};
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
  wearing = wearing || new Promise(res => { const sc = document.createElement('script'); sc.src = ROOT + 'wear.js?v=20261002a'; sc.onload = sc.onerror = res; document.head.appendChild(sc); });
  wearing.then(() => { if (window.Wear) fn(); });
}
const verb = m => m.kind === 'movie' ? 'watched' : 'read';
function showPost(m){
  current = null; $('#addSpines').hidden = true; $('#addMatches').hidden = true; paintActive(); sstatus('');
  const log = what() === 'log', a = account(), cov = $('#addCov'), src = m.cover ? viaWorker(m.cover) : '', run = ++covRun;
  $('#addPostTitle').textContent = m.title + (m.year ? ' (' + m.year + ')' : ''); $('#addPostBy').textContent = m.creator ? '· ' + m.creator : '';
  $('#addSayWrap').hidden = !log;
  $('#addPostGo').textContent = log ? 'Post' : 'Add to watchlist'; $('#addPostGo').disabled = false;
  $('#addFeedLine').textContent = log ? `On the feed: ${a.profile ? '@' + a.profile.username : 'you'} ${verb(m)} ${m.title} · today` : 'It shows on your profile, under Watchlist, which holds 6.';
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
  try { r = log ? await a.sb.from('logs').insert({...rowOf(m), caption: $('#addSay').value.trim().slice(0, 280)}) : await a.sb.from('watchlist').insert(rowOf(m)); }
  catch (err){ r = {error: err}; }
  if (r.error){ btn.disabled = false; sstatus(esc(saveError(r.error, r.status, log)), true); return; }
  close();
  pageToast(log ? `Logged ${m.title}. It’s on the feed.` : `${m.title} is on your watchlist.`);
  document.dispatchEvent(new CustomEvent('shelfstackd:added', {detail: {what: log ? 'log' : 'watch', item: m}}));
});

/* ---------- opening and closing ---------- */
function reset(){
  clearTimeout(typing); run++; if (asking){ asking.abort(); asking = null; }
  current = null; matches = []; active = -1; shownFor = null; picked = null; covRun++;
  $('#addQ').value = ''; $('#addMatches').hidden = true; $('#addSpines').hidden = true; $('#addPost').hidden = true; $('#addRows').innerHTML = ''; $('#addFound').innerHTML = ''; $('#addSay').value = ''; sstatus(''); paintActive();
  $('#addMode').hidden = server || !!WORKER;
  if (!server && !WORKER && direct) $('#addMode').textContent = TMDB ? 'Search works here. Real DVD and book spines need the shelfstackd server.' : 'Book search works here. Films need a TMDB key, and real spines need the shelfstackd server.';
}
// open({query, mode, item}): with a query it searches at once; mode is 'shelf' (the default), 'log' or 'watch'; an
// item ({kind, title, year, creator, cover}) goes straight to its step 2
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
  if (q){ $('#addQ').value = q; search(false); }
  if (!$('#addFind').hidden) $('#addQ').focus(); else $('#addNeedGo').focus();
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

window.Add = {open, close, isOpen: () => dlg.open, setShelf: s => { shelf = s; }, setToast: fn => { say = fn; }, setServer, takePending, resolve,
  extractPalette, findSpine, findSoloSpine, EDITION};
})();
