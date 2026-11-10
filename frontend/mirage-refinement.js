/* MIRAGE 3.5 — SINGLE-OWNER BLACKOUT TRANSITION
   Replace frontend/mirage-refinement.js with this complete file.
   Requires setImmediate() added to MIRAGE_MODES in mirage-dual-worlds.js.
*/
(() => {
  "use strict";
  if (window.__MIRAGE_MOTION_V35__) return;

  const MODES = new Set(["stealth", "spectre"]);
  const $ = (s, root = document) => root.querySelector(s);
  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  let api = null;
  let busy = false;
  let lastTabId = "";
  let lastTabAt = 0;

  function installStyles() {
    if ($("#mirage-motion-v35-style")) return;
    const style = document.createElement("style");
    style.id = "mirage-motion-v35-style";
    style.textContent = `
      /* The old short transition must never compete with this controller. */
      #mirage-transition {
        display:none!important; visibility:hidden!important; opacity:0!important;
        animation:none!important; transition:none!important; pointer-events:none!important;
      }

      /* Keep navigation changes immediate; no black flash between tabs. */
      main .page, main .page.active, main .page:not(.active) {
        animation:none!important; transition:none!important;
        filter:none!important; -webkit-filter:none!important;
      }
      main .page.active { opacity:1!important; visibility:visible!important; }
      main .page:not(.active) { opacity:1!important; }
      .bottom-nav .nav-item:active { transform:none!important; }

      #mirage-blackout-v35 {
        position:fixed!important; inset:0!important; z-index:2147483647!important;
        display:grid!important; place-items:center!important; overflow:hidden!important;
        visibility:hidden!important; opacity:0!important; pointer-events:none!important;
        isolation:isolate!important; contain:layout paint style!important;
        background:#020504!important; color:#f5faf7!important;
        will-change:opacity!important;
      }
      #mirage-blackout-v35[data-mode="spectre"] { background:#03020a!important; }
      #mirage-blackout-v35 .v35-halo {
        position:absolute; width:min(118vw,900px); aspect-ratio:1;
        left:50%; top:50%; border-radius:50%;
        transform:translate(-50%,-50%) scale(.52); opacity:0;
        background:radial-gradient(circle,rgba(14,24,19,.98) 0 38%,rgba(29,55,43,.78) 52%,transparent 72%);
        transition:opacity 900ms cubic-bezier(.2,.75,.2,1),transform 1050ms cubic-bezier(.16,1,.3,1);
      }
      #mirage-blackout-v35[data-mode="spectre"] .v35-halo {
        background:radial-gradient(circle,rgba(19,12,34,.98) 0 38%,rgba(65,43,103,.78) 52%,transparent 72%);
      }
      #mirage-blackout-v35 .v35-ring {
        position:absolute; width:min(130vw,1000px); aspect-ratio:1;
        left:50%; top:50%; border:1px solid rgba(184,242,213,.22);
        border-radius:50%; opacity:0;
        transform:translate(-50%,-50%) scale(.56) rotate(-32deg);
        transition:opacity 950ms ease,transform 1150ms cubic-bezier(.16,1,.3,1);
        box-shadow:0 0 0 28px rgba(255,255,255,.012),0 0 0 70px rgba(184,242,213,.025),0 0 75px rgba(82,221,158,.12);
      }
      #mirage-blackout-v35[data-mode="spectre"] .v35-ring {
        border-color:rgba(207,185,255,.28);
        box-shadow:0 0 0 28px rgba(255,255,255,.012),0 0 0 70px rgba(194,165,255,.035),0 0 85px rgba(163,128,255,.17);
      }
      #mirage-blackout-v35 .v35-center {
        position:relative; z-index:2; display:flex; flex-direction:column;
        align-items:center; gap:17px; padding:24px; text-align:center;
        opacity:0; transform:translateY(18px) scale(.97);
        transition:opacity 750ms ease,transform 900ms cubic-bezier(.16,1,.3,1);
      }
      #mirage-blackout-v35 .v35-symbol {
        width:116px; height:116px; display:grid; place-items:center;
        border-radius:34px; color:#c8f8df; background:rgba(10,22,17,.92);
        border:1px solid rgba(190,245,220,.22);
        box-shadow:0 0 78px rgba(75,226,160,.22),inset 0 1px rgba(255,255,255,.17);
        transform:perspective(700px) rotateY(-28deg) rotateZ(-8deg) scale(.82);
        transition:transform 1050ms cubic-bezier(.16,1,.3,1);
      }
      #mirage-blackout-v35[data-mode="spectre"] .v35-symbol {
        color:#e6dcff;background:rgba(22,14,39,.94);border-color:rgba(207,185,255,.28);
        box-shadow:0 0 84px rgba(167,139,255,.28),inset 0 1px rgba(255,255,255,.17);
      }
      #mirage-blackout-v35 .v35-symbol svg { display:block;width:72px;height:72px; }
      #mirage-blackout-v35 .v35-title {
        font:800 13px/1.4 Manrope,sans-serif;letter-spacing:4px;color:#f5faf7;
      }
      #mirage-blackout-v35 .v35-caption {
        font:600 9px/1.5 "DM Sans",sans-serif;letter-spacing:2.3px;color:rgba(220,230,226,.62);
      }
      #mirage-blackout-v35.reveal .v35-halo { opacity:.94;transform:translate(-50%,-50%) scale(1.02); }
      #mirage-blackout-v35.reveal .v35-ring { opacity:.88;transform:translate(-50%,-50%) scale(1.02) rotate(16deg); }
      #mirage-blackout-v35.reveal .v35-center { opacity:1;transform:translateY(0) scale(1); }
      #mirage-blackout-v35.reveal .v35-symbol { transform:perspective(700px) rotateY(0) rotateZ(0) scale(1); }
      @media(max-width:600px) {
        #mirage-blackout-v35 .v35-symbol {width:104px;height:104px;border-radius:30px;}
      }
      @media(prefers-reduced-motion:reduce) {
        #mirage-blackout-v35 .v35-halo,#mirage-blackout-v35 .v35-ring,
        #mirage-blackout-v35 .v35-center,#mirage-blackout-v35 .v35-symbol { transition-duration:180ms!important; }
      }
    `;
    document.head.appendChild(style);
  }

  function getVeil() {
    let veil = $("#mirage-blackout-v35");
    if (veil) return veil;
    veil = document.createElement("div");
    veil.id = "mirage-blackout-v35";
    veil.setAttribute("aria-hidden", "true");
    veil.innerHTML = `
      <div class="v35-halo"></div><div class="v35-ring"></div>
      <div class="v35-center">
        <div class="v35-symbol"></div>
        <div class="v35-title"></div>
        <div class="v35-caption"></div>
      </div>`;
    document.body.appendChild(veil);
    return veil;
  }

  function setIdentity(veil, next) {
    const spectre = next === "spectre";
    veil.dataset.mode = next;
    $(".v35-symbol", veil).innerHTML = api.symbols
      ? (spectre ? api.symbols.spectre : api.symbols.stealth) : "";
    $(".v35-title", veil).textContent = spectre ? "SPECTRE MODE" : "STEALTH MODE";
    $(".v35-caption", veil).textContent = spectre
      ? "ENTERING THE SPECTRAL LAYER" : "RETURNING TO LOW SIGNATURE";
  }

  async function transitionTo(next) {
    if (busy || !MODES.has(next) || api.current === next) return;
    busy = true;
    const veil = getVeil();
    setIdentity(veil, next);
    veil.classList.remove("reveal");

    try {
      veil.style.setProperty("display", "grid", "important");
      veil.style.setProperty("visibility", "visible", "important");
      veil.style.setProperty("pointer-events", "auto", "important");
      veil.style.setProperty("transition", "opacity 1100ms cubic-bezier(.55,0,.85,.35)", "important");
      veil.style.setProperty("opacity", "0", "important");
      void veil.offsetHeight;
      await wait(50);
      veil.style.setProperty("opacity", "1", "important");
      await wait(1120);                  // fade completely to black
      await wait(220);                   // deliberate black-screen pause

      // Crucial: update mode without invoking the legacy animation.
      if (typeof api.setImmediate !== "function") {
        throw new Error("MIRAGE_MODES.setImmediate is missing; apply the controller patch.");
      }
      api.setImmediate(next);
      if (api.current !== next) {
        throw new Error("Mode controller did not confirm the requested mode.");
      }

      await wait(160);
      veil.classList.add("reveal");       // emblem and spectral geometry emerge
      await wait(1050);
      veil.style.setProperty("transition", "opacity 900ms cubic-bezier(.22,.61,.36,1)", "important");
      veil.style.setProperty("opacity", "0", "important");
      await wait(920);
    } catch (error) {
      console.error("MIRAGE 3.5 transition error:", error);
    } finally {
      // Fail-safe: never leave the user trapped behind a black overlay.
      veil.classList.remove("reveal");
      veil.style.setProperty("opacity", "0", "important");
      veil.style.setProperty("visibility", "hidden", "important");
      veil.style.setProperty("pointer-events", "none", "important");
      busy = false;
    }
  }

  function installTabStability() {
    document.addEventListener("click", event => {
      const button = event.target?.closest
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
      try { window.scrollTo({top:0,left:0,behavior:"instant"}); }
      catch (_) { window.scrollTo(0,0); }
    }, true);
  }

  function install() {
    api = window.MIRAGE_MODES;
    if (!api || typeof api.set !== "function") {
      console.error("MIRAGE 3.5: MIRAGE_MODES unavailable after DOMContentLoaded.");
      return;
    }

    installStyles();
    getVeil();
    installTabStability();

    document.addEventListener("click", event => {
      const button = event.target?.closest
        ? event.target.closest(".mirage-mode-toolbar [data-mode], .mirage-mode-option[data-mode]")
        : null;
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      transitionTo(button.dataset.mode);
    }, true);

    // Programmatic callers also use the cinematic transition.
    api.set = transitionTo;
    window.__MIRAGE_MOTION_V35__ = true;
    console.info("MIRAGE 3.5: single-owner transition installed.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
