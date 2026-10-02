/* Spines on a shelf's picture say what they are. Hovering one shows a small tooltip, "Title (year) · creator"; pressing
   it goes to its row in the list next to the picture. shelf.js says where it drew each book (renderStory's spots, in
   story pixels), and the page hands those over:

     SpineTip.attach(stage, {canvas: () => the canvas now on the page, spots: () => [{i, x, y, w, h}, …],
       label: i => 'Gummo (1997) · Harmony Korine', pick: i => { … }, quiet: () => true while something is being dragged,
       skip: event => true for a press that isn't on the picture itself, pointer: true to show a hand over a spine})

   stage is the positioned box the canvas sits in; the tooltip is put inside it. SpineTip.flash(row) brings a list's row
   into view and marks it for a moment. Used by a shelf's page (u/) and the builder's preview (build/). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.spinetip{position:absolute;z-index:4;max-width:min(260px,90%);padding:var(--s1,4px) var(--s2,8px);border-radius:var(--radius,3px);background:var(--ink,#000);color:var(--paper,#fff);
  font:400 var(--fs-small,11px)/1.4 var(--mono,monospace);letter-spacing:0;text-transform:none;text-align:center;pointer-events:none}
.spine-flash{background:var(--wash,#F3F3F3);outline:2px solid var(--ink,#000);outline-offset:2px}`;
  document.head.appendChild(css);

  function attach(stage, opt){
    const tip = document.createElement('div'); tip.className = 'spinetip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    let shown = -1;
    // the spine under the pointer, the one drawn last first (it's in front)
    const spotAt = e => {
      const c = opt.canvas(); if (!c) return null;
      const r = c.getBoundingClientRect(), k = c.width / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k, sp = opt.spots() || [];
      for (let i = sp.length - 1; i >= 0; i--){ const s = sp[i]; if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s; }
      return null;
    };
    function hide(){
      shown = -1; tip.hidden = true;
      const c = opt.pointer && opt.canvas(); if (c) c.style.cursor = '';
    }
    function show(s){
      const text = opt.label(s.i), c = opt.canvas();
      if (!text){ hide(); return; }
      if (!tip.isConnected) stage.appendChild(tip);   // the page may have drawn the stage's contents again
      if (shown !== s.i){ shown = s.i; tip.textContent = text; }
      tip.hidden = false;
      if (opt.pointer) c.style.cursor = 'pointer';
      // over the top of the spine, in the middle of it, kept inside the picture; under the spine when there's no room above
      const r = c.getBoundingClientRect(), box = stage.getBoundingClientRect(), k = r.width / c.width, x0 = r.left - box.left, y0 = r.top - box.top, w = tip.offsetWidth, h = tip.offsetHeight;
      let top = y0 + s.y * k - h - 6; if (top < y0 + 4) top = y0 + (s.y + s.h) * k + 6;
      tip.style.left = Math.max(x0 + 4, Math.min(x0 + (s.x + s.w / 2) * k - w / 2, x0 + r.width - w - 4)) + 'px';
      tip.style.top = top + 'px';
    }
    const off = e => (opt.quiet && opt.quiet()) || (opt.skip && opt.skip(e));
    stage.addEventListener('pointermove', e => {
      const s = e.pointerType === 'mouse' && !off(e) ? spotAt(e) : null;   // a finger has no hover: it presses
      if (s) show(s); else if (!tip.hidden) hide();
    });
    stage.addEventListener('pointerleave', hide);
    stage.addEventListener('pointerdown', hide);
    stage.addEventListener('click', e => {
      if (off(e)) return;
      const s = spotAt(e); if (s && opt.pick) opt.pick(s.i);
    });
    return {hide};
  }

  // a row of a list: into view, and marked for a moment
  function flash(row){
    if (!row) return;
    row.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    row.classList.add('spine-flash'); clearTimeout(row._flash);
    row._flash = setTimeout(() => row.classList.remove('spine-flash'), 1800);
  }

  window.SpineTip = {attach, flash};
})();
