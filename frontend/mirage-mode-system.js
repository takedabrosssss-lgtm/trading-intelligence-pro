
/* =========================================================
   MIRAGE 2.8 — DUAL INTERFACE SYSTEM
   STEALTH MODE / SPECTRE MODE

   Full UI redesign across all five application tabs.
   Presentation only: no changes to trading logic or API.
   ========================================================= */

(() => {
  "use strict";

  if (window.__MIRAGE_DUAL_INTERFACE_V28__) return;
  window.__MIRAGE_DUAL_INTERFACE_V28__ = true;

  const STORAGE_KEY = "mirage-mode-v1";
  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const MODES = {
    stealth: "STEALTH MODE",
    spectre: "SPECTRE MODE"
  };

  let mode = "stealth";
  let switchLocked = false;
  let observer = null;

  try {
    mode = localStorage.getItem(STORAGE_KEY) === "spectre"
      ? "spectre"
      : "stealth";
  } catch (_) {}

  /* =====================================================
     1. GLOBAL DESIGN SYSTEM
     ===================================================== */

  const css = `

    :root {
      --mirage-bg: #050907;
      --mirage-panel: #0b120f;
      --mirage-panel-2: #101a15;
      --mirage-line: rgba(129, 210, 172, .13);
      --mirage-green: #48e5a9;
      --mirage-green-soft: #9affd5;
      --mirage-red: #ff6375;
      --mirage-text: #edf7f1;
      --mirage-muted: #82958a;
      --mirage-radius: 20px;
    }

    html {
      background: var(--mirage-bg) !important;
    }

    body {
      background:
        radial-gradient(
          ellipse at 50% -18%,
          rgba(31, 115, 80, .16),
          transparent 47%
        ),
        radial-gradient(
          ellipse at 100% 55%,
          rgba(17, 70, 49, .08),
          transparent 38%
        ),
        #050907 !important;
      color: var(--mirage-text) !important;
      transition: background .4s ease, color .4s ease;
    }

    .app-shell {
      max-width: 900px !important;
      overflow-x: clip !important;
      padding-bottom: 116px !important;
    }

    main {
      padding-top: 17px !important;
    }

    /* =================================================
       2. TOP BAR — BRAND + REAL CONNECTION INDICATOR
       ================================================= */

    .topbar {
      height: 72px !important;
      min-height: 72px !important;
      padding: 0 19px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      background: rgba(4, 10, 7, .94) !important;
      border-bottom: 1px solid rgba(109, 215, 167, .11) !important;
      backdrop-filter: blur(24px) !important;
      -webkit-backdrop-filter: blur(24px) !important;
      z-index: 100 !important;
    }

    .brand {
      min-width: 0 !important;
      display: flex !important;
      align-items: center !important;
      gap: 11px !important;
      background: transparent !important;
      border: 0 !important;
    }

    .brand-mark {
      width: 42px !important;
      height: 42px !important;
      flex: 0 0 42px !important;
      border-radius: 13px !important;
      overflow: hidden !important;
      border: 1px solid rgba(83, 230, 174, .35) !important;
      background: #07110c !important;
      box-shadow:
        0 0 22px rgba(49, 216, 151, .13),
        inset 0 1px 0 rgba(255, 255, 255, .12) !important;
    }

    .brand-mark img {
      display: block !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    .brand-copy {
      min-width: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
    }

    .brand-copy b {
      color: #f2fff8 !important;
      font: 800 13px/1 "Manrope", sans-serif !important;
      letter-spacing: 2.7px !important;
    }

    .brand-copy small {
      color: #77988a !important;
      font: 600 7px/1.2 "DM Sans", sans-serif !important;
      letter-spacing: 1.35px !important;
      white-space: nowrap !important;
    }

    /* Old text status is retained internally because app.js
       updates it. Visually it is replaced by our brand LED. */

    .top-actions .connection {
      display: none !important;
    }

    .mirage-brand-line {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 15px;
    }

    .mirage-system-led {
      width: 8px;
      height: 8px;
      flex: 0 0 8px;
      border-radius: 50%;
      background: #69766e;
      box-shadow: 0 0 0 transparent;
      transition: background .25s ease, box-shadow .25s ease;
    }

    .mirage-system-led.online {
      background: #3fe4a2;
      box-shadow:
        0 0 7px rgba(63, 228, 162, .9),
        0 0 17px rgba(63, 228, 162, .35);
      animation: mirage-led-pulse 2.4s ease-in-out infinite;
    }

    .mirage-system-led.offline {
      background: #ff5368;
      box-shadow:
        0 0 7px rgba(255, 83, 104, .85),
        0 0 16px rgba(255, 83, 104, .3);
    }

    @keyframes mirage-led-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .58; }
    }

    #refresh-btn {
      width: 39px !important;
      height: 39px !important;
      border: 1px solid rgba(106, 215, 168, .19) !important;
      border-radius: 13px !important;
      background: rgba(15, 30, 22, .9) !important;
      color: #8ff2c5 !important;
      font-size: 22px !important;
    }

    /* =================================================
       3. GLOBAL MODE SWITCH
       ================================================= */

    .mirage-mode-toolbar {
      position: relative;
      z-index: 80;
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      padding: 13px 19px 11px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      box-sizing: border-box;
      border-bottom: 1px solid rgba(113, 211, 165, .09);
      background:
        linear-gradient(
          90deg,
          rgba(5, 15, 10, .96),
          rgba(8, 21, 14, .86),
          rgba(5, 15, 10, .96)
        );
    }

    .mirage-mode-caption {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .mirage-mode-caption strong {
      color: #dff9ec;
      font: 800 9px/1 "Manrope", sans-serif;
      letter-spacing: 2px;
    }

    .mirage-mode-caption small {
      color: #6f8b7c;
      font: 500 9px/1.3 "DM Sans", sans-serif;
    }

    .mirage-mode-switch {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-items: center;
      flex: 0 0 auto;
      width: 226px;
      min-height: 46px;
      padding: 4px;
      border: 1px solid rgba(92, 220, 166, .34);
      border-radius: 15px;
      background:
        linear-gradient(145deg, #14241b, #08110c);
      box-shadow:
        0 7px 23px rgba(0, 0, 0, .3),
        inset 0 1px 0 rgba(255, 255, 255, .06),
        0 0 20px rgba(52, 197, 137, .08);
      color: #eafff4;
      cursor: pointer;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
      transition:
        border-color .3s ease,
        box-shadow .3s ease,
        background .3s ease,
        transform .2s ease;
    }

    .mirage-mode-switch:active {
      transform: scale(.975);
    }

    .mirage-mode-switch:focus-visible {
      outline: 2px solid #70f0bd;
      outline-offset: 3px;
    }

    .mirage-mode-option {
      position: relative;
      z-index: 2;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 35px;
      border-radius: 10px;
      color: #81978a;
      font: 800 8px/1 "Manrope", sans-serif;
      letter-spacing: .65px;
      white-space: nowrap;
      transition: color .3s ease;
    }

    .mirage-mode-option i {
      width: 6px;
      height: 6px;
      flex: 0 0 6px;
      border-radius: 50%;
      background: #64766b;
      transition: all .3s ease;
    }

    .mirage-mode-highlight {
      position: absolute;
      z-index: 1;
      left: 4px;
      top: 4px;
      bottom: 4px;
      width: calc(50% - 4px);
      border: 1px solid rgba(110, 255, 194, .35);
      border-radius: 11px;
      background:
        linear-gradient(145deg, #245a40, #123522);
      box-shadow:
        0 0 17px rgba(48, 219, 147, .2),
        inset 0 1px 0 rgba(255, 255, 255, .13);
      transition: transform .38s cubic-bezier(.2,.8,.2,1);
    }

    .mirage-mode-switch.is-spectre .mirage-mode-highlight {
      transform: translateX(100%);
      background:
        linear-gradient(145deg, #164a38, #09251a);
      border-color: rgba(113, 255, 207, .52);
      box-shadow:
        0 0 22px rgba(58, 230, 170, .24),
        inset 0 1px 0 rgba(255, 255, 255, .15);
    }

    .mirage-mode-switch:not(.is-spectre)
      .mirage-mode-option:first-of-type,
    .mirage-mode-switch.is-spectre
      .mirage-mode-option:last-of-type {
      color: #effff7;
    }

    .mirage-mode-switch:not(.is-spectre)
      .mirage-mode-option:first-of-type i,
    .mirage-mode-switch.is-spectre
      .mirage-mode-option:last-of-type i {
      background: #76ffd0;
      box-shadow: 0 0 9px #4be6ad;
    }

    /* Remove all LIVE / LIVE DATA pills across the app. */

    .live-pill {
      display: none !important;
    }

    /* =================================================
       4. SHARED COMPONENT REDESIGN
       ================================================= */

    .page-intro {
      position: relative !important;
      min-width: 0 !important;
      margin: 0 0 17px !important;
      padding: 4px 2px 13px !important;
      border-bottom: 1px solid rgba(114, 208, 165, .10);
      align-items: center !important;
    }

    .page-intro .eyebrow,
    .eyebrow {
      color: #65c99c !important;
      font-size: 8px !important;
      font-weight: 800 !important;
      letter-spacing: 2px !important;
    }

    .page-intro h1 {
      color: #f0fff6 !important;
      font: 800 clamp(25px, 5vw, 33px)/1.08 "Manrope", sans-serif !important;
      letter-spacing: -1.2px !important;
      margin: 7px 0 5px !important;
    }

    .subtle {
      color: #83998d !important;
    }

    .hero-card,
    .portfolio-total,
    .chart-panel,
    .strategy-summary,
    .strategy-card,
    .status-card,
    .mini-market,
    .market-row,
    .position-card,
    .account-row,
    .history-row,
    .mi-panel,
    .analysis-card,
    .analysis-placeholder,
    #premium-equity,
    #premium-positions,
    #premium-activity,
    .premium-kpi {
      border-color: var(--mirage-line) !important;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .035),
        0 13px 32px rgba(0, 0, 0, .22) !important;
      transition:
        transform .28s ease,
        border-color .28s ease,
        box-shadow .28s ease,
        background .28s ease !important;
    }

    .section-title {
      margin-top: 15px !important;
      margin-bottom: 11px !important;
    }

    .section-title h2 {
      color: #e9f8ef !important;
      font: 800 16px "Manrope", sans-serif !important;
      letter-spacing: -.35px !important;
    }

    .hero-card {
      background:
        radial-gradient(
          ellipse at 90% 0%,
          rgba(52, 203, 143, .16),
          transparent 45%
        ),
        linear-gradient(145deg, #102019, #08100c 72%) !important;
      border: 1px solid rgba(92, 220, 165, .2) !important;
      border-radius: 23px !important;
    }

    .hero-balance {
      color: #f2fff7 !important;
      text-shadow: 0 0 27px rgba(61, 219, 157, .12);
    }

    .hero-pnl {
      color: #65e6ad !important;
    }

    .paper-tag {
      border-color: rgba(83, 210, 151, .22) !important;
      background: rgba(32, 127, 81, .12) !important;
      color: #8be6b8 !important;
    }

    .premium-kpi {
      background:
        radial-gradient(
          circle at 100% 0%,
          rgba(59, 194, 137, .12),
          transparent 55%
        ),
        linear-gradient(145deg, #13231a, #0a120d) !important;
      border: 1px solid rgba(104, 213, 161, .14) !important;
      border-radius: 17px !important;
    }

    .premium-kpi strong {
      color: #f1fff7 !important;
    }

    .premium-kpi .green,
    .premium-pnl.green {
      color: #5de7aa !important;
    }

    .premium-kpi .red,
    .premium-pnl.red {
      color: #ff7180 !important;
    }

    #premium-equity,
    #premium-positions,
    #premium-activity {
      background:
        linear-gradient(145deg, rgba(17, 33, 24, .96), rgba(8, 15, 11, .98)) !important;
      border: 1px solid rgba(106, 213, 161, .14) !important;
      border-radius: 19px !important;
      padding: 16px !important;
      margin: 0 !important;
    }

    .premium-section-title {
      color: #e7f8ed !important;
    }

    .premium-empty {
      color: #82978b !important;
    }

    .chart-panel,
    .analysis-card,
    .analysis-placeholder {
      background:
        radial-gradient(
          ellipse at 90% 0%,
          rgba(45, 154, 105, .1),
          transparent 50%
        ),
        linear-gradient(145deg, #101d16, #080f0b) !important;
      border-radius: 20px !important;
    }

    .market-row {
      background: rgba(12, 25, 17, .82) !important;
      border-radius: 14px !important;
      border: 1px solid rgba(117, 201, 158, .1) !important;
    }

    .market-row.selected {
      border-color: rgba(76, 231, 167, .48) !important;
      background: rgba(26, 82, 54, .22) !important;
    }

    .market-row:active,
    .strategy-card:active,
    .status-card:active {
      transform: scale(.99);
    }

    .strategy-card {
      background:
        linear-gradient(145deg, #13231a, #09110c) !important;
      border: 1px solid rgba(106, 213, 161, .14) !important;
      border-radius: 18px !important;
    }

    .risk-note {
      border-color: rgba(105, 208, 157, .16) !important;
      background: rgba(13, 30, 19, .75) !important;
      border-radius: 17px !important;
    }

    .portfolio-total {
      background:
        radial-gradient(
          ellipse at 90% 0%,
          rgba(50, 204, 141, .18),
          transparent 55%
        ),
        linear-gradient(145deg, #12241a, #07100b) !important;
      border: 1px solid rgba(91, 220, 164, .22) !important;
      border-radius: 22px !important;
    }

    .portfolio-total b {
      color: #f1fff6 !important;
    }

    .bottom-nav {
      background: rgba(4, 12, 8, .96) !important;
      border: 1px solid rgba(106, 213, 161, .18) !important;
      box-shadow: 0 14px 38px rgba(0, 0, 0, .55) !important;
      backdrop-filter: blur(22px) !important;
      -webkit-backdrop-filter: blur(22px) !important;
    }

    .bottom-nav .nav-item {
      color: #71867a !important;
      border-radius: 13px !important;
    }

    .bottom-nav .nav-item.active {
      color: #78f0bc !important;
      background: rgba(49, 169, 112, .13) !important;
    }

    .bottom-nav .nav-item.active small {
      color: #a3f5d0 !important;
    }

    button,
    select {
      -webkit-tap-highlight-color: transparent;
    }

    .primary-btn,
    .mi-primary {
      background: linear-gradient(110deg, #1e8052, #155b3b) !important;
      border: 1px solid rgba(110, 241, 183, .25) !important;
      color: #f0fff7 !important;
      box-shadow: 0 8px 24px rgba(23, 127, 79, .18) !important;
    }

    /* =================================================
       5. PAGE LAYOUT ENGINE
       ================================================= */

    .page.active {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr);
      gap: 13px;
      align-content: start;
      animation: mirage-page-enter .42s ease both !important;
    }

    .page > * {
      min-width: 0;
    }

    .page-intro { grid-area: intro; }
    .hero-card { grid-area: hero; }
    #premium-kpis { grid-area: metrics; }
    #premium-equity { grid-area: equity; }
    #premium-positions { grid-area: positions; }
    #premium-activity { grid-area: activity; }
    #dashboard-markets { grid-area: markets; }
    .mirage-market-heading { grid-area: market-heading; }
    .mirage-system-heading { grid-area: system-heading; }
    .status-grid { grid-area: system; }

    /* DASHBOARD */

    #dashboard.active {
      grid-template-areas:
        "intro"
        "hero"
        "metrics"
        "equity"
        "market-heading"
        "markets"
        "positions"
        "activity"
        "system-heading"
        "system";
    }

    /* MARKETS */

    #markets.active {
      grid-template-areas:
        "intro"
        "market-toolbar"
        "market-list"
        "market-chart";
    }

    #markets .market-toolbar {
      grid-area: market-toolbar;
    }

    #markets #markets-list {
      grid-area: market-list;
    }

    #markets .chart-panel {
      grid-area: market-chart;
    }

    /* SIGNALS */

    #signals.active {
      grid-template-areas:
        "intro"
        "signal-controls"
        "signal-result"
        "signal-disclaimer";
    }

    #signals .signal-selector {
      grid-area: signal-controls;
    }

    #signals #analysis-result {
      grid-area: signal-result;
    }

    #signals .disclaimer {
      grid-area: signal-disclaimer;
    }

    /* STRATEGIES */

    #strategies.active {
      grid-template-areas:
        "intro"
        "strategy-summary"
        "strategy-list"
        "robustness"
        "risk-note";
    }

    #strategies .strategy-summary {
      grid-area: strategy-summary;
    }

    #strategies #strategy-list {
      grid-area: strategy-list;
    }

    #strategies .risk-note {
      grid-area: risk-note;
    }

    #strategies .mi-panel {
      grid-area: robustness;
    }

    /* PORTFOLIO */

    #portfolio.active {
      grid-template-areas:
        "intro"
        "portfolio-total"
        "portfolio-stats"
        "positions-heading"
        "positions-list"
        "accounts-heading"
        "accounts"
        "history-heading"
        "history";
    }

    #portfolio .portfolio-total {
      grid-area: portfolio-total;
    }

    #portfolio .portfolio-stats {
      grid-area: portfolio-stats;
    }

    #portfolio .positions-list {
      grid-area: positions-list;
    }

    #portfolio #portfolio-accounts {
      grid-area: accounts;
    }

    #portfolio .history-list {
      grid-area: history;
    }

    #portfolio .mirage-positions-heading {
      grid-area: positions-heading;
    }

    #portfolio .mirage-accounts-heading {
      grid-area: accounts-heading;
    }

    #portfolio .mirage-history-heading {
      grid-area: history-heading;
    }

    /* =================================================
       6. STEALTH MODE — FOCUSED COMMAND CENTER
       ================================================= */

    body[data-mirage-mode="stealth"] {
      --mirage-radius: 22px;
    }

    body[data-mirage-mode="stealth"] .mirage-mode-caption small {
      color: #789487;
    }

    body[data-mirage-mode="stealth"] .hero-card {
      min-height: 205px;
      padding: 21px !important;
      border-radius: 23px !important;
      box-shadow:
        0 18px 42px rgba(0, 0, 0, .25),
        0 0 28px rgba(49, 177, 119, .055) !important;
    }

    body[data-mirage-mode="stealth"] #premium-kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 9px !important;
    }

    body[data-mirage-mode="stealth"] .premium-kpi {
      min-height: 94px !important;
      padding: 13px !important;
    }

    body[data-mirage-mode="stealth"] .premium-kpi strong {
      font-size: 21px !important;
    }

    body[data-mirage-mode="stealth"] #premium-activity {
      display: none !important;
    }

    body[data-mirage-mode="stealth"] #portfolio #portfolio-accounts,
    body[data-mirage-mode="stealth"] #portfolio .history-list,
    body[data-mirage-mode="stealth"] #portfolio .mirage-accounts-heading,
    body[data-mirage-mode="stealth"] #portfolio .mirage-history-heading {
      display: none !important
        }

  /* ============================================================
     7. SPECTRE MODE — FULL ANALYTICS LAYOUT
  ============================================================ */

  body[data-mirage-mode="spectre"] #dashboard,
  body[data-mirage-mode="spectre"] #markets,
  body[data-mirage-mode="spectre"] #signals,
  body[data-mirage-mode="spectre"] #strategies,
  body[data-mirage-mode="spectre"] #portfolio {
    gap: 18px !important;
  }

  body[data-mirage-mode="spectre"] .hero-card {
    min-height: 250px !important;
    padding: 30px !important;
    border-radius: 18px !important;
    background:
      radial-gradient(circle at 85% 15%, rgba(16,185,129,.15), transparent 35%),
      linear-gradient(145deg, #101b19, #080e0d) !important;
    border: 1px solid rgba(16,185,129,.2) !important;
  }

  body[data-mirage-mode="spectre"] #premium-kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 12px !important;
  }

  body[data-mirage-mode="spectre"] .premium-kpi {
    min-height: 125px !important;
    padding: 18px !important;
    border-radius: 15px !important;
    background: linear-gradient(145deg, #121b19, #0a100f) !important;
    border: 1px solid rgba(148,163,184,.13) !important;
  }

  body[data-mirage-mode="spectre"] #premium-activity,
  body[data-mirage-mode="spectre"] #portfolio #portfolio-accounts,
  body[data-mirage-mode="spectre"] #portfolio .history-list {
    display: block !important;
  }

  body[data-mirage-mode="spectre"] .section-title {
    font-size: 15px !important;
    letter-spacing: .08em !important;
    text-transform: uppercase !important;
    color: #a7b8b1 !important;
  }

  body[data-mirage-mode="spectre"] .mi-panel,
  body[data-mirage-mode="spectre"] .mi-table,
  body[data-mirage-mode="spectre"] .mi-folds {
    border-color: rgba(52,211,153,.18) !important;
  }

  body[data-mirage-mode="spectre"] .mi-panel {
    background: linear-gradient(145deg, #111b18, #090f0e) !important;
    border-radius: 16px !important;
    padding: 20px !important;
  }

  body[data-mirage-mode="spectre"] .mi-table th {
    color: #8ecfc1 !important;
  }

  body[data-mirage-mode="spectre"] .mi-table td {
    border-color: rgba(102,211,161,.13) !important;
  }

  body[data-mirage-mode="spectre"] .mi-folds {
    display: block !important;
  }

  body[data-mirage-mode="spectre"] .mi-grid .mi-stat {
    display: flex !important;
  }

  /* ============================================================
     8. RESPONSIVE LAYOUT
  ============================================================ */

  @media (min-width: 700px) {
    main {
      padding-left: 25px !important;
      padding-right: 25px !important;
    }
  }

  @media (max-width: 699px) {
    .mirage-mode-toolbar {
      width: 100% !important;
      margin: 12px 0 18px !important;
    }

    .mirage-mode-switch {
      width: 100% !important;
    }

    .mirage-mode-option {
      flex: 1 !important;
      justify-content: center !important;
      font-size: 11px !important;
      padding: 12px 7px !important;
    }

    body[data-mirage-mode="stealth"] #premium-kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    body[data-mirage-mode="spectre"] #premium-kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    body[data-mirage-mode="spectre"] .hero-card {
      padding: 21px !important;
    }

    body[data-mirage-mode="spectre"] .premium-kpi {
      min-height: 105px !important;
      padding: 13px !important;
    }

    .mirage-brand-line {
      gap: 8px !important;
    }

    .mirage-status-led {
      width: 8px !important;
      height: 8px !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
      scroll-behavior: auto !important;
    }
  }

  /* ============================================================
     9. MODE TRANSITION
  ============================================================ */

  .mirage-mode-transition {
    position: fixed;
    inset: 0;
    z-index: 99999;
    pointer-events: none;
    opacity: 0;
    background:
      radial-gradient(circle at center,
        rgba(16,185,129,.18),
        rgba(2,6,5,.96) 75%);
    transition: opacity .32s ease;
  }

  .mirage-mode-transition.active {
    opacity: 1;
  }

  .mirage-mode-transition::after {
    content: "MIRAGE";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #a7f3d0;
    font-size: 21px;
    font-weight: 800;
    letter-spacing: .42em;
    text-shadow: 0 0 35px rgba(16,185,129,.55);
  }

  .mirage-mode-toolbar {
    position: relative;
    z-index: 20;
    display: flex;
    justify-content: center;
    width: 100%;
    margin: 14px auto 20px;
  }

  .mirage-mode-switch {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px;
    border-radius: 14px;
    background: #101816;
    border: 1px solid rgba(148,163,184,.2);
    box-shadow: 0 8px 28px rgba(0,0,0,.28);
  }

  .mirage-mode-option {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 11px 19px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #82918b;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .07em;
    cursor: pointer;
    transition: color .25s ease, background .25s ease;
  }

  .mirage-mode-option.active {
    color: #eafff5;
    background: linear-gradient(135deg, #126b4c, #0b4936);
    box-shadow: 0 0 18px rgba(16,185,129,.2);
  }

  .mirage-mode-option:focus-visible {
    outline: 2px solid #34d399;
    outline-offset: 3px;
  }

  .mirage-mode-highlight {
    display: none;
  }

  .mirage-brand-line {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .mirage-status-led {
    display: inline-block;
    width: 9px;
    height: 9px;
    flex: 0 0 9px;
    border-radius: 50%;
    background: #64748b;
    box-shadow: 0 0 0 3px rgba(100,116,139,.12);
    transition: background .2s ease, box-shadow .2s ease;
  }

  .mirage-status-led.online {
    background: #22c55e;
    box-shadow: 0 0 0 3px rgba(34,197,94,.13), 0 0 12px rgba(34,197,94,.6);
  }

  .mirage-status-led.offline {
    background: #ef4444;
    box-shadow: 0 0 0 3px rgba(239,68,68,.13), 0 0 12px rgba(239,68,68,.45);
  }

  .mirage-status-led.unknown {
    background: #94a3b8;
  }

  .mirage-mode-toolbar button,
  .mirage-mode-toolbar span {
    -webkit-tap-highlight-color: transparent;
  }
  `;

  /* ============================================================
     10. INSTALL STYLES
  ============================================================ */

  const mirageStyleId = "mirage-dual-interface-styles";

  let mirageStyle = document.getElementById(mirageStyleId);

  if (!mirageStyle) {
    mirageStyle = document.createElement("style");
    mirageStyle.id = mirageStyleId;
    document.head.appendChild(mirageStyle);
  }

  mirageStyle.textContent = css;

  /* ============================================================
     11. MODE STATE
  ============================================================ */

  const MIRAGE_MODE_KEY = "mirage-mode-v1";
  const VALID_MODES = ["stealth", "spectre"];

  let currentMode = "stealth";

  try {
    const savedMode = localStorage.getItem(MIRAGE_MODE_KEY);
    if (VALID_MODES.includes(savedMode)) {
      currentMode = savedMode;
    }
  } catch (error) {
    console.warn("[MIRAGE] Could not read saved mode:", error);
  }

  /* ============================================================
     12. TOP BAR
  ============================================================ */

  function setupBranding() {
    const topbar = document.querySelector(".topbar");
    if (!topbar) return;

    const brand = topbar.querySelector(".brand-copy b");
    if (brand && !brand.parentElement.classList.contains("mirage-brand-line")) {
      const line = document.createElement("span");
      line.className = "mirage-brand-line";

      const led = document.createElement("span");
      led.className = "mirage-status-led unknown";
      led.id = "mirage-connection-led";
      led.setAttribute("aria-label", "Connection status");

      brand.parentNode.insertBefore(line, brand);
      line.appendChild(brand);
      line.appendChild(led);
    }

    const livePills = document.querySelectorAll(
      ".live-pill, .live-badge, .live-indicator"
    );

    livePills.forEach((element) => {
      element.style.display = "none";
    });

    const connection = topbar.querySelector(".connection");
    if (connection) {
      connection.style.display = "none";
    }

    let toolbar = document.getElementById("mirage-mode-toolbar");

    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "mirage-mode-toolbar";
      toolbar.className = "mirage-mode-toolbar";

      toolbar.innerHTML = `
        <div class="mirage-mode-switch" role="group" aria-label="Interface mode">
          <button type="button"
            class="mirage-mode-option stealth-option"
            data-mode="stealth"
            aria-pressed="false">
            ◉ STEALTH MODE
          </button>
          <button type="button"
            class="mirage-mode-option spectre-option"
            data-mode="spectre"
            aria-pressed="false">
            ◈ SPECTRE MODE
          </button>
        </div>
      `;

      topbar.insertAdjacentElement("afterend", toolbar);

      toolbar.querySelectorAll("[data-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          setMode(button.dataset.mode, true);
        });
      });
    }

    updateConnectionLed();
  }

  /* ============================================================
     13. CONNECTION STATUS LED
  ============================================================ */

  function updateConnectionLed() {
    const led = document.getElementById("mirage-connection-led");
    if (!led) return;

    const label = document.querySelector("#connection-label");
    const labelText = label ? label.textContent.toLowerCase() : "";

    const sourceIcon = document.querySelector(".connection i");
    const iconColor = sourceIcon
      ? getComputedStyle(sourceIcon).color
      : "";

    led.classList.remove("online", "offline", "unknown");

    if (
      labelText.includes("онлайн") ||
      labelText.includes("online") ||
      labelText.includes("connected") ||
      labelText.includes("подключено") ||
      iconColor.includes("34, 197, 94") ||
      iconColor.includes("16, 185, 129")
    ) {
      led.classList.add("online");
    } else if (
      labelText.includes("ошибка") ||
      labelText.includes("offline") ||
      labelText.includes("отключ") ||
      labelText.includes("error") ||
      labelText.includes("failed") ||
      iconColor.includes("239, 68, 68")
    ) {
      led.classList.add("offline");
    } else {
      led.classList.add("unknown");
    }
  }

  /* ============================================================
     14. PAGE MAPPING
  ============================================================ */

  function mapDashboard() {
    const dashboard = document.querySelector("#dashboard");
    if (!dashboard) return;

    dashboard.dataset.mirageMapped = "true";
  }

  function mapMarkets() {
    const markets = document.querySelector("#markets");
    if (!markets) return;

    markets.dataset.mirageMapped = "true";
  }

  function mapSignals() {
    const signals = document.querySelector("#signals");
    if (!signals) return;

    signals.dataset.mirageMapped = "true";
  }

  function mapStrategies() {
    const strategies = document.querySelector("#strategies");
    if (!strategies) return;

    strategies.dataset.mirageMapped = "true";
  }

  function mapPortfolio() {
    const portfolio = document.querySelector("#portfolio");
    if (!portfolio) return;

    portfolio.dataset.mirageMapped = "true";
  }

  function mapAllPages() {
    mapDashboard();
    mapMarkets();
    mapSignals();
    mapStrategies();
    mapPortfolio();
  }

  /* ============================================================
     15. APPLY MODE
  ============================================================ */

  function updateModeButtons() {
    const toolbar = document.getElementById("mirage-mode-toolbar");
    if (!toolbar) return;

    toolbar.querySelectorAll("[data-mode]").forEach((button) => {
      const active = button.dataset.mode === currentMode;

      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function applyMode() {
    document.body.dataset.mirageMode = currentMode;

    document.documentElement.dataset.mirageMode = currentMode;

    updateModeButtons();
    mapAllPages();
    updateConnectionLed();

    window.dispatchEvent(
      new CustomEvent("mirage:modechange", {
        detail: { mode: currentMode }
      })
    );
  }

  function setMode(mode, animate = false) {
    if (!VALID_MODES.includes(mode) || mode === currentMode) return;

    currentMode = mode;

    try {
      localStorage.setItem(MIRAGE_MODE_KEY, currentMode);
    } catch (error) {
      console.warn("[MIRAGE] Could not save mode:", error);
    }

    const transition = document.getElementById("mirage-mode-transition");

    if (animate && transition) {
      transition.classList.add("active");

      window.setTimeout(() => {
        applyMode();

        window.setTimeout(() => {
          transition.classList.remove("active");
        }, 180);
      }, 180);
    } else {
      applyMode();
    }
  }

  /* ============================================================
     16. TRANSITION OVERLAY
  ============================================================ */

  function setupTransition() {
    if (document.getElementById("mirage-mode-transition")) return;

    const overlay = document.createElement("div");
    overlay.id = "mirage-mode-transition";
    overlay.className = "mirage-mode-transition";
    overlay.setAttribute("aria-hidden", "true");

    document.body.appendChild(overlay);
  }

  /* ============================================================
     17. DOM WATCHERS
  ============================================================ */

  let updateQueued = false;

  function scheduleUpdate() {
    if (updateQueued) return;

    updateQueued = true;

    requestAnimationFrame(() => {
      updateQueued = false;

      setupBranding();
      mapAllPages();
      updateConnectionLed();
      updateModeButtons();
    });
  }

  function setupObservers() {
    const observer = new MutationObserver((records) => {
      let shouldUpdate = false;

      for (const record of records) {
        if (
          record.type === "childList" ||
          record.type === "characterData" ||
          record.attributeName === "style"
        ) {
          shouldUpdate = true;
          break;
        }
      }

      if (shouldUpdate) scheduleUpdate();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style"]
    });

    const connectionLabel = document.querySelector("#connection-label");

    if (connectionLabel) {
      const statusObserver = new MutationObserver(updateConnectionLed);

      statusObserver.observe(connectionLabel, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }

  /* ============================================================
     18. INITIALIZATION
  ============================================================ */

  function initializeMirage() {
    setupTransition();
    setupBranding();
    mapAllPages();
    applyMode();
    setupObservers();

    console.info(
      `[MIRAGE] Dual Interface System initialized: ${currentMode.toUpperCase()}`
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMirage, {
      once: true
    });
  } else {
    initializeMirage();
  }

})();
