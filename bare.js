/* Saved shelves drawn small, from their rows in shelf_items: home's cards and its wall of spines. Each row back into a
   book (its pictures through the Worker); the shelf cut out of a bare story (the books and their shelf on nothing, as
   the profile's hero draws it, for the grey panel); and spines one by one, as the builder's strip draws them. shelf.js
   does all the drawing and nothing here changes it. The same as bookOf(), bareShelf() and smallSpines() in u/: keep
   them in step.
   Bare.book(row): the book, or null if its picture didn't come. Bare.books(rows): the books, in order, without those.
   Bare.shelf(books, shelf): a canvas of the shelf cut down to its books, or null. Bare.spines(books, height): a canvas
   for each spine, all at one scale, the tallest that many CSS pixels high. Bare.ready: the spines' fonts. Load it
   after shelf.js and worker-address.js. */
(() => {
  if (window.Bare) return;
  const W = 1080, H = 1920;
  const worker = () => String(window.SPINESTACK_WORKER || '').trim().replace(/\/+$/, '');   // read each time: worker-address.js may change it
  const clean0 = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
  const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

  const srcOf = ref => ref.startsWith('a:') ? `${worker()}/archive/img?id=${ref.slice(2)}` : ref.startsWith('u:') ? `${worker()}/u/blob?k=${encodeURIComponent(ref.slice(2))}`
    : ref.startsWith('url:') ? `${worker()}/img?url=${encodeURIComponent(ref.slice(4))}` : '';
  async function book(r){
    const [spine, cover] = await Promise.all([r.spine_src, r.cover_src].map(ref => ref && srcOf(ref) ? timeout(Shelf.loadImg(srcOf(ref)), 15000).catch(() => null) : null));
    const look = r.look || {}, style = look.style || 'art';
    if ((style === 'real' && !spine) || (style === 'cover' && !cover)) return null;
    const t = look.pt && cover && r.kind === 'movie' ? Shelf.posterTitle(cover) : null, img = cover || spine;
    return Object.assign({kind:'book', author:'', studio:'', status:'', wf:1, hf:1, jit:0, cat:''}, clean0({id: r.item_id, title: r.title || '', author: r.author, kind: r.kind,
      year: r.year ? String(r.year) : undefined, style, font: look.font || 'oswald', bg: look.bg, fg: look.fg, accent: look.accent, wf: look.wf, hf: look.hf, jit: look.jit,
      studio: look.studio, cat: look.cat, img: img || undefined, spineImg: spine || undefined, titleImg: t ? t.img : undefined}));
  }
  const books = async rows => (await Promise.all(rows.map(book))).filter(Boolean);

  // covers stand face out, so a book with no cover gets a plain one in its own colours with its title
  const PLAIN = new WeakMap();
  function plainCover(b){
    let c = PLAIN.get(b); if (c) return c;
    c = document.createElement('canvas'); c.width = 400; c.height = 600;
    const x = c.getContext('2d'); x.fillStyle = b.bg || '#161616'; x.fillRect(0, 0, 400, 600);
    x.fillStyle = b.fg || '#F1EEE6'; x.font = '500 30px "Geist Mono", ui-monospace, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const lines = []; let line = '';
    for (const w of String(b.title || '').split(/\s+/).filter(Boolean)){ const t = line ? line + ' ' + w : w; if (line && x.measureText(t).width > 340){ lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    const shown = lines.slice(0, 6); shown.forEach((l, i) => x.fillText(l, 200, 300 + (i - (shown.length - 1)/2)*42));
    PLAIN.set(b, c); return c;
  }
  const facing = (list, layout) => layout === 'covers' ? list.map(b => b.img ? b : {...b, img: plainCover(b)}) : list;

  // the story drawn bare, then cut down to the books and their shelf with a little room round them
  function shelf(list, s){
    if (!list.length) return null;
    const st = {caption:'', theme:'paper', layout: s.layout || 'row', varied: s.varied !== false, wood: !!s.wood, filter: s.filter || 'clean', intensity: s.intensity == null ? 70 : s.intensity,
      plank: !!(s.pro || {}).plank, shelfColour: (s.pro || {}).shelf_colour};
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', {willReadFrequently: true});
    Shelf.renderStory(x, st.filter, false, facing(list, st.layout), st, true);
    const d = x.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y += 2) for (let X = 0; X < W; X += 2) if (d[(y*W + X)*4 + 3] > 10){ if (X < x0) x0 = X; if (X > x1) x1 = X; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const m = 16; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W, x1 + m); y1 = Math.min(H, y1 + m);
    const out = document.createElement('canvas'); out.width = x1 - x0; out.height = y1 - y0;
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  // spines side by side, the tallest `height` CSS pixels high; a book that stands face out on its shelf is a spine here
  function spines(list, height){
    const dpr = Math.min(2, window.devicePixelRatio || 1), flat = list.map(Shelf.asSpine), s = Shelf.sizes(1160, 165, flat, {varied: true});
    const k = height / Math.max(...s.map(z => z.h));
    return flat.map((b, i) => {
      const c = Shelf.makeSpine(b, s[i].w*k*dpr, s[i].h*k*dpr);
      c.style.width = c.width/dpr + 'px'; c.style.height = c.height/dpr + 'px';
      return c;
    });
  }

  const FACES = ['600 40px Oswald','400 40px Oswald','600 40px "Cormorant Garamond"','italic 500 40px "Cormorant Garamond"','40px "Archivo Black"','40px "Gochi Hand"','500 40px "IBM Plex Mono"','400 40px "IBM Plex Mono"','600 40px "IBM Plex Sans"'];
  const ready = document.fonts ? Promise.all(FACES.map(f => document.fonts.load(f).catch(() => {}))) : Promise.resolve();

  /* A shelf, small, where shelves are listed (home's Just shelved, Shelves): no card and no box, its spines standing on
     a thin line (site.css's .sl), then its name and @username. tile(x, href) gives the <li>; lines(list, ask) fills
     each line in list with its shelf's first spines as it nears the screen, all the lines near it in one ask
     (ask(ids, n) gives shelf_items rows for those shelves, n at most each), and gives back a function to call when more
     tiles are put in the list; now: every line at once, for a short row that scrolls sideways (what's out of sight in it
     never nears the screen). A line whose spines can't be read stays an empty line. */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function tile(x, href){
    const li = document.createElement('li'), name = Shelf.shelfName({name: x.name, caption: x.caption});
    li.innerHTML = `<a href="${esc(href)}" aria-label="${esc(name)} by @${esc(x.username)}"><span class="sl" data-shelf="${esc(x.shelf_id)}"></span><span class="cap">${esc(name)}</span><span class="by">@${esc(x.username)}</span></a>`;
    return li;
  }
  const EACH = 12;   // a line holds about this many, at 96px; more would be cut off
  function lines(list, ask, now = false, n = EACH){
    const waiting = new Set(); let t = 0;
    const fill = async () => {
      const els = [...waiting]; waiting.clear(); if (!els.length) return;
      let rows; try { rows = await ask([...new Set(els.map(el => el.dataset.shelf))], n); } catch { return; }
      await ready;
      await Promise.all(els.map(async el => {
        const got = await books(rows.filter(r => r.shelf_id === el.dataset.shelf).sort((a, b) => a.position - b.position).slice(0, n));
        el.dataset.n = got.length;
        if (got.length) el.replaceChildren(...spines(got, el.clientHeight).map(c => { c.setAttribute('aria-hidden', 'true'); return c; }));
      }));
    };
    const soon = () => { clearTimeout(t); t = setTimeout(fill, 30); };
    const io = !now && 'IntersectionObserver' in window ? new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting){ io.unobserve(e.target); waiting.add(e.target); }
      soon();
    }, {rootMargin: '400px'}) : null;
    const watch = () => {
      for (const el of list.querySelectorAll('.sl[data-shelf]:not([data-w])')){ el.dataset.w = '1'; if (io) io.observe(el); else waiting.add(el); }
      if (!io) soon();
    };
    watch();
    return watch;
  }

  window.Bare = {book, books, shelf, spines, ready, tile, lines};
})();
