/* =========================================================
   MIRAGE 2.7 — STEALTH / SPECTRE MODE SYSTEM
   Только интерфейс. Торговая логика и расчёты не меняются.
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

  const $ = (selector, root = document) => root.querySelector(selector);

  let currentMode = "stealth";
  let switching = false;

  try {
    currentMode = localStorage.getItem(STORAGE_KEY) === "spectre"
      ? "spectre"
      : "stealth";
  } catch (_) {}

  /* Фирменный призрак STEALTH */

  const stealthArt = `
    <svg viewBox="0 0 120 132" aria-hidden="true">
      <defs>
        <linearGradient id="mirageGhostGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#effff8"/>
          <stop offset="100%" stop-color="#63dcae"/>
        </linearGradient>
      </defs>
      <path d="M60 9C33 9 17 29 17 57v58c0 4 4 6 8 3l13-10 12 11c3 3 6 3 9 0l12-11 12 10c4 3 8 1 8-4V57C91 29 80 9 60 9Z"
        fill="url(#mirageGhostGradient)"/>
      <ellipse cx="45" cy="55" rx="5" ry="8" fill="#10251e"/>
      <ellipse cx="72" cy="55" rx="5" ry="8" fill="#10251e"/>
      <path d="M52 73q8 7 16 0" fill="none"
        stroke="#10251e" stroke-width="3" stroke-linecap="round"/>
      <path d="M30 24q-8 8-8 20M84 22q9 8 10 19"
        fill="none" stroke="#fff" stroke-opacity=".7"
        stroke-width="3" stroke-linecap="round"/>
    </svg>`;

  /* Геометрическая эмблема SPECTRE */

  const spectreArt = `
    <svg viewBox="0 0 140 140" aria-hidden="true">
      <defs>
        <linearGradient id="mirageSpectreGradient" x1="0" y1="0" x2="1" y2="1">
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
        fill="none" stroke="#48d9ad" stroke-opacity=".35"/>

      <path d="M70 19 109 42v46l-39 23-39-23V42Z"
        fill="url(#mirageSpectreGradient)" fill-opacity=".12"
        stroke="#75f3ca" stroke-width="1.5"/>

      <path d="M70 28 96 43v31L70 89 44 74V43Z"
        fill="#071410" stroke="#71f1c8"
        stroke-width="1.7" filter="url(#mirageSpectreGlow)"/>

      <path d="m50 57 14-8 6 5 6-5 14 8-7 18-13 8-13-8Z"
        fill="url(#mirageSpectreGradient)"/>

      <path d="m59 62 7-3m8 0 7 3"
        stroke="#03100d" stroke-width="3"
        stroke-linecap="round"/>

      <path d="M70 12v14M70 89v27M21 47l13 7m72 0 13-7"
        stroke="#69edc3" stroke-opacity=".5"/>

      <circle cx="70" cy="8" r="3" fill="#8dffdc"/>
      <circle cx="70" cy="119" r="3" fill="#8dffdc"/>
    </svg>`;

  /* Визуальные стили обоих режимов */

  const styles = `
    .mode-switch-wrap {
      display:flex;
      align-items:center;
    }

    .mode-switch {
      display:flex;
      align-items:center;
      gap:8px;
      min-height:36px;
      padding:6px 10px;
      border:1px solid rgba(255,255,255,.14);
      border-radius:999px;
      background:rgba(12,17,15,.88);
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
      border-radius:50%;
      background:#43d9a5;
      box-shadow:0 0 11px #43d9a5;
    }

    .mode-switch-arrow {
      opacity:.55;
      font-size:13px;
    }

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
      background:linear-gradient(90deg,transparent,#45d9a6,transparent);
      animation:mirage-line 1s ease infinite alternate;
    }

    .mode-identity {
      position:absolute;
      z-index:0;
      right:12px;
      top:12px;
      width:62px;
      height:70px;
      opacity:.82;
      pointer-events:none;
      filter:drop-shadow(0 0 15px rgba(67,217,165,.22));
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

    /* Общие приятные микроанимации */

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

    /* STEALTH MODE: привычный дизайн, меньше визуального шума */

    body[data-mirage-mode="stealth"] .mode-switch {
      background:rgba(12,17,15,.82);
    }

    body[data-mirage-mode="stealth"] .mi-table-wrap,
    body[data-mirage-mode="stealth"] .mi-folds {
      display:none !important;
    }

    body[data-mirage-mode="stealth"] .mi-panel {
      border-radius:19px;
    }

    /* SPECTRE MODE: отдельная тёмная профессиональная атмосфера */

    body[data-mirage-mode="spectre"] {
      background:
        radial-gradient(ellipse at 50% -20%,rgba(36,130,98,.13),transparent 48%),
        #030807 !important;
      color:#e9f4f0 !important;
    }

    body[data-mirage-mode="spectre"] .topbar {
      background:rgba(2,7,6,.96) !important;
      border-bottom-color:rgba(89,232,188,.17) !important;
      box-shadow:0 10px 35px rgba(0,0,0,.3);
    }

    body[data-mirage-mode="spectre"] .brand-copy b {
      letter-spacing:.2em;
    }

    body[data-mirage-mode="spectre"] .brand-copy small,
    body[data-mirage-mode="spectre"] .subtle {
      color:#91a99e !important;
    }

    body[data-mirage-mode="spectre"] .eyebrow {
      color:#67c9a8 !important;
      letter-spacing:.19em;
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
      background:linear-gradient(145deg,#0d1815,#050b09) !important;
      border-color:rgba(89,225,183,.19) !important;
      box-shadow:
        inset 0 1px 0 rgba(190,255,232,.035),
        0 14px 38px rgba(0,0,0,.25) !important;
    }

    body[data-mirage-mode="spectre"] .hero-card {
      background:
        radial-gradient(ellipse at 85% 0%,rgba(53,208,158,.17),transparent 42%),
        linear-gradient(145deg,#0c1c17,#050b09) !important;
    }

    body[data-mirage-mode="spectre"] .hero-balance,
    body[data-mirage-mode="spectre"] .portfolio-total b {
      color:#eafff5 !important;
      text-shadow:0 0 24px rgba(74,223,177,.13);
    }

    body[data-mirage-mode="spectre"] .paper-tag,
    body[data-mirage-mode="spectre"] .live-pill {
      border-color:rgba(89,225,183,.25) !important;
      color:#8fe7c7 !important;
      background:rgba(41,143,108,.09) !important;
    }

    body[data-mirage-mode="spectre"] .bottom-nav {
      background:rgba(3,9,7,.97) !important;
      border-color:rgba(89,225,183,.2) !important;
      box-shadow:0 12px 36px rgba(0,0,0,.5) !important;
    }

    body[data-mirage-mode="spectre"] .bottom-nav .nav-item.active {
      color:#8bf0ca !important;
      background:rgba(52,185,139,.13) !important;
    }

    body[data-mirage-mode="spectre"] .mode-switch {
      border-color:rgba(90,231,188,.35);
      background:linear-gradient(135deg,#0a231b,#030b08);
      box-shadow:0 0 18px rgba(40,179,133,.1);
    }

    body[data-mirage-mode="spectre"] .mode-switch-led {
      background:#7affd0;
      box-shadow:0 0 13px #52edbd;
    }

    body[data-mirage-mode="spectre"] .mi-table th {
      color:#8ce6c5 !important;
    }

    body[data-mirage-mode="spectre"] .mi-table td {
      border-color:rgba(95,211,171,.12) !important;
    }

    body[data-mirage-mode="spectre"] .risk-note {
      background:linear-gradient(135deg,#0e1e18,#050c09) !important;
      border-color:rgba(89,225,183,.16) !important;
    }

    body[data-mirage-mode="spectre"] .page.active {
      animation:spectre-page-enter .55s ease both;
    }

    @keyframes spectre-page-enter {
      from { opacity:.65; filter:brightness(.72); transform:translateY(7px); }
      to { opacity:1; filter:brightness(1); transform:none; }
    }

    @media(max-width:520px) {
      .topbar { padding-left:12px !important; padding-right:10px !important; }
      .top-actions { gap:7px !important; }
      .mode-switch {
        min-height:34px;
        padding:5px 8px;
        font-size:8px;
        letter-spacing:.055em;
      }
      .mode-switch-arrow { display:none; }
      .connection { font-size:8px !important; }
      .mode-identity { width:51px; height:59px; }
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

  function addSwitch() {
    const actions = $(".top-actions");
    if (!actions || $("#mirage-mode-switch")) return;

    const wrap = document.createElement("div");
    wrap.className = "mode-switch-wrap";

    wrap.innerHTML = `
      <button class="mode-switch" id="mirage-mode-switch"
              type="button" aria-pressed="false">
        <span class="mode-switch-led"></span>
        <span class="mode-switch-name">STEALTH MODE</span>
        <span class="mode-switch-arrow">⇄</span>
      </button>
    `;

    const refresh = $("#refresh-btn");
    actions.insertBefore(wrap, refresh || null);

    $("#mirage-mode-switch").addEventListener("click", toggleMode);
  }

  function addTransition() {
    if ($("#mirage-mode-transition")) return;

    const overlay = document.createElement("div");
    overlay.id = "mirage-mode-transition";
    overlay.className = "mode-transition";
    overlay.setAttribute("aria-hidden", "true");

    overlay.innerHTML = `
      <div class="mode-transition-content">
        <div class="mode-transition-art">${stealthArt}</div>
        <div class="mode-transition-title">STEALTH MODE</div>
        <div class="mode-transition-line"></div>
        <div class="mode-transition-caption">MIRAGE INTERFACE SHIFT</div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  function updateIdentities() {
    document.querySelectorAll(".mode-identity").forEach(el => el.remove());

    document.querySelectorAll(".page-intro").forEach(intro => {
      const art = document.createElement("div");
      art.className = "mode-identity";
      art.setAttribute("aria-hidden", "true");
      art.innerHTML = currentMode === "spectre" ? spectreArt : stealthArt;
      intro.appendChild(art);
    });
  }

  function updateSwitch() {
    const button = $("#mirage-mode-switch");
    if (!button) return;

    const label = $(".mode-switch-name", button);
    if (label) label.textContent = MODES[currentMode];

    button.setAttribute("aria-pressed", String(currentMode === "spectre"));
    button.setAttribute("aria-label", `Текущий режим: ${MODES[currentMode]}. Переключить режим`);
  }

  function applyMode() {
    document.body.dataset.mirageMode = currentMode;
    document.documentElement.dataset.mirageMode = currentMode;

    updateSwitch();
    updateIdentities();

    window.dispatchEvent(new CustomEvent("mirage:modechange", {
      detail: { mode: currentMode }
    }));
  }

  function saveMode() {
    try {
      localStorage.setItem(STORAGE_KEY, currentMode);
    } catch (_) {}
  }

  function toggleMode() {
    if (switching) return;

    switching = true;

    const nextMode = currentMode === "stealth" ? "spectre" : "stealth";
    const overlay = $("#mirage-mode-transition");

    if (!overlay) {
      currentMode = nextMode;
      saveMode();
      applyMode();
      switching = false;
      return;
    }

    $(".mode-transition-title", overlay).textContent = MODES[nextMode];

    $(".mode-transition-art", overlay).innerHTML =
      nextMode === "spectre" ? spectreArt : stealthArt;

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

    /* При переходе между вкладками обновляем иллюстрацию режима. */
    document.addEventListener("click", event => {
      if (event.target.closest("[data-page]")) {
        window.setTimeout(refreshPageIllustrations, 120);
      }
    });

    /* Поддержка панелей, которые добавляются динамически. */
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.matches?.(".page-intro")) {
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
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
