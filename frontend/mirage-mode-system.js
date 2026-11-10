
/* =========================================================
   MIRAGE 2.7.1 — MODE SYSTEM
   STEALTH / SPECTRE
   Только интерфейс. Торговая логика не меняется.
   ========================================================= */

(() => {
  "use strict";

  if (window.__MIRAGE_MODE_SYSTEM__) return;
  window.__MIRAGE_MODE_SYSTEM__ = true;

  const STORAGE_KEY = "mirage-mode-v1";

  const MODES = {
    stealth: "STEALTH MODE",
    spectre: "SPECTRE MODE"
  };

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  let currentMode = "stealth";
  let switching = false;

  try {
    currentMode =
      localStorage.getItem(STORAGE_KEY) === "spectre"
        ? "spectre"
        : "stealth";
  } catch (_) {}

  /* Фирменный призрак */

  const stealthArt = `
    <svg viewBox="0 0 120 132" aria-hidden="true">
      <defs>
        <linearGradient id="mirageGhostGradient"
          x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#effff8"/>
          <stop offset="100%" stop-color="#63dcae"/>
        </linearGradient>
      </defs>
      <path d="M60 9C33 9 17 29 17 57v58c0 4 4 6 8 3l13-10 12 11c3 3 6 3 9 0l12-11 12 10c4 3 8 1 8-4V57C91 29 80 9 60 9Z"
        fill="url(#mirageGhostGradient)"/>
      <ellipse cx="45" cy="55" rx="5" ry="8" fill="#10251e"/>
      <ellipse cx="72" cy="55" rx="5" ry="8" fill="#10251e"/>
      <path d="M52 73q8 7 16 0" fill="none"
        stroke="#10251e" stroke-width="3"
        stroke-linecap="round"/>
    </svg>`;

  /* Эмблема SPECTRE */

  const spectreArt = `
    <svg viewBox="0 0 140 140" aria-hidden="true">
      <defs>
        <linearGradient id="mirageSpectreGradient"
          x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#d7fff4"/>
          <stop offset="50%" stop-color="#4be0b1"/>
          <stop offset="100%" stop-color="#163b36"/>
        </linearGradient>
        <filter id="mirageSpectreGlow">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <path d="M70 9 119 37v57l-49 28-49-28V37Z"
        fill="none" stroke="#48d9ad" stroke-opacity=".4"/>

      <path d="M70 19 109 42v46l-39 23-39-23V42Z"
        fill="url(#mirageSpectreGradient)"
        fill-opacity=".12"
        stroke="#75f3ca" stroke-width="1.5"/>

      <path d="M70 28 96 43v31L70 89 44 74V43Z"
        fill="#071410" stroke="#71f1c8"
        stroke-width="1.7" filter="url(#mirageSpectreGlow)"/>

      <path d="m50 57 14-8 6 5 6-5 14 8-7 18-13 8-13-8Z"
        fill="url(#mirageSpectreGradient)"/>

      <path d="m59 62 7-3m8 0 7 3"
        stroke="#03100d" stroke-width="3"
        stroke-linecap="round"/>

      <circle cx="70" cy="8" r="3" fill="#8dffdc"/>
      <circle cx="70" cy="119" r="3" fill="#8dffdc"/>
    </svg>`;

  /* Стили */

  const styles = `

    /* Верхняя панель режимов */

    .mode-toolbar {
      position:relative;
      z-index:19;
      width:100%;
      max-width:760px;
      min-height:48px;
      margin:0 auto;
      padding:7px 22px 0;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      box-sizing:border-box;
    }

    .mode-status-slot {
      min-width:0;
      display:flex;
      align-items:center;
    }

    .mode-status-slot .connection {
      margin:0;
    }

    .mode-switch {
      display:flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      min-height:36px;
      padding:7px 12px;
      border:1px solid rgba(255,255,255,.15);
      border-radius:999px;
      background:rgba(12,17,15,.9);
      color:#effff8;
      font:800 9px/1 "Manrope",sans-serif;
      letter-spacing:.09em;
      white-space:nowrap;
      cursor:pointer;
      backdrop-filter:blur(14px);
      transition:all .3s ease;
    }

    .mode-switch:active {
      transform:scale(.96);
    }

    .mode-switch-led {
      width:7px;
      height:7px;
      flex:0 0 7px;
      border-radius:50%;
      background:#43d9a5;
      box-shadow:0 0 11px #43d9a5;
    }

    .mode-switch-arrow {
      opacity:.55;
      font-size:13px;
    }

    /* Переход между режимами */

    .mode-transition {
      position:fixed;
      inset:0;
      z-index:99999;
      display:grid;
      place-items:center;
      background:#020605;
      opacity:0;
      visibility:hidden;
      pointer-events:none;
      transition:opacity .48s ease,visibility .48s ease;
    }

    .mode-transition.active {
      opacity:1;
      visibility:visible;
    }

    .mode-transition-content {
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:13px;
      opacity:0;
      transform:translateY(12px) scale(.92);
      transition:all .65s cubic-bezier(.22,.8,.22,1);
    }

    .mode-transition.active .mode-transition-content {
      opacity:1;
      transform:translateY(0) scale(1);
    }

    .mode-transition-art {
      width:118px;
      height:118px;
      filter:drop-shadow(0 0 24px rgba(67,217,165,.3));
      animation:mirage-float 2.7s ease-in-out infinite;
    }

    .mode-transition-art svg {
      width:100%;
      height:100%;
    }

    .mode-transition-title {
      color:#eafff5;
      font:800 13px Manrope,sans-serif;
      letter-spacing:.23em;
    }

    .mode-transition-caption {
      color:#8ca79b;
      font:500 9px "DM Sans",sans-serif;
      letter-spacing:.16em;
    }

    .mode-transition-line {
      width:120px;
      height:1px;
      background:linear-gradient(
        90deg,transparent,#45d9a6,transparent
      );
      animation:mirage-line 1s ease infinite alternate;
    }

    /* Иллюстрации режима */

    .mode-identity {
      position:absolute;
      z-index:0;
      right:76px;
      top:5px;
      width:43px;
      height:48px;
      opacity:.48;
      pointer-events:none;
      filter:drop-shadow(0 0 15px rgba(67,217,165,.25));
      animation:mirage-float 5s ease-in-out infinite;
    }

    .mode-identity svg {
      width:100%;
      height:100%;
    }

    .page-intro {
      position:relative;
      overflow:hidden;
    }

    .page-intro > * {
      position:relative;
      z-index:1;
    }

    .page-intro .mode-identity {
      z-index:0;
    }

    /* Общие микроанимации */

    .hero-card,
    .chart-panel,
    .status-card,
    .mini-market,
    .market-row,
    .strategy-card,
    .portfolio-total,
    .position-card,
    .account-row,
    .history-row,
    .mi-panel,
    .analysis-placeholder {
      transition:
        transform .32s ease,
        border-color .32s ease,
        box-shadow .32s ease,
        background .32s ease;
    }

    .app-shell button:not(:disabled) {
      transition:transform .22s ease,filter .22s ease;
    }

    .app-shell button:not(:disabled):active {
      transform:scale(.985);
    }

    .live-pill i,
    .connection i,
    .status-dot.good {
      animation:mirage-pulse 2.2s ease-in-out infinite;
    }

    .hero-card:before {
      animation:mirage-shimmer 8s ease-in-out infinite;
    }

    @keyframes mirage-float {
      0%,100% { transform:translateY(0); }
      50% { transform:translateY(-7px); }
    }

    @keyframes mirage-pulse {
      0%,100% { opacity:1; }
      50% { opacity:.48; }
    }

    @keyframes mirage-shimmer {
      0%,100% { opacity:.3; }
      50% { opacity:.8; }
    }

    @keyframes mirage-line {
      from { transform:scaleX(.45); opacity:.45; }
      to { transform:scaleX(1); opacity:1; }
    }

    /* STEALTH — упрощённый интерфейс */

    body[data-mirage-mode="stealth"] .mode-switch {
      background:linear-gradient(145deg,#17231e,#0b110e);
      border-color:rgba(100,220,170,.22);
    }

    body[data-mirage-mode="stealth"] .mi-table-wrap,
    body[data-mirage-mode="stealth"] .mi-folds {
      display:none !important;
    }

    body[data-mirage-mode="stealth"] .mi-grid .mi-stat:nth-child(n+4) {
      display:none !important;
    }

    body[data-mirage-mode="stealth"] .mi-panel {
      border-radius:22px !important;
    }

    body[data-mirage-mode="stealth"] .hero-card,
    body[data-mirage-mode="stealth"] .strategy-card,
    body[data-mirage-mode="stealth"] .status-card {
      border-radius:22px !important;
    }

    /* SPECTRE — полная аналитическая версия */

    body[data-mirage-mode="spectre"] {
      background:
        radial-gradient(
          ellipse at 50% -20%,
          rgba(36,130,98,.17),
          transparent 48%
        ),
        #030807 !important;
      color:#e9f4f0 !important;
    }

    body[data-mirage-mode="spectre"] .topbar {
      background:rgba(2,7,6,.97) !important;
      border-bottom:1px solid rgba(89,232,188,.2) !important;
      box-shadow:0 10px 35px rgba(0,0,0,.4);
    }

    body[data-mirage-mode="spectre"] .mode-toolbar {
      background:linear-gradient(
        90deg,transparent,rgba(27,90,67,.08),transparent
      );
    }

    body[data-mirage-mode="spectre"] .brand-copy b {
      letter-spacing:.2em !important;
    }

    body[data-mirage-mode="spectre"] .brand-copy small,
    body[data-mirage-mode="spectre"] .subtle {
      color:#91a99e !important;
    }

    body[data-mirage-mode="spectre"] .eyebrow {
      color:#67c9a8 !important;
      letter-spacing:.19em !important;
    }

    body[data-mirage-mode="spectre"] .hero-card,
    body[data-mirage-mode="spectre"] .portfolio-total,
    body[data-mirage-mode="spectre"] .chart-panel,
    body[data-mirage-mode="spectre"] .strategy-summary,
    body[data-mirage-mode="spectre"] .strategy-card,
    body[data-mirage-mode="spectre"] .status-card,
    body[data-mirage-mode="spectre"] .mini-market,
    body[data-mirage-mode="spectre"] .market-row,
    body[data-mirage-mode="spectre"] .position-card,
    body[data-mirage-mode="spectre"] .account-row,
    body[data-mirage-mode="spectre"] .history-row,
    body[data-mirage-mode="spectre"] .mi-panel,
    body[data-mirage-mode="spectre"] .analysis-placeholder {
      background:linear-gradient(
        145deg,#0d1815,#050b09
      ) !important;
      border:1px solid rgba(89,225,183,.23) !important;
      border-radius:13px !important;
      box-shadow:
        inset 0 1px 0 rgba(190,255,232,.04),
        0 14px 38px rgba(0,0,0,.3) !important;
    }

    body[data-mirage-mode="spectre"] .hero-card {
      background:
        radial-gradient(
          ellipse at 85% 0%,
          rgba(53,208,158,.19),
          transparent 42%
        ),
        linear-gradient(145deg,#0c1c17,#050b09) !important;
      border-radius:17px !important;
    }

    body[data-mirage-mode="spectre"] .hero-balance,
    body[data-mirage-mode="spectre"] .portfolio-total b {
      color:#eafff5 !important;
      text-shadow:0 0 24px rgba(74,223,177,.17);
    }

    body[data-mirage-mode="spectre"] .paper-tag,
    body[data-mirage-mode="spectre"] .live-pill {
      border-color:rgba(89,225,183,.3) !important;
      color:#8fe7c7 !important;
      background:rgba(41,143,108,.12) !important;
    }

    body[data-mirage-mode="spectre"] .bottom-nav {
      background:rgba(3,9,7,.98) !important;
      border-color:rgba(89,225,183,.23) !important;
      box-shadow:0 12px 36px rgba(0,0,0,.5) !important;
    }

    body[data-mirage-mode="spectre"] .bottom-nav .nav-item.active {
      color:#8bf0ca !important;
      background:rgba(52,185,139,.15) !important;
    }

    body[data-mirage-mode="spectre"] .mode-switch {
      border-color:rgba(90,231,188,.42);
      background:linear-gradient(135deg,#0a231b,#030b08);
      box-shadow:0 0 22px rgba(40,179,133,.16);
    }

    body[data-mirage-mode="spectre"] .mode-switch-led {
      background:#7affd0;
      box-shadow:0 0 13px #52edbd;
    }

    body[data-mirage-mode="spectre"] .mi-table-wrap,
    body[data-mirage-mode="spectre"] .mi-folds {
      display:block !important;
    }

    body[data-mirage-mode="spectre"] .mi-grid .mi-stat {
      display:flex !important;
    }

    body[data-mirage-mode="spectre"] .mi-table th {
      color:#8ce6c5 !important;
    }

    body[data-mirage-mode="spectre"] .mi-table td {
      border-color:rgba(95,211,171,.15) !important;
    }

    body[data-mirage-mode="spectre"] .risk-note {
      background:linear-gradient(135deg,#0e1e18,#050c09) !important;
      border-color:rgba(89,225,183,.2) !important;
    }

    body[data-mirage-mode="spectre"] .page.active {
      animation:spectre-page-enter .55s ease both;
    }

    body[data-mirage-mode="spectre"] .mi-panel h3,
    body[data-mirage-mode="spectre"] .section-title h2 {
      letter-spacing:.035em;
    }

    body[data-mirage-mode="spectre"] .hero-card,
    body[data-mirage-mode="spectre"] .strategy-card,
    body[data-mirage-mode="spectre"] .chart-panel,
    body[data-mirage-mode="spectre"] .mi-panel {
      position:relative;
      overflow:hidden;
    }

    body[data-mirage-mode="spectre"] .strategy-card:active,
    body[data-mirage-mode="spectre"] .market-row:active {
      border-color:rgba(100,255,205,.55) !important;
    }

    @keyframes spectre-page-enter {
      from {
        opacity:.55;
        filter:brightness(.7);
        transform:translateY(7px);
      }
      to {
        opacity:1;
        filter:brightness(1);
        transform:none;
      }
    }

    /* Мобильная адаптация */

    @media(max-width:520px) {
      .mode-toolbar {
        padding:7px 14px 0;
        min-height:45px;
      }

      .mode-switch {
        min-height:34px;
        padding:5px 9px;
        font-size:8px;
        letter-spacing:.055em;
      }

      .mode-switch-arrow {
        display:none;
      }

      .mode-identity {
        right:65px;
        width:38px;
        height:43px;
      }
    }

    @media(max-width:350px) {
      .mode-switch {
        gap:5px;
        padding:5px 7px;
        font-size:7px;
      }

      .mode-status-slot .connection {
        padding:8px 9px !important;
        font-size:7px !important;
      }
    }

    @media(prefers-reduced-motion:reduce) {
      *,*::before,*::after {
        animation-duration:.01ms !important;
        animation-iteration-count:1 !important;
        scroll-behavior:auto !important;
        transition-duration:.01ms !important;
      }
    }
  `;

  function addStyles() {
    if ($("#mirage-mode-styles")) return;

    const style = document.createElement("style");
    style.id = "mirage-mode-styles";
    style.textContent = styles;
    document.head.appendChild(style);
  }

  /* Отдельная строка: статус + переключатель */

  function addSwitch() {
    const topbar = $(".topbar");

    if (!topbar || $("#mirage-mode-switch")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "mode-toolbar";

    const statusSlot = document.createElement("div");
    statusSlot.className = "mode-status-slot";

    const connection = $(".connection");

    if (connection) {
      statusSlot.appendChild(connection);
    }

    const wrap = document.createElement("div");
    wrap.className = "mode-switch-wrap";

    wrap.innerHTML = `
      <button class="mode-switch"
        id="mirage-mode-switch"
        type="button"
        aria-pressed="false">

        <span class="mode-switch-led"></span>
        <span class="mode-switch-name">STEALTH MODE</span>
        <span class="mode-switch-arrow">⇄</span>

      </button>
    `;

    toolbar.appendChild(statusSlot);
    toolbar.appendChild(wrap);

    topbar.insertAdjacentElement("afterend", toolbar);

    $("#mirage-mode-switch").addEventListener(
      "click",
      toggleMode
    );
  }

  /* Экран перехода */

  function addTransition() {
    if ($("#mirage-mode-transition")) return;

    const overlay = document.createElement("div");

    overlay.id = "mirage-mode-transition";
    overlay.className = "mode-transition";
    overlay.setAttribute("aria-hidden", "true");

    overlay.innerHTML = `
      <div class="mode-transition-content">

        <div class="mode-transition-art">
          ${stealthArt}
        </div>

        <div class="mode-transition-title">
          STEALTH MODE
        </div>

        <div class="mode-transition-line"></div>

        <div class="mode-transition-caption">
          MIRAGE INTERFACE SHIFT
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
  }

  /* Эмблемы на страницах */

  function updateIdentities() {
    document.querySelectorAll(".mode-identity")
      .forEach(el => el.remove());

    document.querySelectorAll(".page-intro")
      .forEach(intro => {

        const art = document.createElement("div");

        art.className = "mode-identity";
        art.setAttribute("aria-hidden", "true");

        art.innerHTML =
          currentMode === "spectre"
            ? spectreArt
            : stealthArt;

        intro.appendChild(art);
      });
  }

  function updateSwitch() {
    const button = $("#mirage-mode-switch");

    if (!button) return;

    const label = $(".mode-switch-name", button);

    if (label) {
      label.textContent = MODES[currentMode];
    }

    button.setAttribute(
      "aria-pressed",
      String(currentMode === "spectre")
    );

    button.setAttribute(
      "aria-label",
      `Текущий режим: ${MODES[currentMode]}. Переключить режим`
    );
  }

  function applyMode() {
    document.body.dataset.mirageMode = currentMode;
    document.documentElement.dataset.mirageMode = currentMode;

    updateSwitch();
    updateIdentities();

    window.dispatchEvent(
      new CustomEvent("mirage:modechange", {
        detail: { mode: currentMode }
      })
    );
  }

  function saveMode() {
    try {
      localStorage.setItem(STORAGE_KEY, currentMode);
    } catch (_) {}
  }

  function toggleMode() {
    if (switching) return;

    switching = true;

    const nextMode =
      currentMode === "stealth"
        ? "spectre"
        : "stealth";

    const overlay = $("#mirage-mode-transition");

    if (!overlay) {
      currentMode = nextMode;
      saveMode();
      applyMode();
      switching = false;
      return;
    }

    $(".mode-transition-title", overlay).textContent =
      MODES[nextMode];

    $(".mode-transition-art", overlay).innerHTML =
      nextMode === "spectre"
        ? spectreArt
        : stealthArt;

    overlay.classList.add("active");

    window.setTimeout(() => {
      currentMode = nextMode;
      saveMode();
      applyMode();
    }, 380);

    window.setTimeout(() => {
      overlay.classList.remove("active");

      window.setTimeout(() => {
        switching = false;
      }, 500);

    }, 1150);
  }

  function refreshPageIllustrations() {
    updateIdentities();
  }

  function boot() {
    addStyles();
    addSwitch();
    addTransition();
    applyMode();

    document.addEventListener("click", event => {
      if (event.target.closest("[data-page]")) {
        window.setTimeout(
          refreshPageIllustrations,
          150
        );
      }
    });

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {

          if (
            node.nodeType === 1 &&
            (
              node.matches?.(".page-intro") ||
              node.querySelector?.(".page-intro")
            )
          ) {
            refreshPageIllustrations();
            return;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      { once: true }
    );
  } else {
    boot();
  }

})();
