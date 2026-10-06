/* Share to story: a 1080 x 1920 picture of a shelf, a log or a profile, made on a canvas here, for an Instagram (or
   any) story. On a phone that can share files it opens a sheet with the picture and Share, which hands it to the
   phone's share sheet (Web Share, with the file: Android Chrome and iPhone Safari both take it from a press); anywhere
   else the picture is saved (downloaded). The press on Share is its own, so the browser lets it share however long the
   picture took to make.

   What's on it: our logo and name at the top; the thing itself in the middle (a shelf's spines on their line, as
   shelf.js draws them; a log's worn cover as wear.js draws it, its rating as spines and the start of what was said;
   a profile's photo, name and line of numbers, and their shelf); under it the title and @username; shelfstackd.com at
   the foot. Paper white, black ink, Courier Prime: the site's look.

   Story.share(spec) where spec is one of
     {kind: 'shelf', picture: <canvas of the shelf>, title, username}
     {kind: 'log', cover: <canvas from Wear.cover>, title, year, verb, rating (1 to 10), review, username}
     {kind: 'profile', avatar: <url>, name, username, line, picture: <canvas of their shelf, or null>}
   Story.make(spec) gives the canvas alone (the tests read it). */
(() => {
  if (window.Story) return;
  const ROOT = new URL('.', document.currentScript.src).href;
  const W = 1080, H = 1920, FILE = 'shelfstackd-story.png';
  const INK = '#000000', GREY = '#6B6B6B', PAPER = '#FFFFFF', COLOURS = ['#FFD000', '#FF2E93', '#6A4BFF', '#00D5E6'];
  const FONT = '"Courier Prime", "Courier New", monospace';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const loadImg = src => new Promise((res, rej) => { const im = new Image(); if (!/^(data|blob):/.test(src) && !src.startsWith(ROOT)) im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
  const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  // a canvas wear.js is still drawing: ready once it says so (data-drawn), 8 seconds at most
  const drawn = c => !c || !c.classList || !c.classList.contains('worn') || c.dataset.drawn === '1' ? Promise.resolve() : new Promise(res => {
    const mo = new MutationObserver(() => { if (c.dataset.drawn === '1'){ mo.disconnect(); res(); } });
    mo.observe(c, {attributes: true, attributeFilter: ['data-drawn']}); setTimeout(() => { mo.disconnect(); res(); }, 8000);
  });
  const rrect = (x, X, Y, w, h, r) => { if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); };
  async function fonts(){
    if (!document.fonts) return;
    await Promise.all([`400 40px ${FONT}`, `700 40px ${FONT}`].map(f => within(document.fonts.load(f), 3000).catch(() => {})));
  }
  // lines of text no wider than max, at most n (the last cut with …)
  function wrap(x, text, max, n){
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), lines = [];
    let line = '';
    for (const w of words){ const t = line ? line + ' ' + w : w; if (line && x.measureText(t).width > max){ lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    if (lines.length > n){ lines.length = n; let last = lines[n - 1] + '…'; while (x.measureText(last).width > max && last.length > 2) last = last.slice(0, -2) + '…'; lines[n - 1] = last; }
    return lines;
  }
  function text(x, s, y, {size = 40, weight = 400, colour = INK, max = W - 160, lines = 1, gap = 1.3} = {}){
    x.font = `${weight} ${size}px ${FONT}`; x.fillStyle = colour; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    const out = wrap(x, s, max, lines);
    out.forEach((l, i) => x.fillText(l, W / 2, y + i * size * gap));
    return y + (out.length - 1) * size * gap;
  }
  // a rating as five spines in the logo's colours (halves: a half-height spine), as post.js draws it
  function ratingSpines(x, v, cx, y){
    const w = 26, h = 72, gap = 14, left = cx - (5 * w + 4 * gap) / 2;
    for (let i = 1; i <= 5; i++){
      const full = v >= 2 * i, half = v === 2 * i - 1, X = left + (i - 1) * (w + gap), c = COLOURS[(i - 1) % 4];
      x.beginPath(); rrect(x, X + 1.5, y + 1.5, w - 3, h - 3, 9);
      x.lineWidth = 3; x.strokeStyle = full ? c : '#B5B5B5'; if (!full){ x.stroke(); } else { x.fillStyle = c; x.fill(); }
      if (half){ x.beginPath(); rrect(x, X, y + h / 2, w, h / 2, 9); x.fillStyle = c; x.fill(); }
    }
  }
  // a picture scaled to fit a box, standing on a shelf line (its feet on y)
  function onLine(x, pic, feet, maxW, maxH){
    const k = Math.min(maxW / pic.width, maxH / pic.height, 2.5), w = pic.width * k, h = pic.height * k, left = (W - w) / 2;
    x.drawImage(pic, left, feet - h, w, h);
    x.fillStyle = INK; x.fillRect(Math.max(60, left - 32), feet, Math.min(W - 120, w + 64), 4);
    return {top: feet - h, w, h};
  }
  async function head(x){
    let logo = null; try { logo = await within(loadImg(ROOT + 'assets/logo-hedgehog.svg'), 4000); } catch {}
    x.font = `700 44px ${FONT}`; const word = 'SHELFSTACKD', tw = x.measureText(word).width + 10 * 0.18 * 44, size = 76, all = size + 20 + tw, left = (W - all) / 2;
    if (logo) x.drawImage(logo, left, 104, size, size);
    x.fillStyle = INK; x.textAlign = 'left'; x.textBaseline = 'middle';
    if ('letterSpacing' in x) x.letterSpacing = '8px';
    x.fillText(word, left + size + 20, 144);
    if ('letterSpacing' in x) x.letterSpacing = '0px';
  }
  function foot(x){
    const y = H - 120;
    COLOURS.forEach((c, i) => { x.fillStyle = c; x.fillRect(W / 2 - 54 + i * 28, y - 64, 20, 6); });
    text(x, 'shelfstackd.com', y, {size: 40, weight: 700});
  }

  async function make(spec){
    await fonts();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    await head(x);
    const user = spec.username ? '@' + spec.username : '';
    if (spec.kind === 'shelf'){
      const pic = spec.picture;
      const box = pic ? onLine(x, pic, 1180, W - 160, 860) : null;
      let y = (box ? 1180 : 900) + 120;
      y = text(x, spec.title || 'A shelf', y, {size: 64, weight: 700, lines: 2});
      text(x, user, y + 76, {size: 40, colour: GREY});
    } else if (spec.kind === 'log'){
      if (spec.cover){ await drawn(spec.cover); try { onLine(x, spec.cover, 1040, 560, 780); } catch {} }
      let y = 1150;
      y = text(x, `${spec.title || ''}${spec.year ? ` (${spec.year})` : ''}`, y, {size: 60, weight: 700, lines: 2});
      y += 40;
      if (spec.rating >= 1 && spec.rating <= 10){ ratingSpines(x, spec.rating, W / 2, y); y += 120; }
      else y += 40;
      if (spec.review) y = text(x, `“${String(spec.review).trim()}”`, y, {size: 36, lines: 4, gap: 1.4}) + 70;
      else y += 10;
      text(x, `${user} ${spec.verb || ''}`.trim(), y, {size: 40, colour: GREY});
    } else {
      // a profile: the photo in a circle, the name, @username, the line of numbers, their shelf
      const r = 150, cy = 420;
      x.save(); x.beginPath(); x.arc(W / 2, cy, r, 0, Math.PI * 2); x.closePath();
      x.fillStyle = '#F3F3F3'; x.fill(); x.clip();
      let im = null; if (spec.avatar) try { im = await within(loadImg(spec.avatar), 6000); } catch {}
      if (im){ const k = Math.max(2 * r / im.naturalWidth, 2 * r / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k; x.drawImage(im, W / 2 - w / 2, cy - h / 2, w, h); }
      else { x.fillStyle = INK; x.font = `400 140px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(((spec.name || spec.username || '·').trim()[0] || '·').toUpperCase(), W / 2, cy + 6); }
      x.restore();
      x.beginPath(); x.arc(W / 2, cy, r, 0, Math.PI * 2); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
      let y = cy + r + 100;
      y = text(x, spec.name || user, y, {size: 64, weight: 700, lines: 2});
      if (spec.name && spec.name !== user) y = text(x, user, y + 64, {size: 40, colour: GREY});
      if (spec.line) y = text(x, spec.line, y + 64, {size: 34, colour: GREY});
      if (spec.picture) onLine(x, spec.picture, Math.min(H - 330, y + 560), W - 160, 480);
    }
    foot(x);
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `A story picture: ${spec.title || spec.name || ''} ${user}`.trim());
    return c;
  }
  const toBlob = c => new Promise((res, rej) => { try { c.toBlob(b => b ? res(b) : rej(new Error('One picture in it can’t be put in a story.')), 'image/png'); } catch { rej(new Error('One picture in it can’t be put in a story.')); } });
  function save(blob, name = FILE){
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function say(msg){ const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { t.hidden = true; }, 4200); }
  const phone = () => matchMedia('(pointer:coarse)').matches;
  let sheet = null;
  function shareSheet(blob, file, title){
    const url = URL.createObjectURL(blob), from = document.activeElement;
    if (sheet) sheet.remove();
    sheet = document.createElement('div');
    sheet.className = 'sheet'; sheet.id = 'storySheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'storyTitle');
    sheet.innerHTML = `<div class="sheetbox"><button class="x" data-close type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      <div><h2 id="storyTitle">Your story</h2><img class="storypic" src="${esc(url)}" alt="${esc(title)}" width="1080" height="1920" style="display:block;width:auto;max-width:100%;height:auto;max-height:min(52vh,420px);margin:0 auto;outline:1px solid var(--hair)">
      <div class="row"><button class="btn primary" type="button" data-share>Share</button><button class="dash sm" type="button" data-save>Save the picture</button></div></div></div>`;
    document.body.append(sheet);
    const shut = () => { sheet.remove(); sheet = null; URL.revokeObjectURL(url); if (from && from.focus && from.isConnected) from.focus(); };
    sheet.addEventListener('click', async e => {
      if (e.target === sheet || e.target.closest('[data-close]')){ shut(); return; }
      if (e.target.closest('[data-save]')){ save(blob, file.name); say('Saved as ' + file.name + '.'); return; }
      const b = e.target.closest('[data-share]'); if (!b) return;
      try { await navigator.share({files: [file], title}); shut(); }
      catch (err){ if (!err || err.name !== 'AbortError'){ save(blob, file.name); say('Saved as ' + file.name + '. Add it to your story from your photos.'); shut(); } }
    });
    sheet.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.stopPropagation(); shut(); } });
    sheet.querySelector('[data-share]').focus();
  }
  async function share(spec){
    say('Making the picture…');
    let blob;
    try { blob = await toBlob(await make(spec)); }
    catch (err){ say((err && err.message) || 'The picture couldn’t be made. Try again in a moment.'); return null; }
    const t = document.getElementById('toast'); if (t) t.hidden = true;
    const title = spec.title || spec.name || 'shelfstackd', file = new File([blob], FILE, {type: 'image/png'});
    if (phone() && navigator.canShare && navigator.canShare({files: [file]})) shareSheet(blob, file, title);
    else { save(blob); say('Saved as ' + FILE + '. Add it to your Instagram story.'); }
    return blob;
  }
  // a picture made on the page (make/'s shelf): the sheet and its Share where the browser can share it, otherwise saved
  function offer(blob, {title = 'shelfstackd', file = FILE} = {}){
    const f = new File([blob], file, {type: 'image/png'});
    if (navigator.canShare && navigator.canShare({files: [f]})) shareSheet(blob, f, title);
    else { save(blob, file); say('Saved as ' + file + '.'); }
  }
  window.Story = {make, share, offer, FILE};
})();
