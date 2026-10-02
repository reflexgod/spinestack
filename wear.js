/* A log's cover, worn: the film's poster or the book's cover with one corner dog-eared, and light wear on it (fine
   scratches, rubbed edges, a little fade). No stamp, and nothing written on it. It ages from the day it was logged:
   nearly new that day, more faded after a week, more worn after a month. It's all drawn here, on a canvas, each time
   the page shows it; nothing is kept. Each log wears in its own way (its scratches come from its id) and the same way
   every time it's drawn.
   Wear.cover({src, seed, at, label, width}) gives the canvas at once and draws the picture on it when it arrives
   (src: the picture's address, through the Worker; width: in CSS pixels, 150 unless given). Wear.age(at) is how worn
   a log is: {days, fade, wear}, each from 0 to 1. The canvas carries them too, as data-fade and data-wear. */
(() => {
  if (window.Wear) return;

  // how worn: fade comes first (most of it in the first weeks), then the scratches and the rubbed edges
  function age(at){
    const days = Math.max(0, (Date.now() - new Date(at)) / 864e5) || 0;
    return {days, fade: .03 + .3 * (1 - Math.exp(-days / 12)), wear: .08 + .92 * (1 - Math.exp(-days / 30))};
  }
  // the same numbers every time for the same log
  function rng(seed){
    let h = 1779033703 ^ String(seed).length;
    for (const ch of String(seed)){ h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  // a dull colour for a cover that never came: plain, nothing on it
  const PLAIN = ['#2B2B2B', '#4A4540', '#3D4A52', '#5A4A3F', '#47503F', '#6B5B4E'];

  function draw(c, img, o){
    const x = c.getContext('2d'), W = c.width, H = c.height, k = W / 300, r = rng(o.seed), {fade, wear} = age(o.at);
    // the dog-ear: folded from a point on the top edge to one on the right edge, never quite square
    const d = Math.round(W * (.13 + r() * .04)), e = Math.round(W * (.15 + r() * .05));
    x.clearRect(0, 0, W, H);
    // the cover, less the folded corner, its other corners a little rubbed
    const round = (1 + 3 * wear) * k;
    const shape = () => {
      x.beginPath();
      x.moveTo(round, 0); x.lineTo(W - d, 0); x.lineTo(W, e); x.lineTo(W, H - round); x.quadraticCurveTo(W, H, W - round, H);
      x.lineTo(round, H); x.quadraticCurveTo(0, H, 0, H - round); x.lineTo(0, round); x.quadraticCurveTo(0, 0, round, 0); x.closePath();
    };
    x.save(); shape(); x.clip();
    if (img){
      const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;   // as object-fit: cover
      x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    } else { x.fillStyle = PLAIN[Math.floor(r() * PLAIN.length)]; x.fillRect(0, 0, W, H); }
    // fade: the colour going out of it, the darks lifting towards paper, and one side faded more (it sat in the light)
    x.globalCompositeOperation = 'saturation'; x.globalAlpha = Math.min(1, fade * 1.1); x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'screen'; x.globalAlpha = fade * .55; x.fillStyle = '#E9E3D6'; x.fillRect(0, 0, W, H);
    const side = r() < .5, g = x.createLinearGradient(side ? 0 : W, 0, side ? W : 0, H * (.3 + r() * .7));
    g.addColorStop(0, `rgba(236,230,218,${(fade * .45).toFixed(3)})`); g.addColorStop(1, 'rgba(236,230,218,0)');
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, W, H);
    // scratches: fine light lines, a few long and more short ones, more of them the older it is
    const n = Math.round(1 + 30 * wear);
    x.lineCap = 'round';
    for (let i = 0; i < n; i++){
      const long = r() < .3, len = (long ? .25 + r() * .35 : .04 + r() * .14) * W, a = (r() - .5) * Math.PI * .9 + (r() < .5 ? 0 : Math.PI / 2);
      const x0 = r() * W, y0 = r() * H, x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len, bend = (r() - .5) * len * .25;
      x.strokeStyle = `rgba(255,255,255,${((.06 + r() * .32) * (.25 + .75 * wear)).toFixed(3)})`; x.lineWidth = (.4 + r() * .8) * k;
      x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2 - bend, x1, y1); x.stroke();
    }
    // rubbed edges: the print worn pale along the edges, and small chips out of it
    x.strokeStyle = `rgba(245,241,233,${(.1 + .5 * wear).toFixed(3)})`; x.lineWidth = (1.5 + 3.5 * wear) * k; shape(); x.stroke();
    x.fillStyle = 'rgba(245,241,233,.8)';
    for (let i = 0, m = Math.round(2 + 26 * wear); i < m; i++){
      const t = r(), side4 = Math.floor(r() * 4), s = (.6 + r() * 1.8) * k;
      const [cx, cy] = side4 === 0 ? [t * (W - d), 0] : side4 === 1 ? [W, e + t * (H - e)] : side4 === 2 ? [t * W, H] : [0, t * H];
      x.beginPath(); x.ellipse(cx, cy, s * (1 + r()), s, r() * Math.PI, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    // the dog-ear: the corner folded over onto the front, showing the back of the card, with a soft shadow under it
    x.save();
    x.shadowColor = 'rgba(0,0,0,.28)'; x.shadowBlur = 5 * k; x.shadowOffsetX = -1.5 * k; x.shadowOffsetY = 1.5 * k;
    // the corner, (W, 0), mirrored across the fold, a touch short of it as card lies
    const ax = W - d, by = e, u = d * d / (d * d + e * e);   // where the corner's line meets the fold, square to it
    const fx = ax + d * u, fy = e * u, rx = 2 * fx - W, ry = 2 * fy, cx = rx + (fx - rx) * .06, cy = ry + (fy - ry) * .06;
    x.beginPath(); x.moveTo(ax, 0); x.lineTo(W, by); x.lineTo(cx, cy); x.closePath();
    const back = x.createLinearGradient(fx, fy, cx, cy);
    back.addColorStop(0, '#F4F1EA'); back.addColorStop(1, `rgb(${Math.round(222 - 20 * wear)},${Math.round(217 - 20 * wear)},${Math.round(206 - 18 * wear)})`);
    x.fillStyle = back; x.fill();
    x.restore();
    x.strokeStyle = `rgba(0,0,0,${(.1 + .12 * wear).toFixed(3)})`; x.lineWidth = .8 * k;
    x.beginPath(); x.moveTo(W - d, 0); x.lineTo(W, e); x.stroke();   // the crease
    // a hairline round it, as the shelf cards have
    x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 1 * k; shape(); x.stroke();
  }

  function cover(o){
    const width = o.width || 150, dpr = Math.min(2, window.devicePixelRatio || 1), c = document.createElement('canvas');
    c.width = Math.round(width * dpr); c.height = Math.round(c.width * 1.5);
    c.className = 'worn';
    const a = age(o.at);
    c.dataset.fade = a.fade.toFixed(2); c.dataset.wear = a.wear.toFixed(2);
    c.setAttribute('role', 'img'); c.setAttribute('aria-label', o.label || 'The cover');
    if (!o.src){ draw(c, null, o); return c; }   // no cover anywhere: a plain one, worn the same
    const x = c.getContext('2d'); x.fillStyle = '#F3F3F3'; x.fillRect(0, 0, c.width, c.height);   // until it comes
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    img.onload = () => { try { draw(c, img, o); } catch { draw(c, null, o); } };
    img.onerror = () => draw(c, null, o);
    img.src = o.src;
    return c;
  }

  window.Wear = {cover, age};
})();
