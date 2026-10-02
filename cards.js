/* Shelf cards: which part of a shelf's picture a card shows. The picture is the whole 9:16 story and a card is 2:3, so
   the card is cut round the books. Where they are is read from the picture itself: it's drawn small on a canvas, the
   background is the colour its edges have, and whatever isn't that colour is something drawn. The caption (wholly in
   the top quarter) and the "made with shelfstackd" line (wholly at the foot) are left out, and the box round the rest
   is put in the middle of the card with a little room, on the story's own background colour. What's found is kept per
   preview key (in this tab, and in localStorage for the next visit), so a picture is looked at once.

   A page only marks its cards: <span class="pic"><img crossorigin="anonymous" src="…/u/preview?k=…&v=…"></span> (the
   picture has to come with CORS to be read). Nothing else is called: every card picture is cut as it loads. A picture
   that can't be read (no plain background: a wall photo, the Flash look; or it came without CORS) keeps the cut
   site.css gives every card. Load it after worker-address.js. */
(() => {
  const AW = 180, AH = 320;       // the picture is looked at this small
  const TOL = 9;                  // a pixel this far from the background, in any channel, is something drawn
  const TOP = .25, FOOT = .945;   // wholly above the first: the caption. Wholly below the second: the "made with" line
  const MX = .04, MY = .07;       // room left in the card beside the box, and above and below it
  const ZOOM = 1.8;               // the most a picture is enlarged (it's 360px wide: more than this is a blur)
  const RATIO = 16/9;             // the picture's height over its width, as site.css draws it
  const STORE = 'shelfstackd-crops-1', KEEP = 300;
  let measured = 0;               // how many pictures were looked at on this page

  /* ---------- what's kept: {preview key: [v, x0, x1, y0, y1, clip top, clip bottom, r, g, b]}, or [v] for a picture
     that can't be cut this way ---------- */
  let kept = {};
  try { kept = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch {}
  let saveT = 0;
  function save(){
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const keys = Object.keys(kept);
      for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) delete kept[k];   // the oldest go first
      try { localStorage.setItem(STORE, JSON.stringify(kept)); } catch {}
    }, 400);
  }
  // a preview's key and version, from its address (…/u/preview?k=<user>/p/<shelf>&v=<updated>); null for any other picture
  function keyOf(src){
    try { const u = new URL(src), k = u.searchParams.get('k'); return k && /\/u\/preview$/.test(u.pathname) ? [k, u.searchParams.get('v') || ''] : null; } catch { return null; }
  }
  const pack = (v, m) => m ? [v, m.x0, m.x1, m.y0, m.y1, m.ct, m.cb, ...m.bg] : [v];
  const unpack = a => a.length < 10 ? null : {x0: a[1], x1: a[2], y0: a[3], y1: a[4], ct: a[5], cb: a[6], bg: a.slice(7, 10)};

  /* ---------- looking at a picture: the box round what's drawn, as fractions of its width and height, with where to
     clip it above and below and its background colour. null when it has no plain background or nothing is drawn.
     Throws when the picture can't be read (it came without CORS). ---------- */
  function measure(im){
    const c = document.createElement('canvas'); c.width = AW; c.height = AH;
    const x = c.getContext('2d', {willReadFrequently: true});
    x.drawImage(im, 0, 0, AW, AH);
    const d = x.getImageData(0, 0, AW, AH).data;
    // the background: the colour most of the frame's edge has (two columns each side, two rows at the top)
    const edge = [];
    for (let y = 0; y < AH; y++) edge.push(y*AW, y*AW + 1, y*AW + AW - 2, y*AW + AW - 1);
    for (let X = 2; X < AW - 2; X++) edge.push(X, AW + X);
    const mid = ch => { const v = edge.map(i => d[i*4 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const bg = [mid(0), mid(1), mid(2)];
    const drawn = i => Math.abs(d[i*4] - bg[0]) > TOL || Math.abs(d[i*4 + 1] - bg[1]) > TOL || Math.abs(d[i*4 + 2] - bg[2]) > TOL;
    if (edge.filter(drawn).length > edge.length*.12) return null;   // a photo behind the shelf, a vignette: no plain background
    // each row with something drawn: how far across it reaches
    const rows = [];
    for (let y = 0; y < AH; y++){
      let n = 0, a = AW, b = -1;
      for (let X = 0; X < AW; X++) if (drawn(y*AW + X)){ n++; if (X < a) a = X; if (X > b) b = X; }
      rows.push(n >= 2 ? [a, b] : null);
    }
    // bands of such rows; one or two empty rows don't split a band
    const bands = []; let cur = null;
    for (let y = 0; y < AH; y++){
      if (!rows[y]) continue;
      if (cur && y - cur[1] <= 3) cur[1] = y; else bands.push(cur = [y, y]);
    }
    const books = bands.filter(([a, b]) => b >= TOP*AH && a <= FOOT*AH);   // not the caption, not the "made with" line
    if (!books.length) return null;
    const y0 = books[0][0], y1 = books[books.length - 1][1];
    // across: rows that run nearly the whole width (a wood shelf under the books) don't count, unless they all do
    let x0 = AW, x1 = -1;
    for (const all of [false, true]){
      for (let y = y0; y <= y1; y++){ const r = rows[y]; if (!r || (!all && r[1] - r[0] > AW*.91)) continue; if (r[0] < x0) x0 = r[0]; if (r[1] > x1) x1 = r[1]; }
      if (x1 >= 0) break;
    }
    if (x1 - x0 < 3 || y1 - y0 < 2) return null;
    // the picture is clipped a little above and below the box, never into the caption or the "made with" line
    const above = bands.filter(b => b[1] < y0).pop(), below = bands.find(b => b[0] > y1), pad = 4;
    const ct = Math.max(above ? above[1] + 1 : 0, y0 - pad), cb = Math.min(below ? below[0] : AH, y1 + 1 + pad);
    const f = v => Math.round(v*10000)/10000;
    return {x0: f(x0/AW), x1: f((x1 + 1)/AW), y0: f(y0/AH), y1: f((y1 + 1)/AH), ct: f(ct/AH), cb: f(cb/AH), bg};
  }

  /* ---------- the cut: the box in the middle of the card, as large as leaves the room, on the story's background ---------- */
  const pct = v => (Math.round(v*10000)/100) + '%';
  function cut(im, m){
    const pic = im.parentElement, s = im.style;
    if (!m){ s.left = s.top = s.bottom = s.width = s.clipPath = ''; pic.style.backgroundColor = ''; return; }   // as site.css has it
    const k = Math.min(ZOOM, (1 - 2*MX)/(m.x1 - m.x0), 1.5*(1 - 2*MY)/(RATIO*(m.y1 - m.y0)));   // the picture's width, in card widths
    s.width = pct(k);
    s.left = pct(.5 - k*(m.x0 + m.x1)/2);                   // of the card's width
    s.top = pct(.5 - k*RATIO*(m.y0 + m.y1)/2/1.5);          // of the card's height, which is 1.5 widths
    s.bottom = 'auto';
    s.clipPath = `inset(${pct(m.ct)} 0 ${pct(1 - m.cb)} 0)`;
    pic.style.backgroundColor = `rgb(${m.bg.join(',')})`;
  }
  const isCard = im => im instanceof HTMLImageElement && !!im.parentElement && im.parentElement.classList.contains('pic');
  function fit(im){
    const key = keyOf(im.currentSrc || im.src), had = key && kept[key[0]];
    let m;
    if (had && had[0] === key[1]) m = unpack(had);
    else {
      try { m = measure(im); measured++; } catch { cut(im, null); return; }   // unreadable: nothing is kept, so it's tried again another time
      if (key){ delete kept[key[0]]; kept[key[0]] = pack(key[1], m); save(); }
    }
    cut(im, m);
  }

  // on the document: an image's load and error events never reach window
  document.addEventListener('load', e => { if (isCard(e.target)) fit(e.target); }, true);
  // A picture asked for with CORS that doesn't arrive: worker-address.js may be sending it to the Worker's other address
  // (then it's loading again a moment later). If it's simply broken, it's asked for once more without CORS, so that it
  // at least shows, with the stylesheet's cut.
  document.addEventListener('error', e => {
    const im = e.target; if (!isCard(im) || !im.hasAttribute('crossorigin')) return;
    const src = im.src;
    setTimeout(() => {
      if (!im.isConnected || im.src !== src || !im.complete || im.naturalWidth || !im.hasAttribute('crossorigin')) return;
      im.removeAttribute('crossorigin'); im.src = src;
    }, 0);
  }, true);
  // cards already on the page with their pictures loaded
  for (const im of document.querySelectorAll('.pic > img')) if (im.complete && im.naturalWidth) fit(im);

  window.Cards = {fit, measure, get measured(){ return measured; }};
})();
