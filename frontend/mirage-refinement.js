/* MIRAGE 3.1 — cinematic mode transition patch. Load after mirage-dual-worlds.js. */
(() => {
  "use strict";
  if (window.__MIRAGE_REFINED_MOTION_V31__) return;
  const api = window.MIRAGE_MODES;
  if (!api || typeof api.set !== "function") {
    console.warn("MIRAGE 3.1 motion patch: mode controller not found.");
    return;
  }
  window.__MIRAGE_REFINED_MOTION_V31__ = true;
  const originalSet = api.set.bind(api);
  let busy = false;
  const $ = (s, root = document) => root.querySelector(s);

  function transitionTo(next) {
    if (busy || !["stealth","spectre"].includes(next) || api.current === next) return;
    busy = true;
    const layer = $("#mirage-transition");
    if (!layer) { originalSet(next, false); busy = false; return; }

    const mark = $("#mirage-transition-mark", layer);
    const card = $(".mirage-transition-card", layer);
    const title = $("#mirage-transition-title", layer);
    const caption = $(".mirage-transition-caption", layer);
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 900 : 2650;

    layer.classList.toggle("to-spectre", next === "spectre");
    layer.classList.add("is-active");
    layer.style.visibility = "visible";
    layer.style.opacity = "0";
    layer.style.pointerEvents = "auto";
    if (title) title.textContent = next === "spectre" ? "SPECTRE MODE" : "STEALTH MODE";
    if (caption) caption.textContent = next === "spectre" ? "ENTERING THE SPECTRAL LAYER" : "RETURNING TO LOW SIGNATURE";
    if (mark) mark.innerHTML = next === "spectre" ? api.symbols.spectre : api.symbols.stealth;

    const veil = layer.animate([
      {opacity:0,offset:0},{opacity:1,offset:.24},{opacity:1,offset:.78},{opacity:0,offset:1}
    ],{duration,easing:"cubic-bezier(.16,1,.3,1)",fill:"forwards"});

    if (mark) mark.animate([
      {transform:"perspective(700px) rotateY(-48deg) rotateZ(-18deg) scale(.42)",opacity:0,filter:"blur(16px)"},
      {transform:"perspective(700px) rotateY(12deg) rotateZ(8deg) scale(1.12)",opacity:1,filter:"blur(0)",offset:.48},
      {transform:"perspective(700px) rotateY(0) rotateZ(0) scale(1)",opacity:1,filter:"blur(0)"}
    ],{duration:duration*.82,easing:"cubic-bezier(.16,1,.3,1)",fill:"both"});

    if (card) card.animate([
      {transform:"translateY(26px) scale(.92)",opacity:0,filter:"blur(8px)"},
      {transform:"translateY(0) scale(1)",opacity:1,filter:"blur(0)",offset:.5},
      {transform:"translateY(-5px) scale(1.015)",opacity:1,filter:"blur(0)"}
    ],{duration:duration*.78,easing:"cubic-bezier(.16,1,.3,1)",fill:"both"});

    /* Swap theme at the eclipse's fully closed point, not in view. */
    window.setTimeout(() => {
      originalSet(next, false);
      document.body.classList.add("mirage-world-arrival");
      requestAnimationFrame(() => document.body.classList.remove("mirage-world-arrival"));
    },Math.round(duration*.53));

    veil.finished.catch(() => {}).finally(() => {
      layer.classList.remove("is-active","to-spectre");
      layer.style.opacity = "";
      layer.style.visibility = "";
      layer.style.pointerEvents = "";
      busy = false;
    });
  }

  api.set = transitionTo;
  const toolbar = $(".mirage-mode-toolbar");
  if (toolbar) toolbar.addEventListener("click",event => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    transitionTo(button.dataset.mode);
  },true);
})();
