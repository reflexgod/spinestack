/* A log's cover, worn, as the thing itself would be. A film is a DVD in its keep case: a thin black plastic edge (the
   hinge's ridges down the left), the poster under the plastic with a sheen across it; it ages with scratches on the
   plastic, the sheen going hazy, and after a month a cracked corner. A book is a paperback: the page edges showing
   at its foot and its right, the crease down its spine; it ages yellow, with a dog-eared corner, reading creases by the
   spine, and after a month a price pencilled at the top. Nothing else is written on either.
   It ages from the day it was logged: handled already that day, more after a week, more after a month. It's all drawn
   here, on a canvas, each time the page shows it; nothing is kept. Each log wears in its own way (from its id) and the
   same way every time, and every line is a screen pixel at least, so it reads at 72px too.
   Wear.cover({src, seed, at, label, width, kind}) gives the canvas at once and draws the picture on it when it
   arrives (src: the picture's address, through the Worker; width: in CSS pixels, 150 unless given; kind: 'movie' for
   the case, otherwise the paperback). Wear.age(at) is how worn a log is: {days, fade, wear}, fade and wear from 0 to
   1. The canvas carries them too, as data-fade and data-wear, and data-kind: case or paperback. */
(() => {
  if (window.Wear) return;

  // how worn: fade comes first (most of it in the first weeks), then the scratches, creases and rubbed edges. Wear
  // starts at a quarter, so a cover logged today already looks handled
  function age(at){
    const days = Math.max(0, (Date.now() - new Date(at)) / 864e5) || 0;
    return {days, fade: .03 + .3 * (1 - Math.exp(-days / 12)), wear: .25 + .75 * (1 - Math.exp(-days / 30))};
  }
  const MONTH = 30;
  // the same numbers every time for the same log (and its own run of them for each kind of mark, so adding one
  // doesn't move the others)
  function rng(seed){
    let h = 1779033703 ^ String(seed).length;
    for (const ch of String(seed)){ h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  // a dull colour for a cover that never came: plain, nothing on it
  const PLAIN = ['#2B2B2B', '#4A4540', '#3D4A52', '#5A4A3F', '#47503F', '#6B5B4E'];

  // the picture in a box, as object-fit: cover; or a plain colour when there's none
  function art(x, img, r, X, Y, w, h){
    if (img){ const s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s; x.drawImage(img, X + (w - iw) / 2, Y + (h - ih) / 2, iw, ih); }
    else { x.fillStyle = PLAIN[Math.floor(r() * PLAIN.length)]; x.fillRect(X, Y, w, h); }
  }
  function roundRect(x, X, Y, w, h, R){
    x.beginPath(); x.moveTo(X + R, Y); x.lineTo(X + w - R, Y); x.quadraticCurveTo(X + w, Y, X + w, Y + R); x.lineTo(X + w, Y + h - R); x.quadraticCurveTo(X + w, Y + h, X + w - R, Y + h);
    x.lineTo(X + R, Y + h); x.quadraticCurveTo(X, Y + h, X, Y + h - R); x.lineTo(X, Y + R); x.quadraticCurveTo(X, Y, X + R, Y); x.closePath();
  }
  // fine light lines, a few long and more short ones, more of them the older it is; the first three long and plain to
  // see whatever its age and size
  function scratches(x, r, n, X, Y, w, h, k, px, wear){
    x.lineCap = 'round';
    for (let i = 0; i < n; i++){
      const first = i < 3, long = r() < .3 || first, len = (long ? .25 + r() * .35 : .04 + r() * .14) * w, a = (r() - .5) * Math.PI * .9 + (r() < .5 ? 0 : Math.PI / 2);
      const x0 = X + (first ? .15 + r() * .7 : r()) * w, y0 = Y + (first ? .15 + r() * .7 : r()) * h, x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len, bend = (r() - .5) * len * .25;
      x.strokeStyle = `rgba(255,255,255,${(first ? .3 + r() * .16 : (.06 + r() * .32) * (.25 + .75 * wear)).toFixed(3)})`; x.lineWidth = Math.max(first ? Math.max(1, .6 * px) : .3 * px, (.4 + r() * .8) * k);
      x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2 - bend, x1, y1); x.stroke();
    }
  }

  /* ---------- a film: the DVD keep case ---------- */
  function drawCase(c, img, o){
    const x = c.getContext('2d'), W = c.width, H = c.height, k = W / 300, px = o.px || 1, r = rng(o.seed), {days, fade, wear} = age(o.at);
    const R = Math.max(2 * px, 7 * k), edge = Math.max(2 * px, 5 * k), hinge = Math.max(3.5 * px, 12 * k);
    x.clearRect(0, 0, W, H);
    // the black plastic
    x.save(); roundRect(x, 0, 0, W, H, R); x.clip();
    x.fillStyle = '#111111'; x.fillRect(0, 0, W, H);
    // the poster under it, a little faded (it's behind plastic, so less than a book)
    const ax = hinge, ay = edge, aw = W - hinge - edge, ah = H - 2 * edge;
    x.save(); x.beginPath(); x.rect(ax, ay, aw, ah); x.clip();
    art(x, img, r, ax, ay, aw, ah);
    x.globalCompositeOperation = 'saturation'; x.globalAlpha = Math.min(1, fade * .6); x.fillStyle = '#808080'; x.fillRect(ax, ay, aw, ah);
    x.restore();
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    // the hinge: two ridges down the left, catching the light
    x.fillStyle = 'rgba(255,255,255,.16)';
    for (const at of [.3, .62]) x.fillRect(hinge * at, R, Math.max(px, 1.4 * k), H - 2 * R);
    // the sheen: a broad band of light across the plastic, and a bright line under its top edge
    const s0 = .18 + r() * .14, g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(s0, 'rgba(255,255,255,0)'); g.addColorStop(s0 + .07, 'rgba(255,255,255,.2)');
    g.addColorStop(s0 + .16, 'rgba(255,255,255,.05)'); g.addColorStop(s0 + .3, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.32)'; x.fillRect(R, Math.max(px, edge * .4), W - 2 * R, Math.max(px, 1.2 * k));
    // the haze: the plastic going milky with age
    x.fillStyle = `rgba(232,232,228,${(.03 + .22 * (wear - .25) / .75 + .1 * fade).toFixed(3)})`; x.fillRect(0, 0, W, H);
    // scratches on the plastic
    scratches(x, r, Math.round(2 + 30 * wear), 0, 0, W, H, k, px, wear);
    // after a month, a cracked corner: a chip out of the plastic, and white stress lines running in from it
    if (days >= MONTH){
      const q = rng(o.seed + ':crack'), corner = Math.floor(q() * 4), cx = corner % 2 ? W : 0, cy = corner > 1 ? H : 0, sx = cx ? -1 : 1, sy = cy ? -1 : 1;
      const chip = W * (.06 + q() * .04);
      x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';   // the whole chip, not some of it
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + sx * chip, cy); x.lineTo(cx + sx * chip * .45, cy + sy * chip * .5); x.lineTo(cx, cy + sy * chip * .9); x.closePath(); x.fill();
      x.restore();
      x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = Math.max(px, .9 * k); x.lineJoin = 'round';
      for (let i = 0, n = 3 + Math.floor(q() * 3); i < n; i++){
        let px0 = cx + sx * chip * (.3 + q() * .6), py0 = cy + sy * chip * (.2 + q() * .6), a = Math.atan2(sy, sx) + (q() - .5) * 1.1;
        x.beginPath(); x.moveTo(px0, py0);
        for (let j = 0, m = 3 + Math.floor(q() * 3); j < m; j++){ const step = W * (.03 + q() * .05); a += (q() - .5) * .9; px0 += Math.cos(a) * step; py0 += Math.sin(a) * step; x.lineTo(px0, py0); }
        x.stroke();
      }
    }
    x.restore();
    // the case's own edge: a hairline round it, so it ends somewhere on any page
    x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = px; roundRect(x, px / 2, px / 2, W - px, H - px, R); x.stroke();
  }

  /* ---------- a book: the paperback ---------- */
  function drawPaperback(c, img, o){
    const x = c.getContext('2d'), W = c.width, H = c.height, k = W / 300, px = o.px || 1, r = rng(o.seed), {days, fade, wear} = age(o.at);
    const pe = Math.max(2 * px, 5 * k), CW = W - pe, CH = H - pe;   // the page edges show at its foot and its right
    // the dog-ear: folded from a point on the top edge to one on the right edge, never quite square
    const d = Math.round(CW * (.13 + r() * .04)), e = Math.round(CW * (.15 + r() * .05));
    x.clearRect(0, 0, W, H);
    // the pages: cream going yellow, a fine line for each few of them
    const yel = Math.min(1, fade * 2.2);
    x.fillStyle = `rgb(${Math.round(241 - 6 * yel)},${Math.round(236 - 18 * yel)},${Math.round(222 - 48 * yel)})`;
    x.fillRect(pe, pe, CW, CH);
    x.strokeStyle = 'rgba(120,105,80,.35)'; x.lineWidth = Math.max(.5 * px, .5 * k);
    for (let i = 1; i < 4; i++){ const t = pe * i / 4; x.beginPath(); x.moveTo(CW + t, pe + t); x.lineTo(CW + t, H - pe + t); x.moveTo(pe + t, CH + t); x.lineTo(CW + t, CH + t); x.stroke(); }
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = px; x.strokeRect(pe + px / 2, pe + px / 2, CW - px, CH - px);
    // the cover, less the folded corner, its other corners a little rubbed
    const round = (1 + 3 * wear) * k;
    const shape = () => {
      x.beginPath();
      x.moveTo(round, 0); x.lineTo(CW - d, 0); x.lineTo(CW, e); x.lineTo(CW, CH - round); x.quadraticCurveTo(CW, CH, CW - round, CH);
      x.lineTo(round, CH); x.quadraticCurveTo(0, CH, 0, CH - round); x.lineTo(0, round); x.quadraticCurveTo(0, 0, round, 0); x.closePath();
    };
    x.save(); shape(); x.clip();
    art(x, img, r, 0, 0, CW, CH);
    // yellowing: the colour going out of it and the whites going to old paper, one side more (it sat in the light)
    x.globalCompositeOperation = 'saturation'; x.globalAlpha = Math.min(1, fade * 1.1); x.fillStyle = '#808080'; x.fillRect(0, 0, CW, CH);
    x.globalCompositeOperation = 'multiply'; x.globalAlpha = Math.min(1, .15 + fade * 2); x.fillStyle = '#F2DFAE'; x.fillRect(0, 0, CW, CH);
    x.globalCompositeOperation = 'screen'; x.globalAlpha = fade * .45; x.fillStyle = '#E9E0C8'; x.fillRect(0, 0, CW, CH);
    const side = r() < .5, g = x.createLinearGradient(side ? 0 : CW, 0, side ? CW : 0, CH * (.3 + r() * .7));
    g.addColorStop(0, `rgba(236,226,196,${(fade * .45).toFixed(3)})`); g.addColorStop(1, 'rgba(236,226,196,0)');
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, CW, CH);
    // the spine's crease: where the cover bends open, a pale line with a shadow beside it, down its whole height
    const sx = CW * (.06 + r() * .015), cw = Math.max(px, 1.4 * k);
    x.fillStyle = `rgba(255,252,240,${(.35 + .35 * wear).toFixed(3)})`; x.fillRect(sx, 0, cw, CH);
    x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(sx + cw, 0, Math.max(px, k), CH);
    // reading creases: pale wrinkles running down from the spine, more of them the more it's been read
    x.lineCap = 'round';
    for (let i = 0, n = Math.round(1 + 9 * wear); i < n; i++){
      const x0 = sx + cw + (r() * .22) * CW, y0 = r() * CH * .8, len = (.1 + r() * .3) * CH, bend = (r() - .5) * CW * .06;
      x.strokeStyle = `rgba(255,252,240,${(.25 + r() * .3).toFixed(3)})`; x.lineWidth = Math.max(px, (.6 + r() * .6) * k);
      x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(x0 + bend, y0 + len / 2, x0 + bend * .3, y0 + len); x.stroke();
    }
    // after a month, a price pencilled at the top, as a secondhand shop does
    if (days >= MONTH){
      const q = rng(o.seed + ':price'), price = `${q() < .5 ? '£' : '$'}${1 + Math.floor(q() * 6)}.${['00', '50', '95', '99'][Math.floor(q() * 4)]}`;
      x.save(); x.translate(CW * (.12 + q() * .06), CH * (.07 + q() * .03)); x.rotate(-.05 - q() * .06);
      x.font = `${Math.max(8 * px, Math.round(22 * k))}px "Gochi Hand", "Comic Sans MS", cursive`; x.textBaseline = 'top';
      x.fillStyle = 'rgba(80,80,80,.75)'; x.fillText(price, 0, 0);
      x.restore();
      c.dataset.price = price;
    }
    // rubbed edges: the print worn pale along the edges, and small chips out of it
    x.strokeStyle = `rgba(245,241,233,${(.1 + .5 * wear).toFixed(3)})`; x.lineWidth = (1.5 + 3.5 * wear) * k; shape(); x.stroke();
    x.fillStyle = 'rgba(245,241,233,.8)';
    for (let i = 0, m = Math.round(2 + 26 * wear); i < m; i++){
      const t = r(), side4 = Math.floor(r() * 4), s = (.6 + r() * 1.8) * k;
      const [cx, cy] = side4 === 0 ? [t * (CW - d), 0] : side4 === 1 ? [CW, e + t * (CH - e)] : side4 === 2 ? [t * CW, CH] : [0, t * CH];
      x.beginPath(); x.ellipse(cx, cy, s * (1 + r()), s, r() * Math.PI, 0, Math.PI * 2); x.fill();
    }
    // a hairline inside its edge, so a white cover ends somewhere on a white page
    x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 2 * px; shape(); x.stroke();
    /* The dog-ear: the corner folded over onto the front, showing the back of the card. A soft shadow under it and a
       hairline round it, so it reads on a light cover on a white page too. */
    const ax = CW - d, by = e, u = d * d / (d * d + e * e);   // where the corner's line meets the fold, square to it
    const fx = ax + d * u, fy = e * u, rx = 2 * fx - CW, ry = 2 * fy, cx = rx + (fx - rx) * .06, cy = ry + (fy - ry) * .06;
    const flap = () => { x.beginPath(); x.moveTo(ax, 0); x.lineTo(CW, by); x.lineTo(cx, cy); x.closePath(); };
    x.save();
    x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = Math.max(2.5 * px, 5 * k); x.shadowOffsetX = -Math.max(1 * px, 1.5 * k); x.shadowOffsetY = Math.max(1.5 * px, 2 * k);
    flap(); x.fillStyle = '#E4DFD4'; x.fill();
    x.restore();
    x.restore();
    const back = x.createLinearGradient(fx, fy, cx, cy);
    back.addColorStop(0, '#F7F5EF'); back.addColorStop(1, `rgb(${Math.round(226 - 20 * wear)},${Math.round(221 - 26 * wear)},${Math.round(210 - 40 * wear)})`);
    flap(); x.fillStyle = back; x.fill();
    x.strokeStyle = `rgba(0,0,0,${(.3 + .1 * wear).toFixed(3)})`; x.lineWidth = 1 * px; x.lineJoin = 'round'; flap(); x.stroke();
  }

  const draw = (c, img, o) => (o.kind === 'movie' ? drawCase : drawPaperback)(c, img, o);

  function cover(o){
    const width = o.width || 150, dpr = Math.min(2, window.devicePixelRatio || 1), c = document.createElement('canvas');
    c.width = Math.round(width * dpr); c.height = Math.round(c.width * 1.5);
    c.className = 'worn';
    const a = age(o.at);
    c.dataset.fade = a.fade.toFixed(2); c.dataset.wear = a.wear.toFixed(2); c.dataset.kind = o.kind === 'movie' ? 'case' : 'paperback';
    c.setAttribute('role', 'img'); c.setAttribute('aria-label', o.label || 'The cover');
    o = {...o, px: c.width / width};
    if (!o.src){ draw(c, null, o); c.dataset.drawn = '1'; return c; }   // no cover anywhere: a plain one, worn the same
    const x = c.getContext('2d'); x.fillStyle = '#F3F3F3'; x.fillRect(0, 0, c.width, c.height);   // until it comes
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    img.onload = () => { try { draw(c, img, o); } catch { draw(c, null, o); } c.dataset.drawn = '1'; };
    img.onerror = () => { draw(c, null, o); c.dataset.drawn = '1'; };
    img.src = o.src;
    return c;
  }

  window.Wear = {cover, age};
})();
