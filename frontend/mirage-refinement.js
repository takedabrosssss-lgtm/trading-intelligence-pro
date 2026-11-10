/* MIRAGE 3.2 — SEQUENTIAL BLACKOUT MODE TRANSITION + STABLE TAB NAVIGATION
   Replace frontend/mirage-refinement.js with this complete file.
   No backend, trading, API, or database code is changed. */
(() => {
  "use strict";

  if (window.__MIRAGE_MOTION_V32__) return;

  const api = window.MIRAGE_MODES;
  if (!api || typeof api.set !== "function") {
    console.warn("MIRAGE 3.2: mode controller unavailable.");
    return;
  }

  window.__MIRAGE_MOTION_V32__ = true;

  const originalSet = api.set.bind(api);
  const MODES = new Set(["stealth", "spectre"]);
  const TOTAL = 3000;
  const REDUCED = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  let busy = false;
  let currentAnimation = null;
  let lastTabId = "";
  let lastTabAt = 0;

  const $ = (selector, root = document) => root.querySelector(selector);

  function injectFixes() {
    if ($("#mirage-motion-v32-style")) return;

    const style = document.createElement("style");
    style.id = "mirage-motion-v32-style";
    style.textContent = `
      /* The old controller overlay must never animate underneath the new one. */
      #mirage-transition {
        animation: none !important;
        transition: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        display: none !important;
      }

      /* Tab changes must not fade through the page's black background. */
      main .page,
      main .page.active,
      main .page:not(.active) {
        animation: none !important;
        transition: none !important;
        filter: none !important;
        -webkit-filter: none !important;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }
      main .page.active {
        opacity: 1 !important;
        visibility: visible !important;
      }
      main .page:not(.active) {
        opacity: 1 !important;
      }
      .bottom-nav .nav-item,
      .bottom-nav .nav-item.active,
      .bottom-nav .nav-item:active {
        transition: color .22s ease, background-color .22s ease,
          border-color .22s ease, box-shadow .22s ease !important;
      }
      .bottom-nav .nav-item:active {
        transform: none !important;
      }

      #mirage-cinematic-veil-v32 {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: grid;
        place-items: center;
        overflow: hidden;
        isolation: isolate;
        visibility: hidden;
        opacity: 0;
        pointer-events: none;
        contain: layout paint style;
        background: #020504;
        color: #f5faf7;
        will-change: opacity;
      }
      #mirage-cinematic-veil-v32[data-mode="spectre"] {
        background: #03020a;
      }
      #mirage-cinematic-veil-v32 .v32-halo {
        position: absolute;
        width: min(118vw, 900px);
        aspect-ratio: 1;
        left: 50%;
        top: 50%;
        border-radius: 50%;
        transform: translate(-50%, -50%) scale(.72);
        opacity: 0;
        background: radial-gradient(circle, rgba(14,24,19,.98) 0 38%,
          rgba(29,55,43,.78) 52%, transparent 72%);
        filter: blur(2px);
      }
      #mirage-cinematic-veil-v32[data-mode="spectre"] .v32-halo {
        background: radial-gradient(circle, rgba(19,12,34,.98) 0 38%,
          rgba(65,43,103,.78) 52%, transparent 72%);
      }
      #mirage-cinematic-veil-v32 .v32-ring {
        position: absolute;
        width: min(130vw, 1000px);
        aspect-ratio: 1;
        left: 50%;
        top: 50%;
        border: 1px solid rgba(184,242,213,.2);
        border-radius: 50%;
        transform: translate(-50%, -50%) scale(.7) rotate(-35deg);
        opacity: 0;
        box-shadow: 0 0 0 28px rgba(255,255,255,.012),
          0 0 0 70px rgba(184,242,213,.025),
          0 0 75px rgba(82,221,158,.12);
      }
      #mirage-cinematic-veil-v32[data-mode="spectre"] .v32-ring {
        border-color: rgba(207,185,255,.26);
        box-shadow: 0 0 0 28px rgba(255,255,255,.012),
          0 0 0 70px rgba(194,165,255,.035),
          0 0 85px rgba(163,128,255,.17);
      }
      #mirage-cinematic-veil-v32 .v32-center {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 17px;
        padding: 24px;
        text-align: center;
        opacity: 0;
        transform: translateY(14px);
      }
      #mirage-cinematic-veil-v32 .v32-symbol {
        width: 116px;
        height: 116px;
        display: grid;
        place-items: center;
        border-radius: 34px;
        color: #c8f8df;
        background: rgba(10,22,17,.92);
        border: 1px solid rgba(190,245,220,.22);
        box-shadow: 0 0 78px rgba(75,226,160,.22),
          inset 0 1px rgba(255,255,255,.17);
      }
      #mirage-cinematic-veil-v32[data-mode="spectre"] .v32-symbol {
        color: #e6dcff;
        background: rgba(22,14,39,.94);
        border-color: rgba(207,185,255,.28);
        box-shadow: 0 0 84px rgba(167,139,255,.28),
          inset 0 1px rgba(255,255,255,.17);
      }
      #mirage-cinematic-veil-v32 .v32-symbol svg {
        display: block;
        width: 72px;
        height: 72px;
      }
      #mirage-cinematic-veil-v32 .v32-title {
        font: 800 13px/1.4 Manrope, sans-serif;
        letter-spacing: 4px;
        color: #f5faf7;
      }
      #mirage-cinematic-veil-v32 .v32-caption {
        font: 600 9px/1.5 "DM Sans", sans-serif;
        letter-spacing: 2.3px;
        color: rgba(220,230,226,.62);
      }
      @media(max-width:600px) {
        #mirage-cinematic-veil-v32 .v32-symbol {
          width: 104px; height: 104px; border-radius: 30px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getVeil() {
    let veil = $("#mirage-cinematic-veil-v32");
    if (veil) return veil;

    veil = document.createElement("div");
    veil.id = "mirage-cinematic-veil-v32";
    veil.setAttribute("aria-hidden", "true");
    veil.innerHTML = `
      <div class="v32-halo"></div>
      <div class="v32-ring"></div>
      <div class="v32-center">
        <div class="v32-symbol"></div>
        <div class="v32-title">SPECTRE MODE</div>
        <div class="v32-caption">RECONFIGURING INTERFACE</div>
      </div>`;
    document.body.appendChild(veil);
    return veil;
  }

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  function setModeIdentity(veil, next) {
    const spectre = next === "spectre";
    veil.dataset.mode = next;
    const symbol = $(".v32-symbol", veil);
    const title = $(".v32-title", veil);
    const caption = $(".v32-caption", veil);

    if (symbol) {
      symbol.innerHTML = api.symbols
        ? (spectre ? api.symbols.spectre : api.symbols.stealth)
        : "";
    }
    if (title) title.textContent = spectre ? "SPECTRE MODE" : "STEALTH MODE";
    if (caption) caption.textContent = spectre
      ? "ENTERING THE SPECTRAL LAYER"
      : "RETURNING TO LOW SIGNATURE";
  }

  async function transitionTo(next) {
    if (busy || !MODES.has(next) || api.current === next) return;

    busy = true;
    const veil = getVeil();
    setModeIdentity(veil, next);

    const halo = $(".v32-halo", veil);
    const ring = $(".v32-ring", veil);
    const center = $(".v32-center", veil);
    const symbol = $(".v32-symbol", veil);

    veil.style.visibility = "visible";
    veil.style.pointerEvents = "auto";
    veil.style.opacity = "0";

    try {
      if (currentAnimation) currentAnimation.cancel();

      /* Phase 1 — the current interface slowly disappears completely. */
      currentAnimation = veil.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 1050, easing: "cubic-bezier(.55,0,.85,.35)", fill: "forwards" }
      );
      await currentAnimation.finished;

      /* Phase 2 — hold a genuinely black screen; change theme only while hidden. */
      await wait(220);
      originalSet(next, false);

      /* Phase 3 — the new world's emblem and spectral geometry emerge in darkness. */
      const revealAnimations = [];
      if (halo) revealAnimations.push(halo.animate(
        [
          { opacity: 0, transform: "translate(-50%,-50%) scale(.5)" },
          { opacity: .92, transform: "translate(-50%,-50%) scale(1.02)" }
        ],
        { duration: 820, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" }
      ));
      if (ring) revealAnimations.push(ring.animate(
        [
          { opacity: 0, transform: "translate(-50%,-50%) scale(.55) rotate(-35deg)" },
          { opacity: .85, transform: "translate(-50%,-50%) scale(1.02) rotate(18deg)" }
        ],
        { duration: 1050, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" }
      ));
      if (center) revealAnimations.push(center.animate(
        [
          { opacity: 0, transform: "translateY(20px) scale(.96)" },
          { opacity: 1, transform: "translateY(0) scale(1)" }
        ],
        { duration: 720, delay: 120, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" }
      ));
      if (symbol) revealAnimations.push(symbol.animate(
        [
          { transform: "perspective(700px) rotateY(-34deg) rotateZ(-12deg) scale(.72)", filter: "blur(8px)" },
          { transform: "perspective(700px) rotateY(8deg) rotateZ(4deg) scale(1.04)", filter: "blur(0)" },
          { transform: "perspective(700px) rotateY(0) rotateZ(0) scale(1)", filter: "blur(0)" }
        ],
        { duration: 1050, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" }
      ));

      await wait(1080);

      /* Phase 4 — reveal the finished interface slowly; no competing overlay. */
      currentAnimation = veil.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 650, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }
      );
      await currentAnimation.finished;
    } catch (error) {
      if (error && error.name !== "AbortError") {
        console.error("MIRAGE transition error:", error);
      }
    } finally {
      veil.style.visibility = "hidden";
      veil.style.opacity = "0";
      veil.style.pointerEvents = "none";
      [halo, ring, center, symbol].forEach(el => {
        if (!el) return;
        el.getAnimations().forEach(animation => animation.cancel());
        el.removeAttribute("style");
      });
      if (currentAnimation) {
        try { currentAnimation.cancel(); } catch (_) {}
        currentAnimation = null;
      }
      busy = false;
    }
  }

  function installTabStability() {
    /* Prevent duplicate navigation handlers from replaying the same tab change.
       Keep app.js' delegated handler alive for its data-loading side effects. */
    document.addEventListener("click", event => {
      const button = event.target && event.target.closest
        ? event.target.closest(".bottom-nav [data-page], [data-page].premium-link")
        : null;
      if (!button) return;

      const id = button.dataset.page;
      const page = id && document.getElementById(id);
      if (!page || !page.classList.contains("page")) return;

      const now = Date.now();
      if (id === lastTabId && now - lastTabAt < 180) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      lastTabId = id;
      lastTabAt = now;

      /* Avoid smooth-scroll compositing flashes while changing page containers. */
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      } catch (_) {
        window.scrollTo(0, 0);
      }
    }, true);
  }

  function install() {
    injectFixes();
    getVeil();
    installTabStability();

    /* The real controller uses .mirage-mode-option[data-mode]. */
    document.addEventListener("click", event => {
      const button = event.target && event.target.closest
        ? event.target.closest(".mirage-mode-toolbar [data-mode], .mirage-mode-option[data-mode]")
        : null;
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      transitionTo(button.dataset.mode);
    }, true);

    /* Programmatic changes use the same sequential blackout transition. */
    api.set = transitionTo;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
