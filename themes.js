/* Profile themes: the start of Pro's "Theme from a film". A theme is data, a few variables and a banner layered on the
   normal profile card, the way Discord dresses a profile: it changes the card (the photo, the name, the bio, the line
   of numbers, the buttons) and nothing else on the page or the site. Everyone who opens that profile sees it.

   For now the data is here: BY_USER says whose profile wears which theme (only @viraaj, Gummo). A later Pro version
   reads the same thing from the database (a theme id on the profile), and this file keeps the themes themselves.

   A theme:
     vars     its colours, as CSS variables on the card (two for the card's gradient, then its accents, then its ink
              and its soft ink, which replace the site's black and grey inside the card and are checked for contrast)
     banner   '' draws the strip at the top of the card from CSS (a texture); a file name in assets/themes/<id>/ uses
              that picture instead. tests/specs/themes.spec.js fails if the file is there and this doesn't name it
     hand     the one handwritten face, for the bio only (the rest stays Courier Prime)
     effect   what plays once when the profile opens: 'vhs' is 2 seconds of film grain flickering and a blinking
              REC in the corner, then nothing. None at all with prefers-reduced-motion. No sound, ever
   No film stills, posters or logos: every picture in a theme is drawn here, or is the owner's own file.

   Themes.of(username) -> the theme, or null       Themes.apply(card, theme, {root, quiet}) dresses (or undresses) it */
