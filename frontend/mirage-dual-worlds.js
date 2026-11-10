/* MIRAGE 3.0 — DUAL WORLDS CONTROLLER
   Presentation layer only. Keeps app.js and existing API interactions intact. */
(() => {
  "use strict";
  if (window.__MIRAGE_DUAL_WORLDS_V30__) return;
  window.__MIRAGE_DUAL_WORLDS_V30__ = true;

  const STORE_KEY = "mirage-mode-v3";
  const OLD_STORE_KEY = "mirage-mode-v1";
  const MODES = ["stealth", "spectre"];
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const svg = {
    stealth: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M7 31.5C13.5 19.8 22 14 32 14s18.5 5.8 25 17.5C50.5 43.2 42 50 32 50S13.5 43.2 7 31.5Z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M21 32c3.1-5 6.8-7.5 11-7.5S39.9 27 43 32c-3.1 5-6.8 7.5-11 7.5S24.1 37 21 32Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="32" cy="32" r="3.7" fill="currentColor"/><path d="M32 5v5M32 54v5M5 32h5M54 32h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".65"/></svg>`,
    spectre: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 54 16v16c0 12.7-8.4 21.3-22 27C18.4 53.3 10 44.7 10 32V16L32 5Z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m15 25 11-8 6 5 6-5 11 8-4 18-13 8-13-8-4-18Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="m20 31 10-2-4 8-6-1M44 31l-10-2 4 8 6-1M26 45l6-4 6 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 5v7M5 32h5M54 32h5" stroke="currentColor" stroke-width="1.4" opacity=".6"/></svg>`,
    home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/></svg>`,
    markets: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h17M7 15l4-4 3 2 6-7M16 6h4v4"/></svg>`,
    signals: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h3l3-8 4 10 3-7h5M17 5h4v4"/></svg>`,
    strategies: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-8 4.5 8 4.5 8-4.5L12 3ZM4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5"/></svg>`,
    portfolio: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/></svg>`,
    wallet: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2"/></svg>`,
    chart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h17M7 15l4-4 3 2 6-7"/></svg>`,
    trophy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4ZM7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></svg>`,
    activity: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.1-8 10-4.6-1.9-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>`,
    layers: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/></svg>`,
    exchange: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h14l-3-3M20 17H6l3 3"/></svg>`,
    chartUp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h17M7 15l4-4 3 2 6-7M16 6h4v4"/></svg>`
  };

  let mode = "stealth";
  let transitionBusy = false;
  try {
    const saved = localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY);
    if (MODES.includes(saved)) mode = saved;
  } catch (_) {}

  function icon(name, cls = "") {
    return `<span class="${cls}">${svg[name] || svg.activity}</span>`;
  }

  function ensureTransitionLayer() {
    let layer = $("#mirage-transition");
    if (layer) return layer;
    layer = document.createElement("div");
    layer.id = "mirage-transition";
    layer.className = "mirage-transition";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = `<div class="mirage-transition-card"><div class="mirage-transition-mark" id="mirage-transition-mark"></div><div class="mirage-transition-title" id="mirage-transition-title">STEALTH MODE</div><div class="mirage-transition-caption">RECONFIGURING INTERFACE</div></div>`;
    document.body.appendChild(layer);
    return layer;
  }

  function syncModeControls() {
    const isSpectre = mode === "spectre";
    const name = isSpectre ? "SPECTRE MODE" : "STEALTH MODE";
    const caption = isSpectre
      ? "SPECTRAL INTELLIGENCE  /  DEEP ANALYTICS"
      : "LOW SIGNATURE  /  FOCUSED EXECUTION";

    const brandSigil = $(".mirage-brand-sigil");
    if (brandSigil) brandSigil.innerHTML = svg[mode];
    const sigil = $(".mirage-mode-sigil");
    if (sigil) sigil.innerHTML = svg[mode];
    const title = $(".mirage-mode-copy strong");
    if (title) title.textContent = name;
    const sub = $(".mirage-mode-copy small");
    if (sub) sub.textContent = caption;

    $$(".mirage-mode-option").forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const overlayTitle = $("#mirage-transition-title");
    const overlayMark = $("#mirage-transition-mark");
    if (overlayTitle) overlayTitle.textContent = name;
    if (overlayMark) overlayMark.innerHTML = svg[mode];
    $$(".mirage-page-sigil").forEach(el => { el.innerHTML = svg[mode]; });

    const metaTheme = $('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = isSpectre ? "#070510" : "#040b08";
  }

  function setMode(next, animate = true) {
    if (!MODES.includes(next) || next === mode || transitionBusy) return;
    if (!animate) {
      mode = next;
      document.body.dataset.mirageMode = mode;
      document.documentElement.dataset.mirageMode = mode;
      try { localStorage.setItem(STORE_KEY, mode); } catch (_) {}
      syncModeControls();
      return;
    }

    transitionBusy = true;
    const layer = ensureTransitionLayer();
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 360 : 980;
    layer.classList.toggle("to-spectre", next === "spectre");
    layer.classList.add("is-active");
    layer.style.opacity = "0";
    layer.style.visibility = "visible";

    const mark = $("#mirage-transition-mark", layer);
    const card = $(".mirage-transition-card", layer);
    const title = $("#mirage-transition-title", layer);
    title.textContent = next === "spectre" ? "SPECTRE MODE" : "STEALTH MODE";
    mark.innerHTML = svg[next];

    const fadeIn = layer.animate(
      [{ opacity: 0 }, { opacity: 1, offset: .28 }, { opacity: 1, offset: .72 }, { opacity: 0 }],
      { duration, easing: "cubic-bezier(.2,.75,.2,1)", fill: "forwards" }
    );
    mark.animate(
      [
        { transform: "rotate(-22deg) scale(.55)", opacity: 0, filter: "blur(12px)" },
        { transform: "rotate(9deg) scale(1.08)", opacity: 1, filter: "blur(0px)", offset: .48 },
        { transform: "rotate(0deg) scale(1)", opacity: 1, filter: "blur(0px)" }
      ],
      { duration: duration * .78, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" }
    );
    card.animate(
      [{ transform: "translateY(18px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1, offset: .55 }, { transform: "translateY(-8px)", opacity: 1 }],
      { duration, easing: "cubic-bezier(.2,.75,.2,1)", fill: "both" }
    );

    window.setTimeout(() => {
      mode = next;
      document.body.dataset.mirageMode = mode;
      document.documentElement.dataset.mirageMode = mode;
      try { localStorage.setItem(STORE_KEY, mode); } catch (_) {}
      syncModeControls();
      refreshDecorativeIcons(document);
    }, duration * .43);

    fadeIn.finished.catch(() => {}).finally(() => {
      layer.classList.remove("is-active", "to-spectre");
      layer.style.opacity = "";
      layer.style.visibility = "";
      transitionBusy = false;
    });
  }

  function buildModeToolbar() {
    if ($(".mirage-mode-toolbar")) return;
    const topbar = $(".topbar");
    if (!topbar) return;
    const toolbar = document.createElement("section");
    toolbar.className = "mirage-mode-toolbar";
    toolbar.setAttribute("aria-label", "Переключение интерфейса MIRAGE");
    toolbar.innerHTML = `
      <div class="mirage-mode-identity">
        <div class="mirage-mode-sigil" aria-hidden="true">${svg[mode]}</div>
        <div class="mirage-mode-copy">
          <strong>${mode === "spectre" ? "SPECTRE MODE" : "STEALTH MODE"}</strong>
          <small>${mode === "spectre" ? "SPECTRAL INTELLIGENCE / DEEP ANALYTICS" : "LOW SIGNATURE / FOCUSED EXECUTION"}</small>
        </div>
      </div>
      <div class="mirage-mode-switch" role="group" aria-label="Режим интерфейса">
        <button type="button" class="mirage-mode-option" data-mode="stealth" aria-pressed="false">${icon("stealth","mode-option-glyph")}<span>STEALTH</span></button>
        <button type="button" class="mirage-mode-option" data-mode="spectre" aria-pressed="false">${icon("spectre","mode-option-glyph")}<span>SPECTRE</span></button>
      </div>`;
    topbar.insertAdjacentElement("afterend", toolbar);
    toolbar.addEventListener("click", event => {
      const button = event.target.closest("[data-mode]");
      if (button) setMode(button.dataset.mode, true);
    });
    syncModeControls();
  }

  function addBrandSigil() {
    const mark = $(".brand-mark");
    if (!mark || $(".mirage-brand-sigil", mark)) return;
    const span = document.createElement("span");
    span.className = "mirage-brand-sigil";
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = svg[mode];
    mark.appendChild(span);
  }

  function wrapElements(parent, className, elements) {
    if (!parent || $(`:scope > .${className}`, parent)) return;
    const existing = elements.filter(el => el && el.parentElement === parent);
    if (!existing.length) return;
    const wrapper = document.createElement("div");
    wrapper.className = className;
    parent.insertBefore(wrapper, existing[0]);
    existing.forEach(el => wrapper.appendChild(el));
  }

  function titleByText(root, text) {
    return $$(".section-title", root).find(el => (el.textContent || "").toLowerCase().includes(text.toLowerCase())) || null;
  }

  function addPageSigils() {
    $$(".page .page-intro").forEach(intro => {
      if ($(".mirage-page-sigil", intro)) return;
      const mark = document.createElement("div");
      mark.className = "mirage-page-sigil";
      mark.setAttribute("aria-hidden", "true");
      mark.innerHTML = svg[mode];
      intro.appendChild(mark);
    });
  }

  function buildPresentationGroups() {
    const dashboard = $("#dashboard");
    if (dashboard && !$(".mirage-dashboard-core", dashboard)) {
      const hero = $(".hero-card", dashboard);
      const kpis = $("#premium-kpis");
      wrapElements(dashboard, "mirage-dashboard-core", [hero, kpis]);
      const lab = [$("#premium-equity"), $("#premium-positions"), $("#premium-activity")];
      wrapElements(dashboard, "mirage-dashboard-lab", lab);

      const marketTitle = titleByText(dashboard, "Рынок сейчас");
      const marketPreview = $("#dashboard-markets");
      if (marketTitle || marketPreview) {
        const feed = document.createElement("div");
        feed.className = "mirage-dashboard-feed";
        dashboard.appendChild(feed);
        const marketGroup = document.createElement("section");
        marketGroup.className = "mirage-feed-markets";
        if (marketTitle) marketGroup.appendChild(marketTitle);
        if (marketPreview) marketGroup.appendChild(marketPreview);
        feed.appendChild(marketGroup);

        const statusTitle = titleByText(dashboard, "Система");
        const statusGrid = $(".status-grid", dashboard);
        const statusGroup = document.createElement("section");
        statusGroup.className = "mirage-feed-status";
        if (statusTitle) statusGroup.appendChild(statusTitle);
        if (statusGrid) statusGroup.appendChild(statusGrid);
        if (statusTitle || statusGrid) feed.appendChild(statusGroup);
      }
    }

    const portfolio = $("#portfolio");
    if (portfolio && !$(".mirage-portfolio-overview", portfolio)) {
      const total = $(".portfolio-total", portfolio);
      const stats = $("#portfolio-stats");
      wrapElements(portfolio, "mirage-portfolio-overview", [total, stats]);
    }

    const strategies = $("#strategies");
    if (strategies && !$(".mirage-strategy-overview", strategies)) {
      const summary = $(".strategy-summary", strategies);
      const list = $("#strategy-list");
      const note = $(".risk-note", strategies);
      wrapElements(strategies, "mirage-strategy-overview", [summary, list, note]);
    }

    const markets = $("#markets");
    if (markets && !$(".mirage-markets-workspace", markets)) {
      const toolbar = $(".market-toolbar", markets);
      const table = $("#markets-list");
      const chart = $(".chart-panel", markets);
      wrapElements(markets, "mirage-markets-workspace", [toolbar, table, chart]);
    }

    const signals = $("#signals");
    if (signals && !$(".mirage-signals-workspace", signals)) {
      const selector = $(".signal-selector", signals);
      const result = $("#analysis-result");
      const note = $(".disclaimer", signals);
      wrapElements(signals, "mirage-signals-workspace", [selector, result, note]);
    }
  }

  function replaceContents(el, name) {
    if (!el || el.dataset.mirageIcon === name) return;
    el.innerHTML = svg[name] || svg.activity;
    el.dataset.mirageIcon = name;
  }

  function refreshDecorativeIcons(root = document) {
    const navIcons = {
      dashboard: "home", markets: "markets", signals: "signals",
      strategies: "strategies", portfolio: "portfolio"
    };
    $$(".bottom-nav [data-page]", root).forEach(button => {
      const span = $("span", button);
      if (span) replaceContents(span, navIcons[button.dataset.page] || "activity");
    });
    $$(".status-card", root).forEach(card => {
      const title = ($("b", card)?.textContent || "").toLowerCase();
      const iconEl = $(".status-icon", card);
      if (iconEl) replaceContents(iconEl, title.includes("binance") ? "chart" : "shield");
    });
    $$(".kpi-icon", root).forEach(el => {
      const label = ($(".kpi-label", el.parentElement)?.textContent || "").toLowerCase();
      const iconName = label.includes("p&l") ? "chart" : label.includes("win") ? "trophy" : "wallet";
      replaceContents(el, iconName);
    });
    $$(".premium-section-title i", root).forEach(el => {
      const text = (el.parentElement?.textContent || "").toLowerCase();
      replaceContents(el, text.includes("пози") ? "layers" : "activity");
    });
    $$(".strategy-symbol", root).forEach(el => replaceContents(el, "layers"));
    $$(".risk-note > span", root).forEach(el => replaceContents(el, "shield"));
    $$(".placeholder-mark", root).forEach(el => {
      if (el.dataset.mirageIcon === "sigil") return;
      el.innerHTML = svg[mode];
      el.dataset.mirageIcon = "sigil";
    });
    $$(".premium-equity-head b", root).forEach(el => {
      if (el.dataset.mirageIcon === "chart") return;
      const label = (el.textContent || "").replace(/^[↗⇧↑]\s*/, "").trim() || "График капитала";
      el.innerHTML = `${svg.chartUp}<span>${label}</span>`;
      el.dataset.mirageIcon = "chart";
    });
    $$(".text-btn span", root).forEach(el => {
      if (el.dataset.mirageIcon === "arrow") return;
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M8 5h11v11"/></svg>`;
      el.dataset.mirageIcon = "arrow";
    });
    const refresh = $("#refresh-btn");
    if (refresh && refresh.dataset.mirageIcon !== "refresh") {
      refresh.innerHTML = svg.refresh;
      refresh.dataset.mirageIcon = "refresh";
      refresh.setAttribute("aria-label", "Обновить данные");
      refresh.setAttribute("title", "Обновить данные");
    }
  }

  function installConnectionMonitor() {
    if (window.__MIRAGE_FETCH_MONITOR__) return;
    window.__MIRAGE_FETCH_MONITOR__ = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      let url = "";
      try { url = typeof input === "string" ? input : input?.url || ""; } catch (_) {}
      const isApi = url.startsWith("/api/") || url.includes("/api/");
      return nativeFetch(input, init).then(response => {
        if (isApi) setConnection(response.ok);
        return response;
      }).catch(error => {
        if (isApi) setConnection(false);
        throw error;
      });
    };
    window.addEventListener("online", () => setConnection(null));
    window.addEventListener("offline", () => setConnection(false));
    setConnection(null);
  }

  function setConnection(online) {
    const led = $(".mirage-system-led");
    if (led) {
      led.classList.toggle("online", online === true);
      led.classList.toggle("offline", online === false);
      led.classList.toggle("checking", online === null);
      const label = online === true ? "Соединение активно"
        : online === false ? "Нет соединения" : "Проверка соединения";
      led.setAttribute("aria-label", label);
      led.title = label;
    }
  }

  function addSystemLed() {
    const brand = $(".brand-copy b");
    if (!brand || $(".mirage-system-led", brand)) return;
    const led = document.createElement("span");
    led.className = "mirage-system-led";
    led.setAttribute("role", "img");
    led.setAttribute("aria-label", "Проверка соединения");
    brand.appendChild(led);
    setConnection(null);
  }

  function prioritizeThemeStyles() {
    const link = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find(node => /(?:^|\/)mirage-dual-worlds\.css(?:\?|$)/.test(node.getAttribute("href") || ""));
    if (link && link.parentElement === document.head) document.head.appendChild(link);
  }

  function initialize() {
    prioritizeThemeStyles();
    document.body.dataset.mirageMode = mode;
    document.documentElement.dataset.mirageMode = mode;
    buildModeToolbar();
    addBrandSigil();
    addSystemLed();
    buildPresentationGroups();
    addPageSigils();
    refreshDecorativeIcons(document);
    ensureTransitionLayer();
    syncModeControls();
    installConnectionMonitor();

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) refreshDecorativeIcons(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.MIRAGE_MODES = {
      get current() { return mode; },
      set: next => setMode(next, true),
      // Atomic mode update for MIRAGE 3.5 cinematic transition.
      setImmediate: next => setMode(next, false),
      symbols: { stealth: svg.stealth, spectre: svg.spectre }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
