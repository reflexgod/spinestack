/* Spinestack: draws the spines and the story. The builder (index.html) and the profile page (u/) both use it, so a
   shelf looks the same everywhere. Moved here from index.html unchanged, except that renderStory() and sizes() take the
   shelf and its settings as arguments, and textures load from next to this file and call back when they arrive. */
(() => {
const HERE = new URL('.', document.currentScript.src).href;   // textures/ sits next to this file
let onTexture = () => {};
const W = 1080, H = 1920;

/* ---------- colour ---------- */
const FONTS = {
  oswald:{label:'Condensed', t:fs=>`600 ${fs}px Oswald, "Arial Narrow", sans-serif`, a:fs=>`400 ${fs}px Oswald, "Arial Narrow", sans-serif`, upper:true},
  serif:{label:'Serif', t:fs=>`600 ${fs}px "Cormorant Garamond", Georgia, serif`, a:fs=>`italic 500 ${fs}px "Cormorant Garamond", Georgia, serif`},
  black:{label:'Heavy', t:fs=>`${fs}px "Archivo Black", "Arial Black", sans-serif`, a:fs=>`500 ${fs}px "IBM Plex Sans", sans-serif`},
  hand:{label:'Handwritten', t:fs=>`${fs}px "Gochi Hand", "Comic Sans MS", cursive`, a:fs=>`${fs}px "Gochi Hand", "Comic Sans MS", cursive`},
  mono:{label:'Typewriter', t:fs=>`500 ${fs}px "IBM Plex Mono", monospace`, a:fs=>`400 ${fs}px "IBM Plex Mono", monospace`},
};
const STYLES = {real:'Real spine', cover:'Cover', dvd:'DVD case', art:'Artwork + colour', solid:'Solid colour', classic:'Classic band', strip:'Cover strip'};
const THEMES = {
  paper:{bg:'#FFFFFF', ink:'#0F1419', mark:'rgba(15,20,25,.38)'},
  ink:{bg:'#0E0F12', ink:'#F1F2F4', mark:'rgba(241,242,244,.38)'},
  blush:{bg:'#F3DCE0', ink:'#3A1F26', mark:'rgba(58,31,38,.4)'},
  shelf:{bg:'#E6E1DA', ink:'#2A241F', mark:'rgba(42,36,31,.4)'},
  dark:{bg:'#232323', ink:'#E9E6DF', mark:'rgba(233,230,223,.4)'},
  forest:{bg:'#1F3A2E', ink:'#EDE8D8', mark:'rgba(237,232,216,.4)'},
};

const hex = (r,g,b) => '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const rgb = h => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)); };
const lum = h => { const c = rgb(h).map(v => { v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
const contrast = (a,b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
const alpha = (h,a) => { const [r,g,b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
const sat = ([r,g,b]) => { const mx = Math.max(r,g,b), mn = Math.min(r,g,b); return mx === 0 ? 0 : (mx-mn)/mx; };
const dist = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);

function crop(img, sx, sy, sw, sh){ const c = document.createElement('canvas'); c.width = Math.max(1,Math.round(sw)); c.height = Math.max(1,Math.round(sh)); c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); return c; }

/* ---------- posters: lift the printed title off the top, to use on a DVD spine ---------- */
function posterTitle(img){
  const cw = 160, ch = Math.round(cw*img.height/img.width), top = Math.round(ch*.42);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(img, 0, 0, cw, ch);
  const d = x.getImageData(0, 0, cw, top).data, px = i => [d[i], d[i+1], d[i+2]];
  // background = the most common colour in the top part of the poster
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4){ const k = (d[i]>>5)<<6 | (d[i+1]>>5)<<3 | (d[i+2]>>5), e = buckets.get(k) || {n:0,r:0,g:0,b:0}; e.n++; e.r += d[i]; e.g += d[i+1]; e.b += d[i+2]; buckets.set(k, e); }
  const e = [...buckets.values()].sort((a,b) => b.n - a.n)[0], bg = [e.r/e.n, e.g/e.n, e.b/e.n];
  if (e.n < cw*top*.3) return null;                                   // no plain background up there: a photo
  const ink = [], rows = [];
  for (let y = 0; y < top; y++){ let n = 0; for (let X = 0; X < cw; X++){ const on = dist(px((y*cw+X)*4), bg) > 90; ink.push(on); n += on; } rows.push(n/cw); }
  // the title: the first run of inked rows with plain rows above and below it
  const m = Math.max(1, Math.round(ch*.01));
  for (let y = m; y < top - m; y++){
    if (rows[y] < .03) continue;
    let y1 = y; while (y1 < top && rows[y1] >= .03) y1++;
    const h = y1 - y;
    if (y1 < top - m && h >= ch*.03 && h <= ch*.2){
      let L = cw, R = -1;
      for (let yy = y; yy < y1; yy++) for (let X = 0; X < cw; X++) if (ink[yy*cw+X]){ L = Math.min(L, X); R = Math.max(R, X); }
      const w = R - L + 1, fill = rows.slice(y, y1).reduce((a,v) => a+v, 0)/h;
      if (w >= cw*.25 && w/h >= 1.8 && fill < .75){
        const k = img.width/cw, p = 2, x0 = Math.max(0, L-p), x1 = Math.min(cw, R+1+p), y0 = Math.max(0, y-p), y2 = Math.min(top, y1+p);
        return {img: crop(img, x0*k, y0*k, (x1-x0)*k, (y2-y0)*k), bg: hex(...bg)};
      }
    }
    y = y1;
  }
  return null;
}

const loadImg = src => new Promise((res, rej) => { const im = new Image(); if (!/^(data|blob):/.test(src)) im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; });

/* ---------- spine renderer ---------- */
function rr(x,X,Y,w,h,r){ x.beginPath(); if (x.roundRect) x.roundRect(X,Y,w,h,r); else x.rect(X,Y,w,h); }
function fitFont(x, text, maker, maxSize, budget){ x.font = maker(100); const m = x.measureText(text).width || 1; return Math.max(8, Math.min(maxSize, 100*budget/m)); }
function coverCrop(x, img, dx, dy, dw, dh){ const iw = img.width, ih = img.height, s = Math.max(dw/iw, dh/ih), sw = dw/s, sh = dh/s; x.drawImage(img, (iw-sw)/2, (ih-sh)/2, sw, sh, dx, dy, dw, dh); }
function shade(x,w,h){ const g = x.createLinearGradient(0,0,w,0); g.addColorStop(0,'rgba(0,0,0,.2)'); g.addColorStop(.1,'rgba(0,0,0,0)'); g.addColorStop(.45,'rgba(255,255,255,.07)'); g.addColorStop(.9,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,.18)'); x.fillStyle = g; x.fillRect(0,0,w,h); }
const isReal = b => b.style === 'real' && b.spineImg;
const isCase = b => b.style === 'dvd';
const isCover = b => b.style === 'cover' && b.img;   // stands face out on the shelf
const asSpine = b => isCover(b) ? Object.assign({}, b, {style: b.kind === 'movie' ? 'dvd' : 'art'}) : b;
/* The part of a cover with the least going on (no faces cut in half, no half a title), in the shape asked for.
   null when the whole cover is busy. Cached on the image. */
function calmRect(img, aspect){
  const key = aspect.toFixed(2), memo = img._calm || (img._calm = {});
  if (key in memo) return memo[key];
  const gw = 48, gh = Math.max(8, Math.round(gw*img.height/img.width)), c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(img, 0, 0, gw, gh);
  const d = x.getImageData(0, 0, gw, gh).data, g = i => (d[i*4] + d[i*4+1] + d[i*4+2])/3;
  // detail at each cell, summed so any window's total is four look-ups
  const S = new Float64Array((gw+1)*(gh+1));
  for (let y = 0; y < gh; y++) for (let X = 0; X < gw; X++){
    const i = y*gw + X, e = (X < gw-1 ? Math.abs(g(i+1) - g(i)) : 0) + (y < gh-1 ? Math.abs(g(i+gw) - g(i)) : 0);
    S[(y+1)*(gw+1) + X+1] = e + S[y*(gw+1) + X+1] + S[(y+1)*(gw+1) + X] - S[y*(gw+1) + X];
  }
  const sum = (X, y, w, h) => S[(y+h)*(gw+1) + X+w] - S[y*(gw+1) + X+w] - S[(y+h)*(gw+1) + X] + S[y*(gw+1) + X];
  let ww = Math.round(Math.min(gw, gh*aspect)*.55), wh = Math.round(ww/aspect);
  if (wh > gh){ wh = gh; ww = Math.round(wh*aspect); }
  let best = null;
  for (let y = 0; y + wh <= gh; y++) for (let X = 0; X + ww <= gw; X++){ const m = sum(X, y, ww, wh)/(ww*wh); if (!best || m < best.m) best = {X, y, m}; }
  const k = img.width/gw;
  return memo[key] = best && best.m < 6 ? {x:best.X*k, y:best.y*k, w:ww*k, h:wh*k} : null;   // tested covers' calmest parts: 11-48, a plain area is under 6
}
function topBlock(x, b, X, Y, W, H){
  const r = calmRect(b.img, W/H);
  if (r){ x.drawImage(b.img, r.x, r.y, r.w, r.h, X, Y, W, H); return; }
  // a busy cover: a band of its accent colour with the whole cover small inside it
  x.fillStyle = b.accent || b.bg; x.fillRect(X, Y, W, H);
  const iw = b.img.width, ih = b.img.height, k = Math.min(W*.5/iw, H*.62/ih), tw = iw*k, th = ih*k;
  x.drawImage(b.img, X + (W-tw)/2, Y + (H-th)/2, tw, th);
}
function makeSpine(b, w, h, foot = 0){
  w = Math.max(14, Math.round(w)); h = Math.round(h);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), r = Math.min(8, w*.07), F = FONTS[b.font] || FONTS.oswald;
  x.save(); rr(x,0,0,w,h,r); x.clip();
  if (isReal(b)){ x.drawImage(b.spineImg, 0, 0, w, h); shade(x,w,h); x.restore(); return c; }
  if (isCover(b)){ x.drawImage(b.img, 0, 0, w, h); x.restore(); return c; }
  if (b.style === 'strip' && b.img){ const iw = b.img.width, ih = b.img.height; let sw = ih*w/h; if (sw > iw) sw = iw; x.drawImage(b.img, (iw-sw)/2, 0, sw, ih, 0, 0, w, h); x.fillStyle = alpha(b.bg,.22); x.fillRect(0,0,w,h); }
  else { x.fillStyle = b.bg; x.fillRect(0,0,w,h); }

  if (b.style === 'dvd'){
    x.fillStyle = b.accent; x.fillRect(0,0,Math.max(2,w*.035),h);
    const cx = w/2, sp = w*.1; let yb = h - w*.28;
    x.fillStyle = b.fg; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    const studio = (b.studio || '').trim();
    if (studio){
      const words = studio.split(/\s+/), half = Math.ceil(words.length/2), lines = words.length > 1 ? [words.slice(0,half).join(' '), words.slice(half).join(' ')] : [studio];
      let fs = w*.16; x.font = `600 ${fs}px "IBM Plex Sans", sans-serif`;
      const mw = Math.max(...lines.map(l => x.measureText(l).width)); if (mw > w - sp*2) fs *= (w - sp*2)/mw;
      x.font = `600 ${fs}px "IBM Plex Sans", sans-serif`;
      for (let i = lines.length-1; i >= 0; i--){ x.fillText(lines[i], cx, yb); yb -= fs*1.12; }
      yb -= w*.18;
    }
    x.font = `italic ${w*.3}px "Archivo Black", "Arial Black", sans-serif`; x.fillText('DVD', cx, yb);
    x.font = `500 ${w*.1}px "IBM Plex Sans", sans-serif`; x.fillText('VIDEO', cx, yb + w*.12);
    yb -= w*.42; x.globalAlpha = .75; x.font = `400 ${w*.13}px "IBM Plex Mono", monospace`; x.fillText(b.cat, cx, yb); x.globalAlpha = 1;
    yb -= w*.25; const s = w*.74;
    if (b.img) topBlock(x, b, cx-s/2, yb-s, s, s);
    const art = b.img ? [[yb - s, yb]] : [];   // the poster block often carries the title too
    const tEnd = yb - s - w*.5, tStart = w*.5, title = F.upper ? b.title.toUpperCase() : b.title;
    if (b.titleImg){
      // the title as printed on the poster, turned to run down the spine
      const t = b.titleImg, k = Math.min((tEnd - tStart)/t.width, w*.8/t.height);
      x.save(); x.translate(w/2, 0); x.rotate(Math.PI/2); x.drawImage(t, tStart, -t.height*k/2, t.width*k, t.height*k); x.restore();
      c.words = [[tStart, tStart + t.width*k], ...art];
    } else if (title.trim()){ const fs = fitFont(x, title, F.t, w*.46, tEnd - tStart); x.save(); x.translate(w/2 + w*.02, 0); x.rotate(Math.PI/2); x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillStyle = b.fg; x.font = F.t(fs); x.fillText(title, tStart, 0); c.words = [[tStart, tStart + x.measureText(title).width], ...art]; x.restore(); }
    else c.words = art;
    shade(x,w,h); x.restore(); return c;
  }

  const pad = w*.55; let start = pad, end = h - pad - foot; c.words = [];
  if (b.style === 'art' && b.img){ const ah = Math.min(h*.22, w*1.5); topBlock(x, b, 0, 0, w, ah); start = ah + pad*.8; c.words.push([0, ah]); }   // the cover block often carries the title too
  if (b.style === 'classic'){ const top = h*.74, bh = Math.max(w*1.1, h*.1); x.fillStyle = b.accent; x.fillRect(0,top,w,bh); const s = Math.min(w*.6, bh*.72);
    if (b.img){ x.save(); rr(x,(w-s)/2, top+(bh-s)/2, s, s, s*.12); x.clip(); coverCrop(x, b.img, (w-s)/2, top+(bh-s)/2, s, s); x.restore(); } end = top - pad*.7; }
  else if (b.style === 'solid'){ const cy = h - pad - w*.2, rad = w*.17; x.strokeStyle = b.accent; x.lineWidth = Math.max(1.5, w*.025); x.beginPath(); x.arc(w/2, cy, rad, 0, 7); x.stroke(); x.beginPath(); x.arc(w/2, cy, rad*.45, 0, 7); x.fillStyle = b.accent; x.fill(); end = cy - rad - pad*.8; }
  const region = end - start, title = F.upper ? b.title.toUpperCase() : b.title, author = F.upper ? b.author.toUpperCase() : b.author, hasA = author.trim().length > 0;
  const tS = title.trim() ? fitFont(x, title, F.t, w*.36, region*(hasA ? .6 : .95)) : 0;
  const aS = hasA ? fitFont(x, author, F.a, Math.min(w*.26, tS ? tS*.72 : w*.26), region*(title.trim() ? .34 : .95)) : 0;
  x.save(); x.translate(w/2, 0); x.rotate(Math.PI/2); x.textBaseline = 'middle'; x.fillStyle = b.fg;
  if (b.style === 'strip'){ x.shadowColor = alpha(b.bg,.55); x.shadowBlur = w*.08; }
  if (tS){ x.font = F.t(tS); x.textAlign = 'left'; x.fillText(title, start, 0); c.words.push([start, start + x.measureText(title).width]); }
  if (aS){ x.font = F.a(aS); x.textAlign = 'right'; x.globalAlpha = .88; x.fillText(author, end, 0); c.words.push([end - x.measureText(author).width, end]); }
  x.restore(); shade(x,w,h); x.restore(); return c;
}

// textures come from this site (textures/), so drawing them keeps the canvas exportable
const TEX = {};
function texture(name){
  if (!TEX[name]){ const t = TEX[name] = {img:null}; t.ready = loadImg(HERE + 'textures/' + name + '.jpg').then(im => { t.img = im; onTexture(); }).catch(() => {}); }
  return TEX[name].img;
}
// stable randomness: the same shelf always gets the same wear
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rngOf = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
const blank = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// scratch canvases, reused: a new canvas per step per spine keeps the garbage collector busy
const SCRATCH = [];
const scratch = (n, w, h) => { const c = SCRATCH[n] || (SCRATCH[n] = document.createElement('canvas')); c.width = w; c.height = h; return c; };
// a tiling texture over a canvas, at a random offset and turn
function texOver(x, img, w, h, rnd, mode, alpha, scale = 1){
  if (!img || alpha <= 0) return;
  x.save(); x.globalCompositeOperation = mode; x.globalAlpha = Math.min(1, alpha);
  const pat = x.createPattern(img, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix().translateSelf(-rnd()*img.width, -rnd()*img.height));
  x.translate(w/2, h/2); x.rotate(Math.floor(rnd()*4)*Math.PI/2 + (rnd() - .5)*.3); x.scale(scale, scale);
  const R = Math.hypot(w, h)/scale/2 + 4; x.fillStyle = pat; x.fillRect(-R, -R, 2*R, 2*R); x.restore();
}
// a texture at the spine's size as grey values, stretched sx by sy (sy > sx: its lines run along the spine)
function texGrey(name, w, h, rnd, sx, sy){
  const img = texture(name); if (!img) return null;
  const c = scratch(0, w, h), x = c.getContext('2d', {willReadFrequently:true}), pat = x.createPattern(img, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix().translateSelf(-rnd()*img.width, -rnd()*img.height));
  x.translate(w/2, h/2); x.rotate(rnd() < .5 ? 0 : Math.PI); x.scale(sx, sy);
  const R = Math.max(w/sx, h/sy); x.fillStyle = pat; x.fillRect(-R, -R, 2*R, 2*R);
  const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w*h);
  for (let i = 0; i < g.length; i++) g[i] = d[i*4];
  return g;
}
// film grain: one seeded noise tile, reused
let GRAIN = null;
function grainTile(){
  if (GRAIN) return GRAIN;
  const n = 256, c = blank(n, n), x = c.getContext('2d'), im = x.createImageData(n, n), r = rngOf(7);
  for (let i = 0; i < im.data.length; i += 4){ const v = 128 + (r() + r() + r() - 1.5)*90; im.data[i] = im.data[i+1] = im.data[i+2] = v; im.data[i+3] = 255; }
  x.putImageData(im, 0, 0); return GRAIN = c;
}
// ink and paper that have aged: less colour, blacks lifted, whites gone cream, a little more contrast
function grade(x, w, h, k){
  const im = x.getImageData(0, 0, w, h), d = im.data, sat = 1 - .5*k, lift = 34*k, con = 1 + .1*k;
  for (let i = 0; i < d.length; i += 4){
    if (!d[i+3]) continue;
    const l = .299*d[i] + .587*d[i+1] + .114*d[i+2], t = l/255;
    for (let c = 0; c < 3; c++){ let v = l + (d[i+c] - l)*sat; v = (v - 128)*con + 128; v = lift + v*(1 - lift/255); d[i+c] = v; }
    d[i] -= 4*t*k; d[i+1] -= 12*t*k; d[i+2] -= 40*t*k;          // the lighter the paper, the more it has yellowed
  }
  x.putImageData(im, 0, 0);
}
const copyOf = sp => { const c = blank(sp.width, sp.height); c.getContext('2d', {willReadFrequently:true}).drawImage(sp, 0, 0); return c; };
const outline = (c, sp) => { const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-in'; x.drawImage(sp, 0, 0); x.globalCompositeOperation = 'source-over'; return c; };

/* Faded: books that sat in the sun for years. Much less colour, warm cream whites, blacks gone dark grey, a yellow cast. */
function fadedSpine(sp, k){
  const c = copyOf(sp), w = c.width, h = c.height, x = c.getContext('2d', {willReadFrequently:true}), im = x.getImageData(0, 0, w, h), d = im.data;
  const m = k/.7, sat = 1 - .35*m, lift = 52*m;
  for (let i = 0; i < d.length; i += 4){
    if (!d[i+3]) continue;
    const l = .299*d[i] + .587*d[i+1] + .114*d[i+2], t = l/255;
    for (let n = 0; n < 3; n++){ const v = l + (d[i+n] - l)*sat; d[i+n] = lift + v*(1 - lift/255); }
    // the lighter it is, the more it has yellowed: whites end up warm cream
    d[i] += (6 + 4*t)*m; d[i+1] += (1 - 4*t)*m; d[i+2] -= (10 + 26*t)*m;
  }
  x.putImageData(im, 0, 0); return c;
}
/* Glossy: a plastic cover catching the light. A soft sheen down each spine, a thin line of light along the top, a little more contrast. */
function glossySpine(sp, k){
  const c = copyOf(sp), w = c.width, h = c.height, x = c.getContext('2d', {willReadFrequently:true}), im = x.getImageData(0, 0, w, h), d = im.data, m = k/.7, con = 1 + .14*m;
  for (let i = 0; i < d.length; i += 4){ if (!d[i+3]) continue; for (let n = 0; n < 3; n++) d[i+n] = (d[i+n] - 128)*con + 128; }
  x.putImageData(im, 0, 0);
  x.globalCompositeOperation = 'screen';
  // a plastic cover catching the light: one soft vertical sheen a quarter of the way in
  const g = x.createLinearGradient(0, 0, w, 0), a = Math.min(.5, .2*m);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.175, 'rgba(255,255,255,0)'); g.addColorStop(.25, `rgba(255,255,255,${a})`);
  g.addColorStop(.325, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // and a very thin highlight along the top edge
  x.fillStyle = `rgba(255,255,255,${Math.min(.7, .45*m)})`; x.fillRect(0, 0, w, Math.max(1, Math.round(h*.0025)));
  return outline(c, sp);
}
/* Grain: film grain you can see at story size (2px grains, about 12 %), and a very light paper texture */
let GRAIN2 = null;
function grainTile2(){
  if (GRAIN2) return GRAIN2;
  const n = 256, c = blank(n, n), x = c.getContext('2d'), im = x.createImageData(n, n), r = rngOf(11);
  for (let y = 0; y < n; y += 2) for (let X = 0; X < n; X += 2){
    const v = 128 + (r() + r() - 1)*62;                                 // about ±12 % around the middle
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]){ const i = ((y + dy)*n + X + dx)*4; im.data[i] = im.data[i+1] = im.data[i+2] = v; im.data[i+3] = 255; }
  }
  x.putImageData(im, 0, 0); return GRAIN2 = c;
}
function grainSpine(sp, k){
  const c = copyOf(sp), x = c.getContext('2d'), w = c.width, h = c.height, m = k/.7, rnd = rngOf(3);
  texOver(x, texture('paper'), w, h, rnd, 'multiply', .14*m, Math.max(.3, w/300));
  texOver(x, grainTile2(), w, h, rnd, 'overlay', Math.min(1, .95*m), 1);
  return outline(c, sp);
}

/* Worn VHS: real wear, built from the textures, different on every spine. level: 0 almost clean ... 1 heavily worn.
   Punchy like a real tape shelf: deep blacks, colours that still pop, wear that is crisp and near-white.
   Made once at the spine's final size and cached (see spineFor). */
const FLAKE = [242, 237, 227];   // #F2EDE3: the card and paper where the print has come off
function wornSpine(sp, b, level, fast){
  const w = sp.width, h = sp.height, c = copyOf(sp), x = c.getContext('2d', {willReadFrequently:true}), rnd = rngOf(hashStr(b.id + ':vhs'));
  // grime: only at the very ends, subtle and uneven
  const card = texture('cardboard'), crum = texture('crumpled');
  // (both are made only where they land, the two ends and a couple of small spots, not over the whole spine)
  if (card && level > 0){
    const bh = Math.ceil(h*.12);
    for (const top of [true, false]){
      const g = scratch(1, w, bh), gx = g.getContext('2d');
      texOver(gx, card, w, bh, rnd, 'source-over', 1, Math.max(.3, w/300));
      gx.globalCompositeOperation = 'multiply'; gx.fillStyle = '#4A3E31'; gx.fillRect(0, 0, w, bh);
      const m = scratch(2, w, bh), mx = m.getContext('2d'), reach = h*(.05 + rnd()*.03);
      const lg = mx.createLinearGradient(0, top ? 0 : bh, 0, top ? reach : bh - reach); lg.addColorStop(0, 'rgba(0,0,0,1)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      mx.fillStyle = lg; mx.fillRect(0, 0, w, bh);
      if (crum) texOver(mx, crum, w, bh, rnd, 'destination-in', 1, Math.max(.25, w/400));   // patchy, not a smooth fade
      gx.globalCompositeOperation = 'destination-in'; gx.drawImage(m, 0, 0);
      x.save(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = .3 + .25*level; x.drawImage(g, 0, top ? 0 : h - bh); x.restore();
    }
  }
  // scratches: faint, and only in a few places
  const scr = texture('scratches-' + (1 + Math.floor(rnd()*3)));
  if (scr && level > .2) for (let n = 1 + Math.floor(rnd()*2); n > 0; n--){
    const r = Math.ceil((.5 + rnd())*w*1.4), cx = rnd()*w, cy = rnd()*h, sx0 = Math.max(0, Math.floor(cx - r)), sy0 = Math.max(0, Math.floor(cy - r));
    const sw = Math.min(w, Math.ceil(cx + r)) - sx0, sh = Math.min(h, Math.ceil(cy + r)) - sy0; if (sw < 2 || sh < 2) continue;
    const s = scratch(3, sw, sh), sx = s.getContext('2d'); sx.fillStyle = '#000'; sx.fillRect(0, 0, sw, sh);
    texOver(sx, scr, sw, sh, rnd, 'source-over', 1, Math.max(.3, w/260));
    const rg = sx.createRadialGradient(cx - sx0, cy - sy0, 0, cx - sx0, cy - sy0, r); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    sx.globalCompositeOperation = 'destination-in'; sx.fillStyle = rg; sx.fillRect(0, 0, sw, sh);
    x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = .12*(.5 + level); x.drawImage(s, sx0, sy0); x.restore();
  }
  // where a sticker or tape was peeled off: a faint rectangle of lighter, yellowed paper
  if (rnd() < .4){
    const rw = w*(.55 + rnd()*.4), rh = h*(.025 + rnd()*.05), rx = (w - rw)*rnd(), ry = h*(.08 + rnd()*.78), tape = rnd() < .35;
    x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = tape ? 'rgba(255,245,200,.14)' : 'rgba(250,244,228,.16)'; x.fillRect(rx, ry, rw, rh);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = tape ? 'rgba(235,205,120,.3)' : 'rgba(238,224,190,.18)'; x.fillRect(rx, ry, rw, rh); x.restore();
  }
  if (fast) return outline(c, sp);

  // One pass over every pixel: the colour (deep blacks, a touch more contrast, a little less colour, a light
  // warm cast), then crisp near-white crackle on the dark parts and a crisp broken line along the long edges.
  const crk = texGrey('cracks', w, h, rnd, .14, .22);
  // crackle lives in 1-2 zones on each spine (along an edge, at an end, down a crease line), clean in between
  const zones = Array.from({length: 1 + (rnd() < .45 ? 1 : 0)}, () => {
    const t = rnd();
    if (t < .4){ const side = rnd() < .5, y0 = h*rnd()*.6; return {x0: side ? 0 : w*.65, x1: side ? w*.35 : w, y0, y1: y0 + h*(.2 + rnd()*.3)}; }   // along a long edge
    if (t < .75){ const top = rnd() < .5; return {x0: 0, x1: w, y0: top ? 0 : h*(.78 + rnd()*.06), y1: top ? h*(.16 + rnd()*.06) : h}; }         // an end
    const cx = w*(.25 + rnd()*.5), y0 = h*rnd()*.5; return {x0: cx - w*.12, x1: cx + w*.12, y0, y1: y0 + h*(.25 + rnd()*.3)};                   // down a crease line
  });
  const soft = Math.max(4, w*.12), zoneAt = (X, y) => { let m = 0; for (const z of zones){ const dx = Math.max(z.x0 - X, 0, X - z.x1), dy = Math.max(z.y0 - y, 0, y - z.y1), dd = Math.max(dx, dy*.25); m = Math.max(m, 1 - Math.min(1, dd/soft)); } return m; };
  const pct = (g, q) => { if (!g) return 256; const hist = new Uint32Array(256); for (let i = 0; i < g.length; i++) hist[g[i]]++; let n = 0, lim = g.length*q; for (let v = 0; v < 256; v++){ n += hist[v]; if (n >= lim) return v; } return 255; };
  const im = x.getImageData(0, 0, w, h), d = im.data;
  const sat = .9, con = 1.12, lift = 6, warm = .5 + .5*level;
  const crT = pct(crk, .973 - .025*level), eT = pct(crk, .84 - .12*level), ew = Math.max(2, w*.055), crA = .55 + .45*level;   // crackle: the brightest 2.5-5 % of the texture only
  const flakes = [];
  for (let y = 0, p = 0; y < h; y++) for (let X = 0; X < w; X++, p++){
    const i = p*4; if (!d[i+3]) continue;
    const l0 = .299*d[i] + .587*d[i+1] + .114*d[i+2];
    let r = l0 + (d[i] - l0)*sat, g = l0 + (d[i+1] - l0)*sat, bl = l0 + (d[i+2] - l0)*sat;
    r = (r - 128)*con + 128; g = (g - 128)*con + 128; bl = (bl - 128)*con + 128;
    r = lift + r*(1 - lift/255); g = lift + g*(1 - lift/255); bl = lift + bl*(1 - lift/255);
    r += 3*warm; g += 1*warm; bl -= 6*warm;                                          // light cream, not grey
    const L = .299*r + .587*g + .114*bl;
    if (crk){
      const v = crk[p];
      // crackle: a sharp, near-white line where the print is dark; almost none where it's light
      if (v > crT){
        const m = zoneAt(X, y), dark = Math.min(1, Math.max(0, (115 - L)/45));   // truly dark parts only, and only in this spine's zones
        const a = dark*crA*(.25 + .75*m);
        if (a > .3){ r += (FLAKE[0] - r)*.95; g += (FLAKE[1] - g)*.95; bl += (FLAKE[2] - bl)*.95; if (a > .7 && v > crT + 30 && rnd() < .004*level) flakes.push([X, y]); }
      }
      // edge: a thin, broken, crisp line where the card shows at the fold
      const e = Math.min(X, w - 1 - X);
      if (e < ew && v > eT + (e/ew)*(255 - eT)*.85){ r = FLAKE[0]; g = FLAKE[1]; bl = FLAKE[2]; }
    }
    d[i] = r; d[i+1] = g; d[i+2] = bl;
  }
  // creases: long folds down the spine, crisp (none on the cleaner tapes)
  if (level >= .45){
    const crease = texGrey('cracks', w, h, rnd, .2, 2.2), cT = pct(crease, .975 - .05*level);
    for (let n = level > .8 ? 2 : 1; n > 0 && crease; n--){
      const cc = w*(.15 + rnd()*.7), bw = w*(.04 + rnd()*.05), f = .6 + rnd()*1.6, ph = rnd()*6, am = w*(.03 + rnd()*.05), y0 = h*rnd()*.4, y1 = h*(.6 + rnd()*.4);
      for (let y = Math.floor(y0); y < Math.min(h, y1); y++){
        const cx = cc + Math.sin(y/h*Math.PI*f + ph)*am;
        for (let X = Math.max(0, Math.floor(cx - bw)); X < Math.min(w, cx + bw); X++){
          const p = y*w + X, i = p*4; if (!d[i+3] || crease[p] <= cT) continue;
          d[i] += (FLAKE[0] - d[i])*.8; d[i+1] += (FLAKE[1] - d[i+1])*.8; d[i+2] += (FLAKE[2] - d[i+2])*.8;
        }
      }
    }
  }
  // peeled spots: small (mostly under a tenth of the spine's width), 0-2, near the long edges or the ends,
  // grey-white card with the paper's grain, ragged at the edge
  const nPeel = level < .25 || rnd() < .35 ? 0 : level > .8 && rnd() < .6 ? 2 : 1;
  const paper = nPeel ? texGrey('paper', w, h, rnd, .5, .5) : null, fine = nPeel ? texGrey('crumpled', w, h, rnd, .2, .2) : null;
  for (let n = 0; n < nPeel && paper && fine; n++){
    const edgeSide = rnd() < .6, rx = w*(.03 + rnd()*.07), ry = Math.min(h*.03, rx*(1.5 + rnd()*2.5));
    const px = edgeSide ? (rnd() < .5 ? rx*.6 : w - rx*.6) : w*(.2 + rnd()*.6);
    const py = edgeSide ? h*(.06 + rnd()*.88) : (rnd() < .5 ? h*(.02 + rnd()*.08) : h*(.9 + rnd()*.08));
    const fT = pct(fine, .5);
    for (let y = Math.max(0, Math.floor(py - ry*1.2)); y < Math.min(h, py + ry*1.2); y++) for (let X = Math.max(0, Math.floor(px - rx*1.2)); X < Math.min(w, px + rx*1.2); X++){
      const p = y*w + X, i = p*4, u = (X - px)/rx, v = (y - py)/ry, r2 = u*u + v*v;
      if (!d[i+3] || r2 >= 1.4 || fine[p] <= fT - 50 + r2*90) continue;
      const t = paper[p]/255;                                        // #BDB6A6 .. #D9D4C7 with the paper's grain
      d[i] = 189 + 28*t; d[i+1] = 182 + 30*t; d[i+2] = 166 + 33*t;
    }
  }
  x.putImageData(im, 0, 0);
  // small sharp flakes: along both long edges, and inside the crackle on the dark parts
  const u = Math.max(1, w/60), flake = (fx, fy, size) => {
    x.beginPath(); const n = 5 + Math.floor(rnd()*3);
    for (let k = 0; k < n; k++){ const a = k/n*6.283 + rnd()*.6, r = size*(.45 + rnd()*.7); x.lineTo(fx + Math.cos(a)*r, fy + Math.sin(a)*r*(1.2 + rnd())); }
    x.closePath(); x.fill();
  };
  x.fillStyle = 'rgb(242,237,227)';
  for (const side of [0, 1]) for (let y = rnd()*30*u; y < h; y += (8 + rnd()*40)*u/(.4 + level)) if (rnd() < .5 + .4*level) flake(side ? w - rnd()*1.5*u : rnd()*1.5*u, y, (.8 + rnd()*2.2)*u);
  for (const [fx, fy] of flakes.slice(0, 30)) flake(fx, fy, (.6 + rnd()*1.6)*u);
  return outline(c, sp);
}
/* ---------- Pro 2-6: what happens to the books (and the light on them). The background stays the user's. ---------- */
const surname = s => (String(s || '').trim().split(/\s+/).pop() || '').replace(/[^A-Za-z]/g, '').toUpperCase();
function pixels(c){ const x = c.getContext('2d', {willReadFrequently:true}); return {x, im: x.getImageData(0, 0, c.width, c.height)}; }

/* where a sticker or label can go on a spine without covering the title or author. makeSpine notes where it put its
   words (sp.words, [from, to] along the spine); a scan doesn't say, so there only a calm stretch will do. */
function rowDetail(sp){
  if (sp._rows) return sp._rows;
  const w = sp.width, h = sp.height, gw = Math.min(w, 24), gh = Math.max(8, Math.round(h/4)), c = blank(gw, gh), x = c.getContext('2d', {willReadFrequently:true});
  x.drawImage(sp, 0, 0, gw, gh);
  const d = x.getImageData(0, 0, gw, gh).data, rows = new Float64Array(gh + 1);
  for (let y = 0; y < gh; y++){
    let e = 0;
    for (let X = 0; X < gw - 1; X++){ const i = (y*gw + X)*4; e += Math.abs(d[i] - d[i+4]) + Math.abs(d[i+1] - d[i+5]) + Math.abs(d[i+2] - d[i+6]); }
    if (y) for (let X = 0; X < gw; X++){ const i = (y*gw + X)*4, j = i - gw*4; e += Math.abs(d[i] - d[j]) + Math.abs(d[i+1] - d[j+1]) + Math.abs(d[i+2] - d[j+2]); }
    rows[y+1] = rows[y] + e/gw;
  }
  return sp._rows = {rows, k: gh/h};
}
// the top of a free stretch len long between lo and hi (fractions of the length), or null. prefer: 'low' or 'high' on a tie
function freeBand(sp, len, lo, hi, prefer, busy = 40){
  const h = sp.height, words = sp.words, m = Math.max(6, sp.width*.15), {rows, k} = rowDetail(sp);
  let best = null;
  for (let y = Math.round(h*lo); y + len <= h*hi; y += 3){
    if (words && words.some(([a, b]) => y < b + m && y + len > a - m)) continue;
    const r0 = Math.floor(y*k), r1 = Math.max(r0 + 1, Math.ceil((y + len)*k)), calm = (rows[r1] - rows[r0])/(r1 - r0);
    const cost = calm + (prefer === 'low' ? (h - y - len)/h : y/h)*4;
    if (!best || cost < best.cost) best = {y, calm, cost};
  }
  return best && (words || best.calm < busy) ? best.y : null;
}

/* Rental Shop: a worn tape with a shop sticker on about 3 spines in 5, one at most, never over the title or author:
   a round pink BE KIND REWIND with its words round the edge, a yellow USED MOVIE SALE label with the price in ballpoint,
   a round genre dot, or a white PLEASE REWIND strip with a red border (refs: design/refs/rental-*). The green light is in bookLight. */
const GLO = {pink:'#FF4FA3', yellow:'#FFE12E', orange:'#FF8A1F', green:'#86F25C'};
const HAND = fs => `${fs}px "Gochi Hand", "Comic Sans MS", cursive`;
// text round a circle: top reads left to right over the top, bottom left to right under it (x is at the centre, textAlign center)
function arcText(x, text, r, top){
  const ch = [...text], ws = ch.map(c => x.measureText(c).width), span = ws.reduce((a, v) => a + v, 0)/r;
  let a = top ? -Math.PI/2 - span/2 : Math.PI/2 + span/2;
  ch.forEach((c, i) => {
    const d = ws[i]/r/2; a += top ? d : -d;
    x.save(); x.translate(r*Math.cos(a), r*Math.sin(a)); x.rotate(top ? a + Math.PI/2 : a - Math.PI/2); x.fillText(c, 0, 0); x.restore();
    a += top ? d : -d;
  });
}
// the paper of a sticker: a hair of shadow under it, a faint sheen on top
function stickerPaper(x, path, col){
  x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 1.5; x.shadowOffsetY = 1; x.fillStyle = col; path(); x.fill(); x.restore();
  x.save(); path(); x.clip(); x.globalCompositeOperation = 'screen'; x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(-500, -500, 1000, 480); x.restore();
}
function beKindSticker(x, d){
  stickerPaper(x, () => { x.beginPath(); x.arc(0, 0, d/2, 0, 7); }, GLO.pink);
  x.fillStyle = '#4A0B2C'; x.strokeStyle = '#4A0B2C'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `${Math.max(5, d*.155)}px "Archivo Black", "Arial Black", sans-serif`;
  arcText(x, 'BE KIND', d*.33, true); arcText(x, 'REWIND', d*.33, false);
  x.lineWidth = Math.max(.8, d*.028); rr(x, -d*.2, -d*.1, d*.4, d*.2, d*.03); x.stroke();        // a little tape in the middle
  for (const s of [-1, 1]){ x.beginPath(); x.arc(s*d*.09, 0, d*.045, 0, 7); x.stroke(); }
}
function genreSticker(x, d, word, col){
  stickerPaper(x, () => { x.beginPath(); x.arc(0, 0, d/2, 0, 7); }, col);
  x.fillStyle = '#1A1A1A'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fs = fitFont(x, word, s => `${s}px "Archivo Black", "Arial Black", sans-serif`, d*.26, d*.78); x.font = `${fs}px "Archivo Black", "Arial Black", sans-serif`;
  x.fillText(word, 0, 1);
}
// laid along the spine, like the titles: USED MOVIE / SALE printed in red, the old price struck out and the new one in ballpoint
function priceSticker(x, S, maxL, col, rnd){
  const was = ['$79.98', '$59.95', '$89.95', '$24.99'][Math.floor(rnd()*4)], now = ['$12.95', '$9.99', '$4.99', '$7.50', '$3'][Math.floor(rnd()*5)];
  // laid out at S = 100, then scaled to fit
  x.font = '600 20px Oswald, "Arial Narrow", sans-serif'; const lw1 = x.measureText('USED MOVIE').width;
  x.font = HAND(26); const rw1 = x.measureText(was).width; x.font = HAND(40); const rw2 = x.measureText(now).width;
  const L100 = 12 + lw1 + 16 + Math.max(rw1, rw2) + 12, sc = Math.min(S/100, maxL/L100), L = L100*sc, H = 100*sc;
  stickerPaper(x, () => { x.beginPath(); x.rect(-L/2, -H/2, L, H); }, col);
  x.save(); x.translate(-L/2, -H/2); x.scale(sc, sc); x.textBaseline = 'middle';
  x.fillStyle = '#C8161F'; x.textAlign = 'left'; x.font = '600 20px Oswald, "Arial Narrow", sans-serif'; x.fillText('USED MOVIE', 12, 26);
  x.font = '600 38px Oswald, "Arial Narrow", sans-serif'; x.fillText('SALE', 12, 66);
  x.fillStyle = '#1E2C8C'; x.textAlign = 'right'; x.font = HAND(26); x.fillText(was, L100 - 12, 28);
  x.strokeStyle = '#1E2C8C'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(L100 - 14 - rw1, 31); x.lineTo(L100 - 10, 25); x.stroke();
  x.font = HAND(40); x.fillText(now, L100 - 12, 68);
  x.restore();
}
function rewindStrip(x, S, maxL){
  const t = 'PLEASE REWIND', font = s => `600 ${s}px Oswald, "Arial Narrow", sans-serif`;
  const fs = fitFont(x, t, font, S*.5, maxL - S*.5), L = Math.min(maxL, (x.font = font(fs), x.measureText(t).width + S*.5));
  stickerPaper(x, () => { x.beginPath(); x.rect(-L/2, -S/2, L, S); }, '#FBF7EA');
  x.strokeStyle = '#C8202A'; x.lineWidth = Math.max(1, S*.06); x.strokeRect(-L/2 + S*.1, -S/2 + S*.1, L - S*.2, S*.8);
  x.fillStyle = '#C8202A'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = font(fs); x.fillText(t, 0, 1);
}
const GENRES = ['HORROR', 'COMEDY', 'DRAMA', 'NEW', 'FAMILY', 'SCI-FI', 'CULT'];
function rentalSpine(sp, b, level, k, fast, slot){
  const c = wornSpine(sp, b, Math.min(1, level*k/.7*.8), fast), w = c.width, h = c.height, rnd = rngOf(hashStr(b.id + ':rental'));
  const plan = ['kind', 'price', null, 'strip', null, 'genre', 'kind', null, 'price', null][slot % 10];   // 6 spines in 10
  if (!plan || k < .1) return c;
  const d = Math.min(w*.9, 92), S = Math.min(w*.74, 64), dot = d*.72, tilt = (rnd() - .5)*.16;
  const tries = {kind: [['kind', d], ['genre', dot]], genre: [['genre', dot]], price: [['price', Math.min(h*.2, w*3.2)], ['genre', dot]], strip: [['strip', Math.min(h*.18, w*3.4)], ['genre', dot]]}[plan];
  const s = scratch(4, w, h), sx = s.getContext('2d');
  let drawn = false;
  for (const [kind, len] of tries){
    const y = freeBand(sp, len, .05, .95, rnd() < .6 ? 'low' : 'high'); if (y === null) continue;
    sx.save(); sx.translate(w/2 + (rnd() - .5)*w*.06, y + len/2);
    if (kind === 'kind'){ sx.rotate(tilt*2); beKindSticker(sx, d); }
    if (kind === 'genre'){ sx.rotate(tilt); genreSticker(sx, dot, b.kind === 'movie' ? GENRES[Math.floor(rnd()*GENRES.length)] : 'BOOKS', [GLO.yellow, GLO.green, GLO.orange][Math.floor(rnd()*3)]); }
    if (kind === 'price'){ sx.rotate(Math.PI/2 + tilt); priceSticker(sx, S, len, rnd() < .7 ? GLO.yellow : GLO.orange, rnd); }
    if (kind === 'strip'){ sx.rotate(Math.PI/2 + tilt); rewindStrip(sx, S*.8, len); }
    sx.restore(); drawn = true; break;
  }
  if (!drawn) return c;
  // handled: the sticker is a little grubby
  const crum = texture('crumpled'), g = scratch(5, w, h), gx = g.getContext('2d');
  if (crum){ gx.fillStyle = '#fff'; gx.fillRect(0, 0, w, h); texOver(gx, crum, w, h, rnd, 'multiply', .35, Math.max(.25, w/400)); gx.globalCompositeOperation = 'destination-in'; gx.drawImage(s, 0, 0); sx.save(); sx.globalCompositeOperation = 'multiply'; sx.drawImage(g, 0, 0); sx.restore(); }
  c.getContext('2d').drawImage(s, 0, 0);
  return outline(c, sp);
}

/* Library Copy: in a clear plastic jacket, with a short white label at the foot (refs: library-spine-label-*), never over the author:
   made spines leave room for it (libFoot); on a scan it goes only where the foot is calm.
   The label: rounded, a few mm up from the bottom, black upper-case sans, two lines, grubby at the bottom.
   The jacket: one bright glare streak down the spine, a fainter one on the far edge, scuffs and specks. */
const libLabel = (w, h) => { const lw = w*.8; return [lw, Math.min(h*.075, lw*.95)]; };
const libFoot = (w, h) => { w = Math.max(14, Math.round(w)); const lh = libLabel(w, h)[1]; return Math.max(0, lh + h*.024 + w*.2 - w*.55); };
function libraryLines(b, rnd){
  const film = b.kind === 'movie', who = surname(b.author) || surname(b.title) || 'XXX';
  if (film) return [rnd() < .5 ? 'DVD FIC' : '791.43', who.slice(0, 5)];
  return rnd() < .7 ? ['FICTION', who.slice(0, 8)] : ['823.914', who.slice(0, 3)];
}
function jacketGlare(x, w, h, m, rnd){
  const band = (cx, bw, a) => {
    const s = scratch(4, w, h), sx = s.getContext('2d'), g = sx.createLinearGradient(cx - bw/2, 0, cx + bw/2, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.42, `rgba(255,255,255,${a*.55})`); g.addColorStop(.5, `rgba(255,255,255,${a})`); g.addColorStop(.58, `rgba(255,255,255,${a*.55})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    sx.fillStyle = g; sx.fillRect(0, 0, w, h);
    const v = sx.createLinearGradient(0, 0, 0, h); for (let t = 0; t <= 1.001; t += .125) v.addColorStop(t, `rgba(0,0,0,${.5 + rnd()*.5})`);   // the plastic isn't flat: the streak comes and goes
    sx.globalCompositeOperation = 'destination-in'; sx.fillStyle = v; sx.fillRect(0, 0, w, h);
    x.save(); x.globalCompositeOperation = 'screen'; x.drawImage(s, 0, 0); x.restore();
  };
  x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = `rgba(255,255,255,${.05*m})`; x.fillRect(0, 0, w, h); x.restore();   // a little haze
  band(w*(.24 + rnd()*.1), Math.max(6, w*.28), Math.min(.95, .85*m));
  band(w*(.27 + rnd()*.04), Math.max(2, w*.05), Math.min(1, .9*m));                 // the hard core of the reflection
  band(w*.86, Math.max(3, w*.12), Math.min(.5, .32*m));
  x.save(); x.globalCompositeOperation = 'screen';
  for (let n = Math.round(h/12*m); n > 0; n--){ x.fillStyle = `rgba(255,255,255,${.2 + rnd()*.35})`; x.beginPath(); x.arc(rnd()*w, rnd()*h, .4 + rnd()*.9, 0, 7); x.fill(); }   // specks
  x.strokeStyle = `rgba(255,255,255,${.3*m})`; x.lineWidth = 1;
  for (let n = 3 + Math.floor(rnd()*4); n > 0; n--){ const y0 = h*rnd(), x0 = w*rnd(); x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + (rnd() - .5)*w*.7, y0 + h*(.01 + rnd()*.04)); x.stroke(); }   // scuffs
  x.fillStyle = `rgba(255,255,255,${Math.min(.8, .55*m)})`; x.fillRect(0, 0, w, Math.max(1.5, h*.003));   // where the jacket folds over the top
  x.restore();
}
function librarySpine(sp, b, k){
  const c = glossySpine(sp, k*.5), x = c.getContext('2d'), w = c.width, h = c.height, rnd = rngOf(hashStr(b.id + ':library')), m = k/.7;
  const [lw, lh] = libLabel(w, h), lx = (w - lw)/2 + (rnd() - .5)*w*.03, r = Math.min(6, lw*.08);
  const ly = sp.words ? h*(1 - .024) - lh : freeBand(sp, lh, .78, .985, 'low', 60);
  if (ly !== null){
    const label = () => rr(x, lx, ly, lw, lh, r);
    x.save(); x.shadowColor = 'rgba(0,0,0,.3)'; x.shadowBlur = 1.5; x.shadowOffsetY = .5; x.fillStyle = '#FBFAF5'; label(); x.fill(); x.restore();
    if (rnd() < .3){ x.strokeStyle = '#2F7FD8'; x.lineWidth = Math.max(1.2, lw*.04); rr(x, lx + lw*.06, ly + lw*.06, lw*.88, lh - lw*.12, r*.8); x.stroke(); }   // some libraries print a blue frame
    const gg = x.createLinearGradient(0, ly + lh*.55, 0, ly + lh); gg.addColorStop(0, 'rgba(95,85,65,0)'); gg.addColorStop(1, 'rgba(95,85,65,.2)'); x.fillStyle = gg; label(); x.fill();
    const lines = libraryLines(b, rnd), pad = lw*.13, font = s => `600 ${s}px "IBM Plex Sans", Arial, sans-serif`;
    let fs = Math.min(lw*.24, 22, lh*.7/(lines.length*1.15)); x.font = font(fs);
    const widest = Math.max(...lines.map(t => x.measureText(t).width)); if (widest > lw - 2*pad){ fs *= (lw - 2*pad)/widest; x.font = font(fs); }
    x.fillStyle = '#141414'; x.textAlign = 'left'; x.textBaseline = 'top';
    lines.forEach((t, i) => x.fillText(t, lx + pad, ly + lh*.12 + i*fs*1.15));
  }
  jacketGlare(x, w, h, m, rnd);                                            // over the label too: the jacket covers it
  return outline(c, sp);
}

// pencil on paper: graphite only catches the tops of the grain, so the strokes break up
let PENCIL = null;
function pencilGrain(){
  if (PENCIL) return PENCIL;
  const n = 128, c = blank(n, n), x = c.getContext('2d'), im = x.createImageData(n, n), r = rngOf(13);
  for (let i = 0; i < im.data.length; i += 4) im.data[i+3] = r() < .38 ? 255 : 0;
  x.putImageData(im, 0, 0); return PENCIL = c;
}
/* Secondhand Bookshop (refs: secondhand-*): the sun got to it (reds and magentas go pink first, then it all pales and tans),
   read hard (thin straight creases down the spine), rubbed at the edges, a pencil price, and on some a torn-off corner. */
function secondhandSpine(sp, b, k, slot){
  const w = sp.width, h = sp.height, c = copyOf(sp), rnd = rngOf(hashStr(b.id + ':second')), m = k/.7, film = b.kind === 'movie';
  const {x, im} = pixels(c), d = im.data, crum = texGrey('crumpled', w, h, rnd, .2, .2), sun = (.55 + rnd()*.45)*m;
  const tear = slot % 5 === 1 || rnd() < .2 ? {top: rnd() < .7, left: rnd() < .5, a: w*(.65 + rnd()*.3), b: w*(1 + rnd()*.7)} : null;
  let lumTop = 0, nTop = 0;
  for (let y = 0, p = 0; y < h; y++){
    const f = Math.min(1, sun*(.8 + .25*(1 - y/h)));                       // the top got a little more of it
    for (let X = 0; X < w; X++, p++){
      const i = p*4; if (!d[i+3]) continue;
      let r = d[i], g = d[i+1], bl = d[i+2];
      const warm = Math.max(0, r - g)/255;                                   // reds, magentas, oranges: the inks that go first
      g += (r - g)*Math.min(1, 1.2*warm*f); bl += (r - bl)*Math.min(1, .9*warm*f);
      const l = .299*r + .587*g + .114*bl, cv = [r, g, bl];
      for (let n = 0; n < 3; n++){ let v = l + (cv[n] - l)*(1 - .45*f); v += ([232, 220, 194][n] - v)*.32*f; d[i+n] = v; }
      const e = Math.min(X, w - 1 - X, y, h - 1 - y), fib = crum ? crum[p]/255 : .5;   // rubbed along the edges, where the fibres show
      if (e < 3){ const t = (1 - e/3)*.55*m*fib; d[i] += (226 - d[i])*t; d[i+1] += (218 - d[i+1])*t; d[i+2] += (198 - d[i+2])*t; }
      if (y < 3 && fib < .3*m) d[i+3] = 0;                                   // the head of the spine, a little chipped
      if (tear){
        const dx = tear.left ? X : w - 1 - X, dy = tear.top ? y : h - 1 - y, s = dx/tear.a + dy/tear.b - 1 + (fib - .5)*.3;
        if (s < 0){ d[i+3] = 0; continue; } else if (s < .14){ d[i] = 239; d[i+1] = 232; d[i+2] = 214; continue; }   // gone, with a pale torn edge
      }
      if (y > h*.05 && y < h*.12){ lumTop += .299*d[i] + .587*d[i+1] + .114*d[i+2]; nTop++; }
    }
  }
  x.putImageData(im, 0, 0);
  // reading creases: thin, straight, pale lines down most of the spine's length, fading in and out, now and then broken
  const creases = Math.round((film ? rnd()*1.5 : 1 + rnd()*3)*Math.min(1, m));
  for (let n = 0; n < creases; n++){
    const cx = Math.round(w*(.2 + rnd()*.6)) + .5, lean = (rnd() - .5)*1.2, y0 = h*(.02 + rnd()*.08), y1 = h*(.9 + rnd()*.08);
    x.save(); x.setLineDash([h*(.2 + rnd()*.4), 3 + rnd()*8]); x.lineDashOffset = rnd()*h*.2; x.lineWidth = 1;
    for (const [dx, col, a] of [[1, '0,0,0', Math.min(.3, .2*m)], [0, '250,246,236', Math.min(.9, .75*m)]]){
      const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(.08, `rgba(${col},${a})`); g.addColorStop(.92, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      x.strokeStyle = g; x.beginPath(); x.moveTo(cx + dx, y0); x.lineTo(cx + dx + lean, y1); x.stroke();
    }
    x.restore();
  }
  // a pencil price, written across the spine near the top (or the foot, if the top is torn): graphite shows light on dark covers
  if (slot % 5 !== 2 || rnd() < .5) pencil: {
    const price = ['£3', '£2.50', '£4', '£1.50', '£5', '£6', '£2'][Math.floor(rnd()*7)], dark = nTop && lumTop/nTop < 110;
    const fs = fitFont(x, price, HAND, Math.min(w*.5, 40), w*.86), top = freeBand(sp, fs*1.4, tear && tear.top ? .25 : .03, .97, tear && tear.top ? 'low' : 'high', 60), y = top === null ? null : top + fs*.7;
    if (y === null) break pencil;
    const s = scratch(4, w, h), sx = s.getContext('2d');
    sx.translate(w/2, y); sx.rotate(-.1 + (rnd() - .5)*.16); sx.font = HAND(fs); sx.textAlign = 'center'; sx.textBaseline = 'middle';
    sx.fillStyle = dark ? '#D6D6D6' : '#3F4043'; sx.fillText(price, 0, 0);
    sx.lineWidth = Math.max(1, fs*.05); sx.strokeStyle = sx.fillStyle; sx.beginPath(); sx.moveTo(-fs*.6, fs*.55); sx.lineTo(fs*.55, fs*.5); sx.stroke();   // underlined
    sx.setTransform(1, 0, 0, 1, 0, 0); texOver(sx, pencilGrain(), w, h, rnd, 'destination-out', .8, 1);
    x.save(); x.globalAlpha = .95; x.drawImage(s, 0, 0); x.restore();
  }
  return c;   // no outline(): the torn corners let the background through
}

/* Clothbound: cloth in a clear mid-tone of the spine's own colour with a real plain weave, one simple repeating pattern
   printed in a second ink at head and foot (diamonds, leaves, dots, chevrons or feathers), and the title and author
   in pale gold on a plain band between two gold rules, so they read. */
function hsl(r, g, b){
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn)/2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d/(1 - Math.abs(2*l - 1)), h = mx === r ? ((g - b)/d + 6) % 6 : mx === g ? (b - r)/d + 2 : (r - g)/d + 4;
  return [h*60, s, l];
}
const hslCss = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s*100)}% ${Math.round(l*100)}%)`;
const FOIL = ['#B38C3A', '#F4DA86', '#DDBB5E', '#FFF2C0', '#C29C48'];   // pale, bright gold: champagne in the light, never brown
// plain weave: 3px threads going over and under, each crossing a little rounded bump, each thread its own tone
let WEAVE = null;
function weaveTile(){
  if (WEAVE) return WEAVE;
  const T = 3, n = 96, c = blank(n, n), x = c.getContext('2d'), im = x.createImageData(n, n), r = rngOf(21);
  const warp = Array.from({length: n/T}, () => (r() - .5)*26), weft = Array.from({length: n/T}, () => (r() - .5)*26);
  for (let y = 0; y < n; y++) for (let X = 0; X < n; X++){
    const cx = Math.floor(X/T), cy = Math.floor(y/T), up = (cx + cy) % 2 === 0;
    const across = ((up ? X : y) % T + .5)/T, along = ((up ? y : X) % T + .5)/T;
    const v = 128 + (Math.sin(across*Math.PI)*.65 + Math.sin(along*Math.PI)*.35 - .6)*110 + (up ? warp[cx] : weft[cy]) + (r() - .5)*14, i = (y*n + X)*4;
    im.data[i] = im.data[i+1] = im.data[i+2] = v; im.data[i+3] = 255;
  }
  x.putImageData(im, 0, 0); return WEAVE = c;
}
const MOTIFS = {
  dots(x, w, y0, y1, u){ for (let y = y0 + u*.5, row = 0; y < y1 + u; y += u*1.05, row++) for (const f of row % 2 ? [.33, .67] : [.15, .5, .85]){ x.beginPath(); x.arc(w*f, y, u*.2, 0, 7); x.fill(); } },
  diamonds(x, w, y0, y1, u){
    for (let y = y0, row = 0; y < y1 + u; y += u*1.1, row++){
      for (const f of row % 2 ? [0, 1] : [.5]){ const cx = w*f, hw = w*.26, hh = u*.55; x.beginPath(); x.moveTo(cx, y - hh); x.lineTo(cx + hw, y); x.lineTo(cx, y + hh); x.lineTo(cx - hw, y); x.closePath(); x.fill(); }
    }
  },
  chevrons(x, w, y0, y1, u){ x.lineWidth = u*.22; x.lineJoin = 'miter'; for (let y = y0 - u; y < y1 + u; y += u*.85){ x.beginPath(); x.moveTo(-2, y); x.lineTo(w/2, y + u*.55); x.lineTo(w + 2, y); x.stroke(); } },
  leaves(x, w, y0, y1, u){
    x.lineWidth = Math.max(1, u*.07); x.beginPath(); x.moveTo(w/2, y0); x.lineTo(w/2, y1); x.stroke();
    for (let y = y0 + u*.4, n = 0; y < y1 + u; y += u*.75, n++){ const s = n % 2 ? 1 : -1; x.save(); x.translate(w/2, y); x.rotate(s*.75); x.beginPath(); x.ellipse(s*u*.02, -u*.42, u*.17, u*.42, 0, 0, 7); x.fill(); x.restore(); }
  },
  feathers(x, w, y0, y1, u){
    x.lineWidth = Math.max(.8, u*.06); x.lineCap = 'round';
    for (let y = y0 + u*.2; y < y1; y += u*2.6){
      x.beginPath(); x.moveTo(w/2, y); x.lineTo(w/2, y + u*2.3); x.stroke();
      for (let t = .06; t < 1; t += .1){ const L = w*.34*Math.sin(t*Math.PI), yy = y + u*2.3*t; x.beginPath(); x.moveTo(w/2 - L, yy - u*.3); x.lineTo(w/2, yy); x.lineTo(w/2 + L, yy - u*.3); x.stroke(); }
    }
  },
};
function clothSpine(sp, b, k){
  const w = sp.width, h = sp.height, c = blank(w, h), x = c.getContext('2d'), m = k/.7, rnd = rngOf(hashStr(b.id + ':cloth'));
  const one = blank(1, 1), ox = one.getContext('2d', {willReadFrequently:true}); ox.drawImage(sp, 0, 0, 1, 1);
  const [H0, S0, L0] = hsl(...ox.getImageData(0, 0, 1, 1).data), S1 = Math.max(.22, Math.min(.6, S0*1.1)), L1 = Math.max(.32, Math.min(.58, L0));
  const cloth = hslCss(H0, S1, L1), ink = hslCss(H0 + (rnd() < .5 ? 0 : 150), Math.min(.7, S1 + .12), L1 > .45 ? L1 - .27 : L1 + .3);
  x.fillStyle = cloth; x.fillRect(0, 0, w, h);
  const bandTop = h*.25, bandEnd = h*.8, u = Math.max(8, w*.3);
  x.save(); x.fillStyle = ink; x.strokeStyle = ink;                         // the pattern, in the second ink, at head and foot
  const names = Object.keys(MOTIFS), motif = MOTIFS[names[hashStr(b.id + ':motif') % names.length]];
  for (const [y0, y1] of [[h*.015, bandTop - h*.018], [bandEnd + h*.018, h*.985]]){ x.save(); x.beginPath(); x.rect(0, y0, w, y1 - y0); x.clip(); motif(x, w, y0, y1, u); x.restore(); }
  x.restore();
  // the weave over everything: ink printed on cloth sits in the weave too
  x.save(); x.globalCompositeOperation = 'overlay'; x.globalAlpha = Math.min(1, .75*m); x.fillStyle = x.createPattern(weaveTile(), 'repeat'); x.fillRect(0, 0, w, h); x.restore();
  const gold = x.createLinearGradient(0, 0, w, 0); FOIL.forEach((col, i) => gold.addColorStop([0, .3, .5, .72, 1][i], col));
  const rule = y => { x.fillStyle = gold; x.fillRect(w*.1, y, w*.8, Math.max(1.5, h*.003)); };
  rule(bandTop - h*.004); rule(bandEnd);
  const title = (b.title || '').toUpperCase(), author = (b.author || '').toUpperCase(), serif = fs => `600 ${fs}px "Cormorant Garamond", Georgia, serif`;
  const letter = (text, from, to, maxFs) => {
    if (!text.trim()) return;
    const fs = fitFont(x, text, serif, maxFs, to - from);
    x.save(); x.translate(w/2, 0); x.rotate(Math.PI/2); x.textBaseline = 'middle'; x.textAlign = 'center'; x.font = serif(fs);
    x.fillStyle = 'rgba(0,0,0,.45)'; x.fillText(text, (from + to)/2 + 1, 1.5);                 // pressed into the cloth
    const gv = x.createLinearGradient(0, -fs/2, 0, fs/2); gv.addColorStop(0, '#C9A247'); gv.addColorStop(.42, '#FFF3C4'); gv.addColorStop(.6, '#EFD27A'); gv.addColorStop(1, '#B8913C');
    x.fillStyle = gv; x.fillText(text, (from + to)/2, 0); x.restore();
  };
  letter(title, bandTop + h*.03, h*.63, w*.48); letter(author, h*.66, bandEnd - h*.025, w*.3);
  shade(x, w, h);
  return outline(c, sp);
}

/* Flash (refs: flash-*): one bare flash from the camera. Everything close is blown out and flattened, with a hard glare
   on each glossy spine; the light falls off fast, so the ends go dark; a dark spine-shaped shadow is thrown down and to
   the right, and the frame gets a light vignette (both in renderStory). */
function flashSpine(sp, b, k){
  const c = copyOf(sp), {x, im} = pixels(c), d = im.data, m = k/.7, w = c.width, h = c.height, rnd = rngOf(hashStr(b.id + ':flash'));
  for (let i = 0; i < d.length; i += 4){
    if (!d[i+3]) continue;
    const l = .299*d[i] + .587*d[i+1] + .114*d[i+2];
    for (let n = 0; n < 3; n++){ const v = l + (d[i+n] - l)*(1 - .18*m); d[i+n] = v*(1 + .3*m) + 26*m; }   // overexposed, the colour thinned
  }
  x.putImageData(im, 0, 0);
  // the flash bouncing straight back off the cover: a hard white streak, brightest at the middle of the spine
  const cx = w*(.36 + rnd()*.14), bw = Math.max(4, w*.16), a = Math.min(.9, (.45 + rnd()*.3)*m);
  const s = scratch(4, w, h), sx = s.getContext('2d'), g = sx.createLinearGradient(cx - bw/2, 0, cx + bw/2, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.35, `rgba(255,255,255,${a*.7})`); g.addColorStop(.5, `rgba(255,255,255,${a})`); g.addColorStop(.65, `rgba(255,255,255,${a*.7})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  sx.fillStyle = g; sx.fillRect(0, 0, w, h);
  const v = sx.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,.1)'); v.addColorStop(.55, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,.15)');
  sx.globalCompositeOperation = 'destination-in'; sx.fillStyle = v; sx.fillRect(0, 0, w, h);
  x.save(); x.globalCompositeOperation = 'screen'; x.drawImage(s, 0, 0); x.restore();
  return outline(c, sp);
}
function flashVignette(x, k){
  const m = k/.7, g = x.createRadialGradient(W/2, H*.56, H*.3, W/2, H*.56, H*.8);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${Math.min(.42, .26*m)})`);
  x.save(); x.fillStyle = g; x.fillRect(0, 0, W, H); x.restore();
}

/* ---------- Pro 7-10: Film Roll, Riso Print, Xerox Zine, Night Shelf. Spines only. ---------- */
// a seeded noise field, 2px grains, for the printed looks
let NOISE = null;
function noiseAt(X, y){
  if (!NOISE){ const r = rngOf(17); NOISE = Float32Array.from({length: 128*128}, () => r()); }
  return NOISE[((y >> 1) & 127)*128 + ((X >> 1) & 127)];
}

/* Film Roll: shot on colour negative: blacks lifted with a teal cast, warm highlights, a red halation glow round the
   bright parts, visible grain, a few specks of dust, and on some spines an orange light leak from the top of the roll. */
function filmSpine(sp, b, k, slot){
  const c = copyOf(sp), {x, im} = pixels(c), d = im.data, m = Math.min(1.4, k/.7), w = c.width, h = c.height, rnd = rngOf(hashStr(b.id + ':film'));
  for (let i = 0; i < d.length; i += 4){
    if (!d[i+3]) continue;
    const l = .299*d[i] + .587*d[i+1] + .114*d[i+2], t = l/255, sh = (1 - t)*(1 - t);
    for (let n = 0; n < 3; n++){ let v = l + (d[i+n] - l)*(1 + .1*m); v = 255*(t < .5 ? 2*t*t : 1 - 2*(1 - t)*(1 - t))*.25*m + v*(1 - .25*m); d[i+n] = 20*m + v*(1 - 20*m/255); }
    d[i] += (10*t*t - 6*sh)*m; d[i+1] += 6*sh*m; d[i+2] += (12*sh - 14*t*t)*m;   // teal shadows, warm highlights
  }
  x.putImageData(im, 0, 0);
  // halation: the bright parts, blurred (small and back up), laid over in red
  const sw = Math.max(2, Math.ceil(w/6)), shh = Math.max(2, Math.ceil(h/6)), s = scratch(4, sw, shh), sx = s.getContext('2d', {willReadFrequently:true});
  sx.drawImage(c, 0, 0, sw, shh);
  const hi = sx.getImageData(0, 0, sw, shh), hd = hi.data;
  for (let i = 0; i < hd.length; i += 4){ const l = .299*hd[i] + .587*hd[i+1] + .114*hd[i+2], a = Math.max(0, (l - 175)/80); hd[i] = 255; hd[i+1] = 70; hd[i+2] = 30; hd[i+3] = 255*Math.min(1, a)*hd[i+3]/255; }
  sx.putImageData(hi, 0, 0);
  x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = Math.min(.8, .5*m); x.imageSmoothingQuality = 'high'; x.drawImage(s, -w*.03, -h*.005, w*1.06, h*1.01); x.restore();
  texOver(x, grainTile2(), w, h, rnd, 'overlay', Math.min(1, .7*m), 1);
  if (slot % 4 === 2){                                                     // a light leak from the end of the roll
    const lx = w*rnd(), g = x.createRadialGradient(lx, 0, 0, lx, 0, Math.max(w*2.2, h*.28));
    g.addColorStop(0, `rgba(255,150,60,${Math.min(.9, .75*m)})`); g.addColorStop(.4, `rgba(255,70,40,${Math.min(.5, .35*m)})`); g.addColorStop(1, 'rgba(255,40,30,0)');
    x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.fillRect(0, 0, w, h); x.restore();
  }
  x.save(); x.fillStyle = 'rgba(255,255,250,.7)';
  for (let n = Math.round(h/260*m); n > 0; n--){ x.beginPath(); x.arc(rnd()*w, rnd()*h, .5 + rnd()*1.1, 0, 7); x.fill(); }   // dust
  x.restore();
  return outline(c, sp);
}

/* Riso Print: re-printed in two riso inks on off-white paper, medium blue for the darks and fluorescent pink for the
   warm colours, grainy, where they overlap they make purple, and the pink is printed a little out of register. */
const RISO_PAPER = [245, 240, 228], RISO_BLUE = [0, 120, 191], RISO_PINK = [255, 72, 176];
function risoSpine(sp, b, k){
  const c = copyOf(sp), {x, im} = pixels(c), d = im.data, src = d.slice(), m = Math.min(1, k/.7), w = c.width, h = c.height;
  const off = Math.max(1, Math.round(w*.03)), offY = off + 1;
  const ink = (D, n) => Math.max(0, Math.min(1, (D - .5)*1.7 + .5 + (n - .5)*.6));
  for (let y = 0, p = 0; y < h; y++) for (let X = 0; X < w; X++, p++){
    const i = p*4; if (!d[i+3]) continue;
    const r = src[i], g = src[i+1], bl = src[i+2], l = (.299*r + .587*g + .114*bl)/255;
    const j = (Math.max(0, Math.min(h - 1, y - offY))*w + Math.max(0, Math.min(w - 1, X - off)))*4, l2 = (.299*src[j] + .587*src[j+1] + .114*src[j+2])/255;
    const warm = Math.max(0, (r - g)/255), blue = ink(Math.min(1, 1.1*(1 - l) + .35*Math.max(0, (bl - r)/255) - .9*warm), noiseAt(X, y));   // the pink carries the warm colours
    const pink = ink(Math.min(1, 1.5*Math.max(0, (src[j] - src[j+1])/255) + .25*(1 - l2)), noiseAt(X + 37, y + 91));
    for (let n = 0; n < 3; n++){
      const v = RISO_PAPER[n]*(1 - blue*(1 - RISO_BLUE[n]/255))*(1 - pink*(1 - RISO_PINK[n]/255));
      d[i+n] = src[i+n] + (v - src[i+n])*m;
    }
  }
  x.putImageData(im, 0, 0);
  texOver(x, texture('paper'), w, h, rngOf(hashStr(b.id + ':riso')), 'multiply', .2*m, Math.max(.3, w/300));
  return outline(c, sp);
}

/* Xerox Zine: photocopied: black and white, hard contrast, toner specks and dropouts, a dark band down the edges where
   the copier lid didn't close, a drum streak, and on some a piece of clear tape holding it in the zine. */
function xeroxSpine(sp, b, k, slot){
  const c = copyOf(sp), {x, im} = pixels(c), d = im.data, m = Math.min(1, k/.7), w = c.width, h = c.height, rnd = rngOf(hashStr(b.id + ':xerox'));
  const edge = Math.max(2, w*.07);
  for (let y = 0, p = 0; y < h; y++) for (let X = 0; X < w; X++, p++){
    const i = p*4; if (!d[i+3]) continue;
    const l = .299*d[i] + .587*d[i+1] + .114*d[i+2], n = noiseAt(X, y), n2 = NOISE[(y*131 + X*7) & 16383];
    let v = (l - 120)*2.4 + 128 + (n - .5)*50;
    const e = Math.min(X, w - 1 - X); if (e < edge) v *= .45 + .55*e/edge;
    if (n2 < .004) v = 20; else if (v < 90 && n2 > .975) v = 230;         // toner specks, and where it didn't take
    v = Math.max(18, Math.min(242, v));
    for (let c2 = 0; c2 < 3; c2++) d[i+c2] = d[i+c2] + (v + [1, 1, -3][c2] - d[i+c2])*m;
  }
  x.putImageData(im, 0, 0);
  x.fillStyle = `rgba(0,0,0,${.22*m})`; x.fillRect(Math.round(w*(.2 + rnd()*.6)), 0, 1, h);   // a line from a scratch on the drum
  if (slot % 3 === 1){                                                     // clear tape across the top
    x.save(); x.translate(w/2, h*(.08 + rnd()*.06)); x.rotate((rnd() - .5)*.3);
    const tw = w*1.4, th = Math.max(10, w*.42);
    x.fillStyle = `rgba(255,252,236,${.4*m})`; x.fillRect(-tw/2, -th/2, tw, th);
    x.fillStyle = `rgba(255,255,255,${.35*m})`; x.fillRect(-tw/2, -th/2, tw, 1.5); x.fillRect(-tw/2, th/2 - 1.5, tw, 1.5);
    x.restore();
  }
  return outline(c, sp);
}

/* Night Shelf: the room is dark and one warm lamp is on above and to the left: the spines go dim and blue, the lamp
   lights a warm pool across them (in bookLight), and each spine catches a thin line of lamp light on its left edge. */
function nightSpine(sp, k){
  const c = copyOf(sp), {x, im} = pixels(c), d = im.data, m = Math.min(1, k/.7), w = c.width, h = c.height;
  for (let i = 0; i < d.length; i += 4){
    if (!d[i+3]) continue;
    const l = .299*d[i] + .587*d[i+1] + .114*d[i+2];
    for (let n = 0; n < 3; n++){ const v = l + (d[i+n] - l)*(1 - .35*m); d[i+n] = v*(1 - .62*m) + [4, 8, 22][n]*m; }
  }
  x.putImageData(im, 0, 0);
  const g = x.createLinearGradient(0, 0, Math.max(2, w*.08), 0); g.addColorStop(0, `rgba(255,190,120,${.5*m})`); g.addColorStop(1, 'rgba(255,190,120,0)');
  x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.fillRect(0, 0, w, h); x.restore();
  return outline(c, sp);
}

/* the light on the books: Rental Shop's green tube above; Flash's hot middle and fast falloff; Night Shelf's lamp */
function bookLight(f, x, rects, k){
  if (!rects.length || !['rental', 'flash', 'night'].includes(f)) return;
  const m = k/.7, x0 = Math.min(...rects.map(r => r.x)), x1 = Math.max(...rects.map(r => r.x + r.w)), y0 = Math.min(...rects.map(r => r.y)), y1 = Math.max(...rects.map(r => r.y + r.h));
  x.save(); x.beginPath(); for (const r of rects) x.rect(r.x, r.y, r.w, r.h); x.clip();
  if (f === 'rental'){
    const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(170,255,200,${.3*m})`); g.addColorStop(.55, 'rgba(170,255,200,0)');
    x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.fillRect(x0, y0, x1 - x0, y1 - y0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = `rgba(215,240,220,${.35*m})`; x.fillRect(x0, y0, x1 - x0, y1 - y0);
  } else if (f === 'flash'){
    const cx = (x0 + x1)/2, cy = y0 + (y1 - y0)*.56, R = Math.max(x1 - x0, y1 - y0)*.72;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, `rgba(255,255,255,${Math.min(.8, .5*m)})`); g.addColorStop(.3, `rgba(255,255,255,${Math.min(.5, .24*m)})`); g.addColorStop(.62, 'rgba(255,255,255,0)');
    x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.fillRect(x0, y0, x1 - x0, y1 - y0);
    const v = x.createRadialGradient(cx, cy, R*.28, cx, cy, R); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(.6, `rgba(0,0,0,${Math.min(.5, .3*m)})`); v.addColorStop(1, `rgba(0,0,0,${Math.min(.9, .72*m)})`);
    x.globalCompositeOperation = 'source-over'; x.fillStyle = v; x.fillRect(x0, y0, x1 - x0, y1 - y0);
  } else {
    const lx = x0 + (x1 - x0)*.22, ly = y0 + (y1 - y0)*.2, R = Math.max(x1 - x0, y1 - y0)*.8;
    const g = x.createRadialGradient(lx, ly, 0, lx, ly, R); g.addColorStop(0, `rgba(255,196,120,${Math.min(.85, .62*m)})`); g.addColorStop(.35, `rgba(255,170,90,${Math.min(.45, .3*m)})`); g.addColorStop(1, 'rgba(255,150,80,0)');
    x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.fillRect(x0, y0, x1 - x0, y1 - y0);
    const v = x.createRadialGradient(lx, ly, R*.4, lx, ly, R*1.2); v.addColorStop(0, 'rgba(6,8,20,0)'); v.addColorStop(1, `rgba(6,8,20,${Math.min(.7, .5*m)})`);
    x.globalCompositeOperation = 'source-over'; x.fillStyle = v; x.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  x.restore();
}
/* Flash: the camera's orange date stamp, bottom right, 7-segment digits: '26 09 29 for today */
function dateStamp(x){
  const now = new Date(), p2 = n => String(n).padStart(2, '0'), text = `'${p2(now.getFullYear() % 100)} ${p2(now.getMonth() + 1)} ${p2(now.getDate())}`;
  const SEG = {0:'abcdef', 1:'bc', 2:'abged', 3:'abgcd', 4:'fgbc', 5:'afgcd', 6:'afgedc', 7:'abc', 8:'abcdefg', 9:'abcdfg'};
  const dh = 50, dw = 26, t = 6, gap = 10, space = 16;
  let wAll = 0; for (const ch of text) wAll += ch === ' ' ? space : ch === "'" ? 12 : dw + gap;
  let cx = W - 90 - wAll; const top = 1770;
  x.save(); x.fillStyle = '#FF8A24'; x.shadowColor = 'rgba(255,110,20,.8)'; x.shadowBlur = 10; x.globalAlpha = .92;
  const seg = (s, X, Y) => {
    const r = {a:[X + t, Y, dw - 2*t, t], d:[X + t, Y + dh - t, dw - 2*t, t], g:[X + t, Y + dh/2 - t/2, dw - 2*t, t],
               f:[X, Y + t, t, dh/2 - t*1.5], b:[X + dw - t, Y + t, t, dh/2 - t*1.5], e:[X, Y + dh/2 + t/2, t, dh/2 - t*1.5], c:[X + dw - t, Y + dh/2 + t/2, t, dh/2 - t*1.5]}[s];
    x.fillRect(...r);
  };
  for (const ch of text){
    if (ch === ' '){ cx += space; continue; }
    if (ch === "'"){ x.fillRect(cx + 2, top, t, dh*.3); cx += 12; continue; }
    for (const s of SEG[ch]) seg(s, cx, top);
    cx += dw + gap;
  }
  x.restore();
}
/* the Wood shelf background option: a plank of the wood texture under the spines, on any background colour */
function woodShelf(x, base){
  const img = texture('wood'), y = base, hh = 54;
  x.save();
  if (img){ const pat = x.createPattern(img, 'repeat'); if (pat.setTransform) pat.setTransform(new DOMMatrix().scaleSelf(.7, .7)); x.fillStyle = pat; x.fillRect(40, y, W - 80, hh);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = '#A8764C'; x.fillRect(40, y, W - 80, hh); x.globalCompositeOperation = 'source-over'; }
  else { x.fillStyle = '#8A6040'; x.fillRect(40, y, W - 80, hh); }
  const g = x.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, 'rgba(255,236,210,.22)'); g.addColorStop(.16, 'rgba(255,236,210,0)'); g.addColorStop(1, 'rgba(0,0,0,.3)');
  x.fillStyle = g; x.fillRect(40, y, W - 80, hh);
  const sh = x.createLinearGradient(0, y + hh, 0, y + hh + 56); sh.addColorStop(0, 'rgba(0,0,0,.22)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = sh; x.fillRect(40, y + hh, W - 80, 56);
  x.restore();
}
/* the Floating shelf (Pro): a plain plank exactly as wide as its books (plus a little), in one colour. Its top face,
   front edge and the shadows it throws are all shaded from that colour. The books stand on the top face at base. */
const tint = (hx, t) => { const [r, g, b] = rgb(hx), to = t > 0 ? 255 : 0, a = Math.abs(t); return hex(r + (to - r)*a, g + (to - g)*a, b + (to - b)*a); };
function floatingShelf(x, x0, x1, base, colour = '#FFFFFF'){
  const back = base - 12, front = base + 5, edge = 24, w = x1 - x0;
  x.save();
  // the shadow on the wall: soft and wide under the shelf, and a tighter one right under the front edge
  x.shadowColor = 'rgba(0,0,0,.26)'; x.shadowBlur = 44; x.shadowOffsetY = 26; x.fillStyle = tint(colour, -.2); x.fillRect(x0 + 10, front, w - 20, edge);
  x.shadowColor = 'rgba(0,0,0,.22)'; x.shadowBlur = 8; x.shadowOffsetY = 5; x.fillRect(x0 + 2, front, w - 4, edge);
  x.restore();
  x.save();
  // top face, seen a little from above: narrower at the back, lighter towards the front
  const g = x.createLinearGradient(0, back, 0, front); g.addColorStop(0, tint(colour, -.1)); g.addColorStop(1, tint(colour, .06));
  x.fillStyle = g; x.beginPath(); x.moveTo(x0 + 9, back); x.lineTo(x1 - 9, back); x.lineTo(x1, front); x.lineTo(x0, front); x.closePath(); x.fill();
  // front edge: the colour itself, a little darker at the bottom, with a fine light line where it meets the top
  const e = x.createLinearGradient(0, front, 0, front + edge); e.addColorStop(0, tint(colour, -.03)); e.addColorStop(1, tint(colour, -.14));
  x.fillStyle = e; x.fillRect(x0, front, w, edge);
  x.fillStyle = tint(colour, .35); x.fillRect(x0, front, w, 1.5);
  x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(x0, front + edge - 1.5, w, 1.5);
  x.restore();
}
// how worn each tape on this shelf is: about 1 in 4 almost clean, most medium, one heavily worn
function wearLevels(n, rnd){
  const lv = Array.from({length: n}, () => rnd() < .25 ? .08 : .45 + rnd()*.25);
  if (n) lv[Math.floor(rnd()*n)] = 1;
  return lv;
}
const WORN = new Map();   // spines already made for a filter, so typing a caption doesn't make them all again
function spineFor(b, w, h, f, k, fast, level, slot = 0){
  if (f === 'clean') return makeSpine(b, w, h);
  const key = [f, b.id, b.title, b.author, b.style, b.font, b.bg, b.fg, b.choice, b.spineImg && b.spineImg.width, Math.round(w), Math.round(h), level, k, fast, slot].join('|');
  if (WORN.has(key)) return WORN.get(key);
  const sp = makeSpine(b, w, h, f === 'library' ? libFoot(w, h) : 0);
  const c = f === 'vhs' ? wornSpine(sp, b, Math.min(1, level*k/.7), fast) : f === 'rental' ? rentalSpine(sp, b, level, k, fast, slot)
    : f === 'faded' ? fadedSpine(sp, k) : f === 'glossy' ? glossySpine(sp, k) : f === 'grain' ? grainSpine(sp, k)
    : f === 'library' ? librarySpine(sp, b, k) : f === 'secondhand' ? secondhandSpine(sp, b, k, slot) : f === 'cloth' ? clothSpine(sp, b, k)
    : f === 'flash' ? flashSpine(sp, b, k) : f === 'film' ? filmSpine(sp, b, k, slot) : f === 'riso' ? risoSpine(sp, b, k)
    : f === 'xerox' ? xeroxSpine(sp, b, k, slot) : f === 'night' ? nightSpine(sp, k) : sp;
  if (WORN.size > 80) WORN.clear();
  WORN.set(key, c); return c;
}

/* ---------- story ---------- */
function wrapText(x, text, maxW){ const words = text.split(/\s+/), lines = []; let line = ''; for (const wd of words){ const t = line ? line+' '+wd : wd; if (x.measureText(t).width > maxW && line){ lines.push(line); line = wd; } else line = t; } if (line) lines.push(line); return lines.slice(0,3); }
function sizes(H0, U, list, settings){
  // width and height of each spine before fitting to the 900px row
  return list.map(b => {
    if (isReal(b)) return {w: H0 * b.spineImg.width / b.spineImg.height, h: H0};
    if (isCover(b)){ const h = H0*.62; return {w: h * b.img.width / b.img.height, h}; }
    if (isCase(b)) return {w: Math.min(U*.58, H0/11), h: H0};
    return {w: U*b.wf, h: H0*(settings.varied ? b.hf : 1)};
  });
}
/* Draws the story on x (the preview, or a small filter thumbnail through a scaled context), on the chosen
   background, with the chosen filter on the books.
   Spines stand packed like books on a shelf: 0-2px apart, a thin dark line where two meet. */
/* bare: just the books and their shelf, on nothing (the profile page draws a shelf on its own white page): no
   background, caption, watermark, or Flash's vignette and date stamp, which belong to the photo, not the shelf.
   art (Pro): the user's own wall, a 1080 x 1920 picture used when the background is 'wall' (with dark: whether it's a
   dark picture, for the caption and shadows), and their PNGs, each {img, x, y, w}: the middle and the width as fractions
   of the story. Always in this order: wall, PNGs, shelf, books.
   Returns where the caption ends and the books begin (y in the story, booksTop null with no books), so the builder
   can put a new PNG on the open wall between them. */
const WALL_LIGHT = {bg:'#FFFFFF', ink:'#0F1419', mark:'rgba(15,20,25,.5)'}, WALL_DARK = {bg:'#000000', ink:'#F1F2F4', mark:'rgba(241,242,244,.55)'};
function renderStory(x, f, fast, books, settings, bare = false, art = {}){
  const wall = settings.theme === 'wall' && art.wall ? art.wall : null;
  const k = settings.intensity/100, T = wall ? (art.wallDark ? WALL_DARK : WALL_LIGHT) : THEMES[settings.theme] || THEMES.paper, shelfSeed = hashStr(books.map(b => b.id).join('|')), rnd = rngOf(shelfSeed ^ hashStr(f)), levels = wearLevels(books.length, rngOf(shelfSeed ^ 99));
  x.clearRect(0,0,W,H);
  if (!bare){
    if (wall) x.drawImage(wall, 0, 0, W, H); else { x.fillStyle = T.bg; x.fillRect(0,0,W,H); }
    for (const p of art.pngs || []){ const w = p.w*W, h = w*p.img.height/p.img.width; x.drawImage(p.img, p.x*W - w/2, p.y*H - h/2, w, h); }
  }
  x.fillStyle = T.ink; x.font = '500 52px "Geist Mono", ui-monospace, monospace'; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  let y = 290; if (!bare && settings.caption.trim()) for (const ln of wrapText(x, settings.caption, 900)){ x.fillText(ln, 90, y); y += 68; }
  const captionBottom = y === 290 ? 150 : y - 50; let booksTop = null;
  const base = 1700;
  // Spines: up to 10 stand in one row; more (Pro holds 20) in two rows of up to 10, the upper one a little fuller
  const twoRows = settings.layout === 'row' && books.length > 10, bases = twoRows ? [1060, 1720] : [base], H0 = twoRows ? 530 : 1160;
  if (settings.wood && settings.layout !== 'covers') for (const b0 of bases) woodShelf(x, b0);
  const floating = !!settings.plank && !settings.wood && settings.layout !== 'covers';
  const dark = wall ? !!art.wallDark : settings.theme === 'ink' || settings.theme === 'dark' || settings.theme === 'forest', shadow = dark ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.15)', flashShadow = `rgba(0,0,0,${Math.min(.92, (dark ? .85 : .7)*k/.7)})`, seam = dark ? 'rgba(0,0,0,.7)' : 'rgba(0,0,0,.4)';
  if (books.length && settings.layout === 'covers'){
    const n = books.length, cols = n === 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4, rows = Math.ceil(n/cols), gap = 30, top = Math.max(y+30, 400), bottom = 1780;
    const cellW = Math.min(n === 1 ? 760 : 900, (900 - gap*(cols-1))/cols), cellH = (bottom - top - gap*(rows-1))/rows;
    const sz = books.map(b => { const k2 = Math.min(cellW/b.img.width, cellH/b.img.height); return [b.img.width*k2, b.img.height*k2]; });
    const rowH = []; for (let r = 0; r < rows; r++) rowH.push(Math.max(...sz.slice(r*cols, r*cols+cols).map(z => z[1])));
    let cy = top + ((bottom-top) - (rowH.reduce((a,v) => a+v, 0) + gap*(rows-1)))/2; booksTop = cy;
    for (let r = 0; r < rows; r++){
      const items = books.slice(r*cols, r*cols+cols), s2 = sz.slice(r*cols, r*cols+cols); let cx = (W - (s2.reduce((a,z) => a+z[0], 0) + gap*(items.length-1)))/2;
      items.forEach((b,i) => { const [w,h] = s2[i], dy = cy + rowH[r] - h; x.save(); x.shadowColor = shadow; x.shadowBlur = 30; x.shadowOffsetY = 12; x.fillStyle = '#000'; rr(x,cx,dy,w,h,10); x.fill(); x.restore(); x.save(); rr(x,cx,dy,w,h,10); x.clip(); x.drawImage(b.img,cx,dy,w,h); x.restore(); cx += w + gap; });
      cy += rowH[r] + gap;
    }
  } else if (books.length && settings.layout === 'row'){
    const split = twoRows ? Math.ceil(books.length/2) : books.length;
    const rows = (twoRows ? [books.slice(0, split), books.slice(split)] : [books]).map((list, r) => {
      const at = r ? split : 0, rb = bases[r];
      const s = sizes(H0, (books.length <= 2 ? 220 : 165)*H0/1160, list, settings);
      // Worn VHS: tapes are all one height, give or take 2 %
      if (f === 'vhs' || f === 'rental') s.forEach((z,i) => { if (isCover(list[i])) return; const h1 = H0*(1 + (rnd() - .5)*.04); if (isReal(list[i])) z.w *= h1/z.h; z.h = h1; });
      const gaps = list.map(() => rnd()*2);   // packed: 0-2px apart
      const room = 900 - gaps.slice(1).reduce((a,v) => a+v, 0), sumW = s.reduce((a,z) => a+z.w, 0);
      if (sumW > room){ const k2 = room/sumW; s.forEach((z,i) => { z.w *= k2; if (isCover(list[i])) z.h *= k2; else if (isReal(list[i]) || isCase(list[i])) z.h *= Math.max(k2, .75); }); }
      const sps = list.map((b,i) => spineFor(b, s[i].w, s[i].h, f, k, fast, levels[at + i], at + i));
      const width = sps.reduce((a,sp) => a + sp.width, 0) + gaps.slice(1).reduce((a,v) => a+v, 0);
      let cx = (W - width)/2;
      const placed = sps.map((sp,i) => { if (i) cx += gaps[i]; const p = {x:cx, w:sp.width, h:sp.height}; cx += sp.width; return p; });
      return {sps, placed, rb, width};
    });
    // the floating shelf: every plank as wide as the widest row, so two rows read as one shelf
    if (floating){ const half = Math.max(...rows.map(r => r.width))/2 + 22; for (const r of rows) floatingShelf(x, W/2 - half, W/2 + half, r.rb, settings.shelfColour); }
    for (const {sps, placed, rb} of rows) sps.forEach((sp,i) => {
      const tilt = f === 'vhs' || f === 'rental' ? (rnd() - .5)*1.2*Math.PI/180 : 0;   // ±0.6°
      x.save(); x.shadowColor = f === 'flash' ? flashShadow : shadow; x.shadowBlur = f === 'flash' ? 3 : 18; x.shadowOffsetX = f === 'flash' ? 24 : 0; x.shadowOffsetY = f === 'flash' ? 16 : 6;
      if (floating && f !== 'flash'){ x.shadowBlur = 26; x.shadowOffsetX = 9; x.shadowOffsetY = -3; }   // a soft shadow on the wall behind each book
      x.translate(placed[i].x + sp.width/2, rb); x.rotate(tilt); x.drawImage(sp, -sp.width/2, -sp.height); x.restore();
    });
    bookLight(f, x, rows.flatMap(({placed, rb}) => placed.map(pl => ({x:pl.x, y:rb - pl.h, w:pl.w, h:pl.h}))), k);
    booksTop = Math.min(...rows[0].placed.map(pl => rows[0].rb - pl.h));
    // where two spines meet: a thin dark line down the shorter one
    x.fillStyle = seam;
    for (const {placed, rb} of rows) for (let i = 1; i < placed.length; i++){ const a = placed[i-1], b2 = placed[i], mid = (a.x + a.w + b2.x)/2, hh = Math.min(a.h, b2.h); x.fillRect(mid - 1.5, rb - hh, 3, hh); }
  } else if (books.length){
    const flat = books.map(asSpine), s = sizes(800, 125, flat, settings), sumT = s.reduce((a,z) => a+z.w, 0), k2 = Math.min(1, 1220/sumT); let cy = base;
    if (floating){ const xs = flat.map((b,i) => (W - s[i].h)/2 + b.jit*38); floatingShelf(x, Math.min(...xs) - 22, Math.max(...xs.map((v,i) => v + s[i].h)) + 22, base, settings.shelfColour); }
    const placed = [];
    flat.forEach((b,i) => { const t = s[i].w*k2, L = s[i].h, sp = spineFor(b, t, L, f, k, fast, levels[i], i); cy -= sp.width; const cx = (W-L)/2 + b.jit*38;
      x.save(); x.shadowColor = f === 'flash' ? flashShadow : shadow; x.shadowBlur = f === 'flash' ? 3 : 16; x.shadowOffsetX = f === 'flash' ? 20 : 0; x.shadowOffsetY = f === 'flash' ? 16 : 5; x.translate(Math.round(cx), Math.round(cy + sp.width)); x.rotate(-Math.PI/2); x.drawImage(sp,0,0); x.restore();
      placed.push({x:Math.round(cx), y:Math.round(cy), L:sp.height, t:sp.width}); });
    bookLight(f, x, placed.map(pl => ({x:pl.x, y:pl.y, w:pl.L, h:pl.t})), k);
    booksTop = cy;
    // lying books meet along a line too
    x.fillStyle = seam;
    for (let i = 1; i < placed.length; i++){ const lo = placed[i-1], up = placed[i], x0 = Math.max(lo.x, up.x), x1 = Math.min(lo.x + lo.L, up.x + up.L); if (x1 > x0) x.fillRect(x0, lo.y - 1.5, x1 - x0, 3); }
  }
  if (f === 'flash' && books.length && !bare){ flashVignette(x, k); dateStamp(x); }
  if (!bare){ x.fillStyle = T.mark; x.font = '400 24px "Geist Mono", monospace'; x.textAlign = 'center'; x.fillText('made with spinestack', W/2, 1868); }
  return {captionBottom, booksTop};
}

window.Shelf = {FONTS, STYLES, THEMES, hex, rgb, lum, contrast, alpha, sat, dist, crop, posterTitle, loadImg, rr, fitFont, coverCrop, shade, isReal, isCase, isCover, asSpine, calmRect, topBlock, makeSpine, TEX, texture, hashStr, rngOf, blank, floatingShelf, tint, SCRATCH, scratch, texOver, texGrey, GRAIN, grainTile, grade, copyOf, outline, fadedSpine, glossySpine, GRAIN2, grainTile2, grainSpine, FLAKE, wornSpine, surname, pixels, rowDetail, freeBand, GLO, HAND, arcText, stickerPaper, beKindSticker, genreSticker, priceSticker, rewindStrip, GENRES, rentalSpine, libLabel, libFoot, libraryLines, jacketGlare, librarySpine, PENCIL, pencilGrain, secondhandSpine, hsl, hslCss, FOIL, WEAVE, weaveTile, MOTIFS, clothSpine, flashSpine, flashVignette, NOISE, noiseAt, filmSpine, RISO_PAPER, risoSpine, xeroxSpine, nightSpine, bookLight, dateStamp, woodShelf, wearLevels, WORN, spineFor, wrapText, sizes, renderStory, onTextureLoaded: fn => { onTexture = fn; }};
})();
