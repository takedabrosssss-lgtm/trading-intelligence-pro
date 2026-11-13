/* MIRAGE REBORN — independent visual layer
   Keeps existing app data, API, navigation and mode controller intact. */
(() => {
  "use strict";
  if (window.__MIRAGE_REBORN__) return;
  window.__MIRAGE_REBORN__ = true;

  const CSS_HREF = "mirage-reborn.css?v=20261113-reborn1";
  const LEGACY = /(?:premium-dashboard|mirage-dual-worlds|mirage-refinement|mirage-release|mirage-mobile-first|mirage-luxe)\.css(?:\?|$)/i;

  function cleanLegacyStyles() {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const href = link.getAttribute("href") || "";
      if (LEGACY.test(href)) link.remove();
    });
  }

  function installStyles() {
    cleanLegacyStyles();
    let link = document.getElementById("mirage-reborn-css");
    if (!link) {
      link = document.createElement("link");
      link.id = "mirage-reborn-css";
      link.rel = "stylesheet";
      link.href = CSS_HREF;
    }
    document.head.appendChild(link);
  }

  function brandMark() {
    const host = document.querySelector(".brand-mark");
    if (!host || host.dataset.reborn === "1") return;
    host.innerHTML = `
      <svg class="mr-brand-svg" viewBox="0 0 48 48" role="img" aria-label="MIRAGE">
        <defs>
          <linearGradient id="mrMarkA" x1="5" y1="5" x2="43" y2="43" gradientUnits="userSpaceOnUse">
            <stop stop-color="#42c8d9"/><stop offset=".52" stop-color="#5576c9"/><stop offset="1" stop-color="#8e79dc"/>
          </linearGradient>
          <linearGradient id="mrMarkB" x1="9" y1="7" x2="38" y2="42" gradientUnits="userSpaceOnUse">
            <stop stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#b9d7e9" stop-opacity=".24"/>
          </linearGradient>
        </defs>
        <path d="M24 3.8 42.8 14.6v18.8L24 44.2 5.2 33.4V14.6L24 3.8Z" fill="url(#mrMarkB)" stroke="url(#mrMarkA)" stroke-width="1.5"/>
        <path d="M12.7 32.4V15.8L24 28.2l11.3-12.4v16.6" fill="none" stroke="url(#mrMarkA)" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="m12.7 15.8 11.3 12.4 11.3-12.4" fill="none" stroke="#fff" stroke-opacity=".72" stroke-width=".9" stroke-linecap="round"/>
      </svg>`;
    host.dataset.reborn = "1";
    host.setAttribute("aria-label", "MIRAGE");
  }

  function phantomIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8c-4.25 0-7.35 3.2-7.35 7.55v9.1c0 1.05 1.12 1.6 1.98.94l2.05-1.58 2.02 1.52c.78.59 1.83.59 2.6 0l2.02-1.52 2.05 1.58c.86.66 1.98.11 1.98-.94v-9.1c0-4.35-3.1-7.55-7.35-7.55Z"/>
      <path d="M9.1 10.1h.01M14.9 10.1h.01M9.25 14.1c.72.83 1.63 1.25 2.75 1.25s2.03-.42 2.75-1.25"/>
      <path d="M7.3 5.1 5.8 3.8M16.7 5.1l1.5-1.3"/>
    </svg>`;
  }

  function openPhantom() {
    const existing = document.getElementById("mp-phantom");
    if (existing) {
      existing.click();
      return;
    }
    const profile = document.querySelector('.bottom-nav [data-page="profile"], [data-page="profile"]');
    if (profile) profile.click();
    window.setTimeout(() => {
      const card = document.getElementById("mirage-phantom-card");
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 260);
  }

  function phantomButton() {
    const actions = document.querySelector(".top-actions");
    if (!actions || document.getElementById("mirage-phantom-quick")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "mirage-phantom-quick";
    button.className = "mirage-phantom-quick";
    button.title = "Protocol Phantom";
    button.setAttribute("aria-label", "Protocol Phantom");
    button.innerHTML = `${phantomIcon()}<span>PROTOCOL PHANTOM</span>`;
    button.addEventListener("click", openPhantom);
    const refresh = document.getElementById("refresh-btn");
    if (refresh && refresh.parentElement === actions) actions.insertBefore(button, refresh);
    else actions.appendChild(button);
  }

  function tiltCards() {
    if (!matchMedia("(hover:hover) and (pointer:fine)").matches) return;
    document.querySelectorAll(".hero-card").forEach(card => {
      if (card.dataset.mrTilt === "1") return;
      card.dataset.mrTilt = "1";
      card.addEventListener("pointermove", event => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        card.style.setProperty("--mr-ry", `${(x - .5) * 3.2}deg`);
        card.style.setProperty("--mr-rx", `${(.5 - y) * 2.5}deg`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--mr-ry", "0deg");
        card.style.setProperty("--mr-rx", "0deg");
      });
    });
  }

  function syncTheme() {
    const mode = document.body?.dataset.mirageMode === "spectre" ? "spectre" : "stealth";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = mode === "spectre" ? "#080b16" : "#e9eff5";
    document.documentElement.dataset.mirageMode = mode;
  }

  function start() {
    installStyles();
    brandMark();
    phantomButton();
    tiltCards();
    syncTheme();

    const headObserver = new MutationObserver(records => {
      let changed = false;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('link[rel="stylesheet"]')) {
            const href = node.getAttribute("href") || "";
            if (LEGACY.test(href)) { node.remove(); changed = true; }
          }
        }
      }
      if (changed) installStyles();
    });
    headObserver.observe(document.head, { childList: true });

    const bodyObserver = new MutationObserver(records => {
      let refresh = false;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.(".brand-mark,.top-actions,.hero-card") ||
              node.querySelector?.(".brand-mark,.top-actions,.hero-card")) refresh = true;
        }
      }
      if (refresh) {
        brandMark();
        phantomButton();
        tiltCards();
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    const modeObserver = new MutationObserver(syncTheme);
    modeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-mirage-mode"] });
    document.addEventListener("mirage:modechange", syncTheme);
    window.addEventListener("mirage:pagechange", () => {
      requestAnimationFrame(tiltCards);
      const active = document.querySelector("main .page.active");
      if (active && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        active.animate(
          [{ opacity: .9, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 330, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }
    });
    console.info("MIRAGE REBORN: independent design system active");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
