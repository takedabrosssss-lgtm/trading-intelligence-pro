/* MIRAGE 3.1.1 — ISOLATED CINEMATIC TRANSITION FIX
   Replaces MIRAGE 3.1 mirage-refinement.js.
   Keeps the original MIRAGE controller animation underneath a separate eclipse veil,
   so two Web Animations never compete for the same element. */
(() => {
  "use strict";

  if (window.__MIRAGE_REFINED_MOTION_V311__) return;

  const api = window.MIRAGE_MODES;
  if (!api || typeof api.set !== "function") {
    console.warn("MIRAGE 3.1.1: mode controller not found; original controls remain active.");
    return;
  }

  window.__MIRAGE_REFINED_MOTION_V311__ = true;

  const originalSet = api.set.bind(api);
  const MODES = new Set(["stealth", "spectre"]);
  const DURATION = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1050 : 2650;

  let busy = false;
  let swapTimer = 0;
  let veilAnimation = null;

  const $ = (selector, root = document) => root.querySelector(selector);

  function installStyles() {
    if ($("#mirage-cinematic-veil-style")) return;

    const style = document.createElement("style");
    style.id = "mirage-cinematic-veil-style";
    style.textContent = `
      #mirage-cinematic-veil {
        position:fixed; inset:0; z-index:2147483000; display:grid;
        place-items:center; overflow:hidden; isolation:isolate;
        visibility:hidden; opacity:0; pointer-events:none;
        background:radial-gradient(ellipse at 50% 44%,rgba(17,25,23,.96),#020504 72%);
        color:#f4faf7; contain:layout paint style;
      }
      #mirage-cinematic-veil.to-spectre {
        background:radial-gradient(ellipse at 50% 44%,rgba(28,19,49,.97),#03020a 74%);
      }
      #mirage-cinematic-veil .mc-eclipse {
        position:absolute; width:min(120vw,900px); aspect-ratio:1;
        left:50%; top:50%; border-radius:50%;
        transform:translate(-50%,-50%) scale(.08);
        opacity:0; pointer-events:none;
        background:radial-gradient(circle at 34% 27%,rgba(255,255,255,.15),transparent 15%),
          radial-gradient(circle at 50% 50%,#050a08 0 42%,#14221d 54%,#020404 70%);
        box-shadow:0 0 0 2px rgba(175,237,208,.2),0 0 65px 20px rgba(78,221,159,.16),
          0 0 0 32px rgba(255,255,255,.018),0 0 0 76px rgba(255,255,255,.012);
      }
      #mirage-cinematic-veil.to-spectre .mc-eclipse {
        background:radial-gradient(circle at 34% 27%,rgba(255,255,255,.16),transparent 15%),
          radial-gradient(circle at 50% 50%,#090612 0 42%,#25183e 54%,#03020a 70%);
        box-shadow:0 0 0 2px rgba(204,180,255,.24),0 0 72px 22px rgba(156,119,245,.2),
          0 0 0 32px rgba(255,255,255,.02),0 0 0 76px rgba(255,255,255,.014);
      }
      #mirage-cinematic-veil .mc-ring {
        position:absolute; width:min(145vw,1100px); aspect-ratio:1;
        left:50%; top:50%; border:1px solid rgba(177,236,209,.25);
        border-radius:50%; transform:translate(-50%,-50%) rotate(-22deg) scale(.28);
        opacity:0; box-shadow:0 0 0 18px rgba(255,255,255,.012),
          0 0 0 55px rgba(177,236,209,.035),0 0 0 108px rgba(255,255,255,.012);
      }
      #mirage-cinematic-veil.to-spectre .mc-ring {
        border-color:rgba(202,179,255,.3);
        box-shadow:0 0 0 18px rgba(255,255,255,.012),
          0 0 0 55px rgba(185,151,255,.05),0 0 0 108px rgba(255,255,255,.014);
      }
      #mirage-cinematic-veil .mc-card {
        position:relative; z-index:3; display:flex; flex-direction:column;
        align-items:center; gap:18px; padding:24px; text-align:center;
      }
      #mirage-cinematic-veil .mc-mark {
        width:126px; height:126px; display:grid; place-items:center;
        border-radius:36px; color:#c5f8df;
        background:rgba(10,22,18,.9); border:1px solid rgba(190,245,220,.2);
        box-shadow:0 0 85px rgba(75,226,160,.24),inset 0 1px rgba(255,255,255,.18);
        transform:perspective(700px) rotateY(-48deg) rotateZ(-18deg) scale(.42);
        opacity:0; filter:blur(14px);
      }
      #mirage-cinematic-veil.to-spectre .mc-mark {
        color:#e4d8ff; background:rgba(22,14,39,.92);
        border-color:rgba(202,179,255,.25);
        box-shadow:0 0 90px rgba(167,139,255,.3),inset 0 1px rgba(255,255,255,.18);
      }
      #mirage-cinematic-veil .mc-mark svg { width:76px; height:76px; display:block; }
      #mirage-cinematic-veil .mc-title {
        font:800 13px/1.4 Manrope, sans-serif; letter-spacing:4.5px;
        color:#f4faf7; text-shadow:0 0 25px rgba(255,255,255,.22);
        opacity:0; transform:translateY(12px);
      }
      #mirage-cinematic-veil .mc-caption {
        font:600 9px/1.5 "DM Sans",sans-serif; letter-spacing:2.4px;
        color:rgba(220,230,226,.62); opacity:0; transform:translateY(10px);
      }
      @media(max-width:600px) {
        #mirage-cinematic-veil .mc-mark { width:108px; height:108px; border-radius:31px; }
      }
      @media(prefers-reduced-motion:reduce) {
        #mirage-cinematic-veil .mc-eclipse,
        #mirage-cinematic-veil .mc-ring { animation-duration:.7s!important; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureVeil() {
    let veil = $("#mirage-cinematic-veil");
    if (veil) return veil;

    veil = document.createElement("div");
    veil.id = "mirage-cinematic-veil";
    veil.setAttribute("aria-hidden", "true");
    veil.innerHTML = `
      <div class="mc-eclipse"></div>
      <div class="mc-ring"></div>
      <div class="mc-card">
        <div class="mc-mark"></div>
        <div class="mc-title">STEALTH MODE</div>
        <div class="mc-caption">RETURNING TO LOW SIGNATURE</div>
      </div>`;
    document.body.appendChild(veil);
    return veil;
  }

  function setVeilContent(veil, next) {
    const spectre = next === "spectre";
    veil.classList.toggle("to-spectre", spectre);

    const mark = $(".mc-mark", veil);
    const title = $(".mc-title", veil);
    const caption = $(".mc-caption", veil);

    if (mark) mark.innerHTML = api.symbols
      ? (spectre ? api.symbols.spectre : api.symbols.stealth)
      : "";
    if (title) title.textContent = spectre ? "SPECTRE MODE" : "STEALTH MODE";
    if (caption) caption.textContent = spectre
      ? "ENTERING THE SPECTRAL LAYER"
      : "RETURNING TO LOW SIGNATURE";
  }

  function animateVeil(veil) {
    const eclipse = $(".mc-eclipse", veil);
    const ring = $(".mc-ring", veil);
    const mark = $(".mc-mark", veil);
    const title = $(".mc-title", veil);
    const caption = $(".mc-caption", veil);

    veil.style.visibility = "visible";
    veil.style.pointerEvents = "auto";

    const animations = [];
    animations.push(veil.animate(
      [{opacity:0},{opacity:1,offset:.22},{opacity:1,offset:.79},{opacity:0}],
      {duration:DURATION,easing:"cubic-bezier(.16,1,.3,1)",fill:"forwards"}
    ));
    if (eclipse) animations.push(eclipse.animate(
      [
        {transform:"translate(-50%,-50%) scale(.08) rotate(-28deg)",opacity:0},
        {transform:"translate(-50%,-50%) scale(.82) rotate(0)",opacity:1,offset:.28},
        {transform:"translate(-50%,-50%) scale(1.04) rotate(12deg)",opacity:1,offset:.72},
        {transform:"translate(-50%,-50%) scale(1.18) rotate(20deg)",opacity:0}
      ],
      {duration:DURATION,easing:"cubic-bezier(.16,1,.3,1)",fill:"both"}
    ));
    if (ring) animations.push(ring.animate(
      [
        {transform:"translate(-50%,-50%) rotate(-28deg) scale(.28)",opacity:0},
        {transform:"translate(-50%,-50%) rotate(8deg) scale(.92)",opacity:.9,offset:.32},
        {transform:"translate(-50%,-50%) rotate(48deg) scale(1.06)",opacity:.72,offset:.7},
        {transform:"translate(-50%,-50%) rotate(76deg) scale(1.24)",opacity:0}
      ],
      {duration:DURATION,easing:"cubic-bezier(.16,1,.3,1)",fill:"both"}
    ));
    if (mark) animations.push(mark.animate(
      [
        {transform:"perspective(700px) rotateY(-48deg) rotateZ(-18deg) scale(.42)",opacity:0,filter:"blur(14px)"},
        {transform:"perspective(700px) rotateY(12deg) rotateZ(8deg) scale(1.12)",opacity:1,filter:"blur(0)",offset:.48},
        {transform:"perspective(700px) rotateY(0) rotateZ(0) scale(1)",opacity:1,filter:"blur(0)"}
      ],
      {duration:DURATION*.82,easing:"cubic-bezier(.16,1,.3,1)",fill:"both"}
    ));
    [title,caption].filter(Boolean).forEach((el,i)=>animations.push(el.animate(
      [{opacity:0,transform:"translateY(12px)"},{opacity:1,transform:"translateY(0)",offset:.55},{opacity:1,transform:"translateY(-2px)"}],
      {duration:DURATION*.72,delay:DURATION*.12,easing:"cubic-bezier(.16,1,.3,1)",fill:"both"}
    )));

    return animations[0];
  }

  function transitionTo(next) {
    if (busy || !MODES.has(next) || api.current === next) return;

    busy = true;
    window.clearTimeout(swapTimer);

    const veil = ensureVeil();
    setVeilContent(veil, next);

    if (veilAnimation) {
      try { veilAnimation.cancel(); } catch (_) {}
      veilAnimation = null;
    }

    veilAnimation = animateVeil(veil);

    /* The original controller animates its own layer. It now runs underneath
       this independent, higher-z-index veil and cannot fight its opacity. */
    swapTimer = window.setTimeout(() => {
      try {
        originalSet(next);
      } catch (error) {
        console.error("MIRAGE mode switch failed:", error);
      }
    }, Math.round(DURATION * .38));

    veilAnimation.finished.catch(() => {}).finally(() => {
      window.clearTimeout(swapTimer);
      veil.style.visibility = "hidden";
      veil.style.opacity = "0";
      veil.style.pointerEvents = "none";
      veil.classList.remove("to-spectre");
      busy = false;
      veilAnimation = null;
    });
  }

  function install() {
    installStyles();
    ensureVeil();

    /* Capture before the controller's own bubble listener. */
    document.addEventListener("click", event => {
      const button = event.target && event.target.closest
        ? event.target.closest(".mirage-mode-toolbar [data-mode]")
        : null;
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      transitionTo(button.dataset.mode);
    }, true);

    /* Route programmatic mode changes through the same cinematic transition. */
    api.set = transitionTo;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