(() => {
  if (window.Themes) return;
  const THEMES = {
    gummo: {
      id: 'gummo', name: 'Gummo',
      vars: {
        '--th-a': '#E7A6B4',      // bunny pink
        '--th-b': '#D9B23C',      // wall mustard
        '--th-siding': '#6E9A3A', // siding green
        '--th-sky': '#8FB3CF',    // washed sky
        '--th-brown': '#7A5A2E',  // bathwater brown
        '--th-tile': '#EDEBE4',   // tile white
        '--th-ink': '#15110A',    // the card's text
        '--th-soft': '#3B2A12',   // the card's grey text: 6:1 or more on both ends of the gradient
      },
      banner: '',
      hand: '"Gochi Hand", "Comic Sans MS", cursive',
      effect: 'vhs',
    },
  };
  const BY_USER = {viraaj: 'gummo'};

  // the grain: SVG noise, drawn here (no file to load), laid over the banner and, for the effect, over the card
  const noise = alpha => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0"/></filter><rect width="160" height="160" filter="url(#n)"/></svg>`)}")`;
  const NOISE = noise(.5), GRAIN = noise(.16);   // the effect's flicker; the banner's light grain
  const css = document.createElement('style');
  css.id = 'themeCss';
  css.textContent = `
/* any theme: the card on its own gradient, its ink and soft ink in place of the site's black and grey, a banner on top */
.pcard.themed{--ink:var(--th-ink);--grey:var(--th-soft);color:var(--th-ink);background:linear-gradient(160deg,var(--th-a) 0%,var(--th-b) 100%);border-radius:var(--radius);padding:0 var(--s5) var(--s5);overflow:hidden;isolation:isolate}
.pcard.themed .pbanner{display:block;height:112px;margin:0 calc(-1 * var(--s5)) 0}
.pcard.themed .phead{position:relative;align-items:start;margin-top:-40px}
.pcard.themed .who{padding-top:48px}
.pcard.themed .tag{border-color:currentColor}
.pcard.themed .btn.primary,.pcard.themed .btn.follow:not([aria-pressed="true"]){background:var(--th-ink);color:var(--th-tile)}
@media (max-width:640px){
  .pcard.themed{padding:0 var(--s4) var(--s4)}
  .pcard.themed .pbanner{height:88px;margin:0 calc(-1 * var(--s4)) 0}
  .pcard.themed .phead{margin-top:-32px}
  .pcard.themed .who{padding-top:40px}
}
/* Gummo: faded lime-green house siding with a light film grain; the photo a polaroid taped on, a little crooked,
   over the siding's foot; the name on a VHS tape's label; the bio in a hand */
.theme-gummo .pbanner{background:${GRAIN},repeating-linear-gradient(180deg,#CFE29A 0 13px,#B3CC78 13px 15px,#DDEBB2 15px 16px);background-size:160px 160px,auto;box-shadow:inset 0 -1px 0 rgba(59,42,18,.25)}
.theme-gummo .pbanner.file{background-size:cover;background-position:center}
.theme-gummo .ava{position:relative;overflow:visible;width:112px;height:132px;padding:8px 8px 28px;border:0;border-radius:2px;background:linear-gradient(var(--th-sky),var(--th-sky)) 8px 8px / 96px 96px no-repeat,#FFFFFF;
  box-shadow:0 2px 6px rgba(21,17,10,.28);transform:rotate(-3deg);font-size:36px;color:var(--th-ink)}
.theme-gummo .ava img{width:96px;height:96px;border-radius:0}
.theme-gummo .ava.add{background:#FFFFFF;border:0}
.theme-gummo .ava .addphoto{width:96px;height:96px;border-radius:0;border:1px dashed var(--th-soft)}
.theme-gummo .ava::after{content:"";position:absolute;top:-10px;left:50%;width:60px;height:20px;margin-left:-30px;background:rgba(237,235,228,.82);transform:rotate(5deg);box-shadow:0 1px 1px rgba(21,17,10,.12)}
.theme-gummo .namerow h1{display:inline-block;padding:4px 16px 4px 24px;background:repeating-linear-gradient(180deg,var(--th-tile) 0 7px,#D9D6CC 7px 8px),var(--th-tile);
  border-left:8px solid var(--th-siding);box-shadow:inset 6px 0 0 var(--th-sky),0 1px 2px rgba(21,17,10,.2);color:var(--th-ink);font-weight:700;letter-spacing:.04em;transform:rotate(-1deg)}
.theme-gummo .pbio .bio{font-family:var(--th-hand);font-size:17px;line-height:1.45}
.theme-gummo .since{color:var(--th-soft)}
.theme-gummo .counts a{color:var(--th-soft)}
@media (max-width:640px){
  .theme-gummo .ava{width:88px;height:106px;padding:6px 6px 24px;background-size:76px 76px;background-position:6px 6px;font-size:28px}
  .theme-gummo .ava img,.theme-gummo .ava .addphoto{width:76px;height:76px}
  .theme-gummo .namerow h1{font-size:18px;padding:4px 8px 4px 16px}
}
/* the profile effect: film grain flickering over the card and a blinking REC in its corner, 2 seconds, once */
.pcard .thfx{position:absolute;inset:0;z-index:3;pointer-events:none;background:${NOISE};background-size:160px 160px;opacity:0;mix-blend-mode:multiply;animation:thgrain .12s steps(1) infinite,thfade 2s linear forwards}
.pcard .threc{position:absolute;top:var(--s2);right:var(--s4);z-index:4;display:flex;align-items:center;gap:var(--s1);font:700 var(--fs-small)/1 var(--mono);letter-spacing:.12em;color:#FFFFFF;
  text-shadow:0 1px 2px rgba(0,0,0,.6);pointer-events:none;animation:thblink .5s steps(1) 4}
.pcard .threc i{display:block;width:8px;height:8px;border-radius:50%;background:#C8102E;box-shadow:0 0 0 1px rgba(255,255,255,.6)}
@keyframes thgrain{0%{background-position:0 0}25%{background-position:-37px 21px}50%{background-position:53px -11px}75%{background-position:-19px -47px}}
@keyframes thfade{0%{opacity:.55}15%{opacity:.25}30%{opacity:.6}45%{opacity:.3}60%{opacity:.5}80%{opacity:.25}100%{opacity:0}}
@keyframes thblink{0%{opacity:1}50%{opacity:0}}
@media (prefers-reduced-motion:reduce){ .pcard .thfx,.pcard .threc{display:none} }`;
  document.head.appendChild(css);

  const of = username => THEMES[BY_USER[String(username || '').toLowerCase()]] || null;
  const played = new WeakSet();
  function apply(card, theme, opt = {}){
    if (!card) return;
    const banner = card.querySelector('.pbanner');
    for (const c of [...card.classList]) if (c === 'themed' || c.startsWith('theme-')) card.classList.remove(c);
    card.querySelectorAll('.thfx, .threc').forEach(e => e.remove());
    if (!theme){ if (banner){ banner.hidden = true; banner.style.backgroundImage = ''; banner.classList.remove('file'); } card.removeAttribute('data-theme'); return; }
    card.classList.add('themed', 'theme-' + theme.id); card.dataset.theme = theme.id;
    for (const [k, v] of Object.entries(theme.vars)) card.style.setProperty(k, v);
    card.style.setProperty('--th-hand', theme.hand || 'inherit');
    if (banner){
      banner.hidden = false;
      if (theme.banner){ banner.classList.add('file'); banner.style.backgroundImage = `url("${(opt.root || '') + 'assets/themes/' + theme.id + '/' + theme.banner}")`; }
    }
    // the effect, once a page, as it opens; never with reduced motion
    if (theme.effect !== 'vhs' || opt.quiet || played.has(card) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    played.add(card);
    const fx = document.createElement('div'); fx.className = 'thfx'; fx.setAttribute('aria-hidden', 'true');
    const rec = document.createElement('div'); rec.className = 'threc'; rec.setAttribute('aria-hidden', 'true'); rec.innerHTML = '<i></i>REC';
    card.append(fx, rec);
    setTimeout(() => { fx.remove(); rec.remove(); }, 2000);
  }
  window.Themes = {THEMES, BY_USER, of, apply};
})();
