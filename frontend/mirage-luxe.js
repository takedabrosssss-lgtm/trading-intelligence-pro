/* MIRAGE LUXE — interface finishing layer
   Keeps trading, API, account and navigation logic untouched. */
(() => {
  "use strict";
  if (window.__MIRAGE_LUXE_V1__) return;
  window.__MIRAGE_LUXE_V1__ = true;

  const CSS_ID = "mirage-luxe-css";
  const CSS_HREF = "mirage-luxe.css?v=20261113-luxe1";

  function installStyles() {
    let link = document.getElementById(CSS_ID);
    if (link) {
      link.href = CSS_HREF;
      document.head.appendChild(link);
      return;
    }
    link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = CSS_HREF;
    link.dataset.mirageLayer = "luxe";
    document.head.appendChild(link);
  }

  function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.content = document.body?.dataset.mirageMode === "spectre" ? "#070a12" : "#e3eaf2";
  }

  function repairBrandMark() {
    const mark = document.querySelector(".brand-mark");
    if (!mark || mark.dataset.luxeRebuilt === "true") return;

    mark.innerHTML = `
      <svg class="mirage-luxe-mark" viewBox="0 0 64 64" role="img" aria-label="MIRAGE">
        <defs>
          <linearGradient id="mirageLuxeMarkStroke" x1="7" y1="8" x2="57" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#82c8df"/>
            <stop offset=".48" stop-color="#557fb8"/>
            <stop offset="1" stop-color="#9a83df"/>
          </linearGradient>
          <linearGradient id="mirageLuxeMarkFill" x1="12" y1="7" x2="51" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".88"/>
            <stop offset="1" stop-color="#8daed3" stop-opacity=".12"/>
          </linearGradient>
        </defs>
        <path d="M32 4.8 54.7 17.9v28.2L32 59.2 9.3 46.1V17.9L32 4.8Z" fill="url(#mirageLuxeMarkFill)" stroke="url(#mirageLuxeMarkStroke)" stroke-width="1.7"/>
        <path d="M18.2 43.6V20.5l13.7 15.2 13.9-15.2v23.1" fill="none" stroke="url(#mirageLuxeMarkStroke)" stroke-width="4.3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M18.2 20.5 31.9 35.7l13.9-15.2" fill="none" stroke="white" stroke-opacity=".72" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    mark.dataset.luxeRebuilt = "true";
    mark.setAttribute("aria-label", "MIRAGE");
    mark.setAttribute("title", "MIRAGE");
  }

  function ghostIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.1a7.2 7.2 0 0 0-7.2 7.2v9.1c0 .9 1 1.4 1.7.8l2-1.5 2.1 1.5c.8.6 1.7.6 2.5 0l2.1-1.5 2 1.5c.8.6 1.8.1 1.8-.8v-9.1A7.2 7.2 0 0 0 12 3.1Z"/>
      <path d="M9 10.2h.01M15 10.2h.01M9.4 14.2c.7.8 1.6 1.2 2.6 1.2s1.9-.4 2.6-1.2"/>
    </svg>`;
  }

  function openPhantom() {
    const action = document.getElementById("mp-phantom");
    if (action) {
      action.click();
      return;
    }

    const profileNav = document.querySelector('.bottom-nav [data-page="profile"], [data-page="profile"]');
    if (profileNav) profileNav.click();

    window.setTimeout(() => {
      const card = document.getElementById("mirage-phantom-card");
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 220);
  }

  function installPhantomQuickAction() {
    const actions = document.querySelector(".top-actions");
    if (!actions || document.getElementById("mirage-phantom-quick")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "mirage-phantom-quick";
    button.className = "mirage-phantom-quick";
    button.setAttribute("aria-label", "Протокол Фантом — аварийная блокировка подключений");
    button.title = "Протокол Фантом";
    button.innerHTML = `${ghostIcon()}<span>ФАНТОМ</span>`;
    button.addEventListener("click", openPhantom);

    const refresh = document.getElementById("refresh-btn");
    if (refresh && refresh.parentElement === actions) {
      actions.insertBefore(button, refresh);
    } else {
      actions.appendChild(button);
    }
  }

  function polishInteractions() {
    document.addEventListener("click", event => {
      const nav = event.target.closest(".bottom-nav [data-page]");
      if (nav) {
        document.body.classList.add("mirage-luxe-navigating");
        window.setTimeout(() => document.body.classList.remove("mirage-luxe-navigating"), 520);
      }
    }, true);

    window.addEventListener("mirage:pagechange", () => {
      const active = document.querySelector("main .page.active");
      if (active) {
        active.animate(
          [{ opacity: .88, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" }
        );
      }
    });
  }

  function start() {
    installStyles();
    syncThemeColor();
    repairBrandMark();
    installPhantomQuickAction();
    polishInteractions();

    const modeObserver = new MutationObserver(syncThemeColor);
    modeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-mirage-mode"] });

    // Repair late re-renders without observing every text/style mutation.
    const observer = new MutationObserver(records => {
      let addedTopbar = false;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.(".topbar, .brand-mark, .top-actions") ||
              node.querySelector?.(".brand-mark, .top-actions")) {
            addedTopbar = true;
          }
        }
      }
      if (addedTopbar) {
        repairBrandMark();
        installPhantomQuickAction();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    console.info("MIRAGE LUXE: premium glass layer enabled.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
