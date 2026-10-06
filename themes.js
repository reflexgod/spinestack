/* Profile themes: the start of Pro's "Theme from a film". A theme is data, a few variables and a banner layered on the
   normal profile card, the way Discord dresses a profile: it changes the card (the photo, the name, the bio, the line
   of numbers, the buttons) and nothing else on the page or the site. Everyone who opens that profile sees it.

   For now the data is here: BY_USER says whose profile wears which theme (only @viraaj, Gummo). A later Pro version
   reads the same thing from the database (a theme id on the profile), and this file keeps the themes themselves.

   A theme:
     vars     its colours, as CSS variables on the card (the card's flat paper colour, its one accent, then its ink and
              its soft ink, which replace the site's black and grey inside the card and are checked for contrast)
     banner   '' draws the strip at the top of the card from CSS (a texture); a file name in assets/themes/<id>/ uses
              that picture instead. tests/specs/themes.spec.js fails if the file is there and this doesn't name it
     hand     the one handwritten face, for the name and the bio only (the rest stays Courier Prime)
     pins     how many titles from the pinned (main) shelf stand on the card's right on a wide window (u/ draws them);
              none on a phone
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
        '--th-paper': '#E9D63A',  // acid yellow: the flyer the card is photocopied on
        '--th-accent': '#E7A6B4', // bunny pink: the one accent, the open tab's line and the links' underline
        '--th-tape': '#E3D3A4',   // masking tape
        '--th-white': '#F3ECD2',  // a polaroid's white, gone yellow
        '--th-ink': '#000000',    // the card's text: toner black
        '--th-soft': '#1E1C12',   // the card's grey text, nearly as black: 12:1 or more on the paper, the tape and the white
      },
      banner: 'banner.jpg',
      hand: '"Permanent Marker", "Comic Sans MS", cursive',
      effect: 'vhs',
      pins: 4,
    },
  };
  const BY_USER = {viraaj: 'gummo'};

  // the grain: SVG noise, drawn here (no file to load), laid over the banner and, for the effect, over the card
  const noise = alpha => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0"/></filter><rect width="160" height="160" filter="url(#n)"/></svg>`)}")`;
  const NOISE = noise(.5);   // the effect's flicker
  // a photocopy's dirt, drawn the same way: noise cut at a level, so only its peaks print. size, how fine, the alpha
  // row (from the noise's red), and the ink (0 black, 1 white)
  const copy = (size, freq, oct, alpha, ink = 0) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${ink}  0 0 0 0 ${ink}  0 0 0 0 ${ink}  ${alpha}"/></filter><rect width="${size}" height="${size}" filter="url(#n)"/></svg>`)}")`;
  const SPECKS = copy(240, '.75', 2, '26 0 0 0 -19.6');      // dark specks, sparse and sharp
  const DUST = copy(180, '1.2', 1, '30 0 0 0 -23.1');        // finer ones
  const TONER = copy(480, '.006 .018', 3, '.9 0 0 0 -.43'); // uneven toner: blotches, a little darker in places
  const STREAK = copy(480, '.0015 .5', 1, '5 0 0 0 -3.55');  // the drum's streaks, across
  const SNOW = copy(200, '.8', 2, '22 0 0 0 -14.6', 1);      // white specks, for the dark strip
  const css = document.createElement('style');
  css.id = 'themeCss';
  css.textContent = `
/* any theme: the card on its own paper colour, its ink and soft ink in place of the site's black and grey, a banner on top */
.pcard.themed{--ink:var(--th-ink);--grey:var(--th-soft);color:var(--th-ink);background:var(--th-paper);border-radius:var(--radius);padding:0 var(--s5) var(--s5);overflow:hidden;isolation:isolate}
.pcard.themed .pbanner{display:block;position:relative;height:112px;margin:0 calc(-1 * var(--s5)) 0}
.pcard.themed .phead{position:relative;align-items:start;margin-top:-40px}
.pcard.themed .who{padding-top:48px}
.pcard.themed .tag{border-color:currentColor}
.pcard.themed .btn.primary,.pcard.themed .btn.follow:not([aria-pressed="true"]){background:var(--th-ink);color:var(--th-white, #FFFFFF)}
@media (max-width:640px){
  .pcard.themed{padding:0 var(--s4) var(--s4)}
  .pcard.themed .pbanner{height:88px;margin:0 calc(-1 * var(--s4)) 0}
  .pcard.themed .phead{margin-top:-32px}
  .pcard.themed .who{padding-top:40px}
}
/* Gummo: a cheap flyer run off on a tired photocopier. Flat acid yellow, toner specks and streaks, uneven toner; the
   strip on top a dark patch of copied photo (or the owner's banner.jpg) with the copier's snow over it; the photo a
   polaroid taped on, flash-lit, its white gone yellow; the name in marker on a torn strip of masking tape; the bio
   in marker too, a little crooked; the pinned titles copied in black and white on small cards, stuck on at the
   right. Bunny pink only on the open tab's line and the links. No gradients */
.pcard.theme-gummo{background:${SPECKS},${DUST},${STREAK},${TONER},var(--th-paper);background-size:240px 240px,180px 180px,480px 480px,480px 480px,auto}
.theme-gummo .pbanner{background:#17150D;box-shadow:0 1px 0 rgba(0,0,0,.6)}
.theme-gummo .pbanner::after{content:"";position:absolute;inset:0;background:${SNOW},${STREAK};background-size:200px 200px,480px 480px;pointer-events:none}
.theme-gummo .pbanner.file{background-size:cover;background-position:50% 92%}   /* the mattress and the chair (the picture's lower left) in the strip */
.theme-gummo .phead{grid-template-columns:96px minmax(0,1fr) auto;grid-template-areas:"ava who pins"}
.theme-gummo .ava{position:relative;overflow:visible;width:112px;height:132px;padding:8px 8px 28px;border:0;border-radius:2px;background:var(--th-white);
  box-shadow:0 2px 5px rgba(0,0,0,.45);transform:rotate(-3deg);font-size:36px;color:var(--th-ink)}
.theme-gummo .ava img{width:96px;height:96px;border-radius:0;filter:contrast(1.3) brightness(1.08) saturate(1.15)}
.theme-gummo .ava::before{content:"";position:absolute;z-index:1;top:16px;left:20px;width:44px;height:28px;border-radius:50%;background:rgba(255,255,255,.8);filter:blur(7px);pointer-events:none}
.theme-gummo .ava.add{background:var(--th-white);border:0}
.theme-gummo .ava.add::before{display:none}
.theme-gummo .ava .addphoto{width:96px;height:96px;border-radius:0;border:1px dashed var(--th-soft)}
.theme-gummo .ava::after{content:"";position:absolute;z-index:2;top:-10px;left:50%;width:60px;height:20px;margin-left:-30px;background:var(--th-tape);opacity:.9;transform:rotate(5deg);
  clip-path:polygon(0 10%,4% 0,96% 6%,100% 0,97% 35%,100% 62%,96% 100%,5% 94%,0 100%,3% 66%,0 38%)}
.theme-gummo .namerow h1{display:inline-block;padding:5px 22px 3px;background:${DUST},var(--th-tape);background-size:180px 180px,auto;color:var(--th-ink);font-family:var(--th-hand);font-weight:400;font-size:24px;line-height:1.2;letter-spacing:.02em;transform:rotate(-1.5deg);
  clip-path:polygon(0 6%,2% 0,5% 8%,9% 1%,92% 0,95% 7%,98% 0,100% 9%,98.5% 30%,100% 48%,98% 70%,100% 92%,97% 100%,93% 94%,88% 100%,6% 97%,3% 100%,0 93%,1.5% 72%,0 50%,2% 28%)}
.theme-gummo .pbio .bio{font-family:var(--th-hand);font-size:17px;line-height:1.5;transform:rotate(-1deg);transform-origin:0 50%}
.theme-gummo .since{color:var(--th-soft)}
.theme-gummo .counts a,.theme-gummo .mutual a,.theme-gummo .addbio{color:var(--th-ink);text-decoration:underline;text-decoration-color:var(--th-accent);text-decoration-thickness:3px;text-underline-offset:3px}
.pcard.theme-gummo ~ #viewProfile > .tabs button[aria-selected="true"]{border-bottom:3px solid #E7A6B4;margin-bottom:-1px;padding-bottom:calc(var(--s2) - 2px)}
/* the pinned titles: small black-and-white copies of their covers on yellowed cards, stuck on crooked */
.theme-gummo .ppins{grid-area:pins;list-style:none;margin:0;padding:28px var(--s2) 0 var(--s4);display:grid;grid-template-columns:repeat(2,74px);gap:var(--s4) var(--s4);align-content:start}
.theme-gummo .ppins[hidden]{display:none}
.theme-gummo .ppins a{position:relative;display:block;padding:5px;background:var(--th-white);box-shadow:0 1px 4px rgba(0,0,0,.4);transform:rotate(-4deg)}
.theme-gummo .ppins li:nth-child(2) a{transform:rotate(3deg) translateY(6px)}
.theme-gummo .ppins li:nth-child(3) a{transform:rotate(2deg)}
.theme-gummo .ppins li:nth-child(4) a{transform:rotate(-3deg) translateY(4px)}
.theme-gummo .ppins canvas{display:block;width:64px;height:96px;filter:grayscale(1) contrast(1.9) brightness(1.12);mix-blend-mode:multiply}
.theme-gummo .ppins a::after{content:"";position:absolute;inset:0;background:${SPECKS},${DUST};background-size:240px 240px,180px 180px;pointer-events:none}
.theme-gummo .ppins a:focus-visible{outline:2px solid var(--th-ink);outline-offset:3px}
@media (max-width:640px){
  .theme-gummo .phead{grid-template-columns:72px minmax(0,1fr);grid-template-areas:"ava who"}
  .theme-gummo .ppins{display:none}
  .theme-gummo .pbanner.file{background-size:166% auto;background-position:0 100%}   /* the mattress and the chair whole, to the right of the polaroid */
  .theme-gummo .ava{width:88px;height:106px;padding:6px 6px 24px;font-size:28px}
  .theme-gummo .ava img,.theme-gummo .ava .addphoto{width:76px;height:76px}
  .theme-gummo .ava::before{top:12px;left:14px;width:34px;height:22px}
  .theme-gummo .namerow h1{font-size:19px;padding:4px 14px 2px}
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
