/* ============================================================
   MIRAGE 2.9.1 — SAFE DUAL INTERFACE REBUILD
   STEALTH MODE / SPECTRE MODE
   Presentation layer only. No trading/API/database changes.
   ============================================================ */

(() => {
  "use strict";

  if (window.__MIRAGE_DUAL_INTERFACE_V291__) return;
  window.__MIRAGE_DUAL_INTERFACE_V291__ = true;

  const STORAGE_KEY = "mirage-mode-v1";
  const VALID_MODES = ["stealth", "spectre"];

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  let mode = "stealth";
  let transitionBusy = false;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (VALID_MODES.includes(saved)) mode = saved;
  } catch (_) {}

  /* ==========================================================
     1. DESIGN SYSTEM
  ========================================================== */

  const css = `
    :root {
      --mirage-bg: #050a08;
      --mirage-panel: #0d1712;
      --mirage-panel-2: #122019;
      --mirage-line: rgba(113, 220, 169, .15);
      --mirage-green: #42e6a5;
      --mirage-green-soft: #a2fbd2;
      --mirage-red: #ff596d;
      --mirage-text: #effaf3;
      --mirage-muted: #82958a;
    }

    html, body {
      background: var(--mirage-bg) !important;
      color: var(--mirage-text) !important;
    }

    body {
      background:
        radial-gradient(ellipse at 50% -15%,
          rgba(35, 128, 83, .18), transparent 48%),
        radial-gradient(ellipse at 100% 60%,
          rgba(16, 79, 52, .08), transparent 40%),
        #050a08 !important;
      transition: background .35s ease, color .35s ease;
    }

    .app-shell {
      max-width: 900px !important;
      overflow-x: clip !important;
      padding-bottom: 120px !important;
    }

    main {
      padding-top: 18px !important;
    }

    /* TOP BAR */

    .topbar {
      position: sticky !important;
      top: 0 !important;
      z-index: 100 !important;
      min-height: 70px !important;
      height: auto !important;
      padding: 12px 18px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 10px !important;
      background: rgba(4, 11, 7, .96) !important;
      border-bottom: 1px solid rgba(104, 207, 157, .12) !important;
      backdrop-filter: blur(22px) !important;
      -webkit-backdrop-filter: blur(22px) !important;
    }

    .brand {
      min-width: 0 !important;
      gap: 10px !important;
      background: transparent !important;
      border: 0 !important;
    }

    .brand-mark {
      flex: 0 0 42px !important;
      width: 42px !important;
      height: 42px !important;
      border-radius: 13px !important;
      overflow: hidden !important;
      border: 1px solid rgba(83, 230, 174, .35) !important;
      background: #07110c !important;
      box-shadow: 0 0 20px rgba(49, 216, 151, .13) !important;
    }

    .brand-mark img {
      display: block !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    .brand-copy {
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
      min-width: 0 !important;
    }

    .brand-copy b {
      color: #f1fff7 !important;
      font-size: 13px !important;
      font-weight: 900 !important;
      letter-spacing: 2.5px !important;
    }

    .brand-copy small {
      color: #789687 !important;
      font-size: 7px !important;
      letter-spacing: 1.4px !important;
      white-space: nowrap !important;
    }

    .mirage-brand-line {
      display: inline-flex !important;
      align-items: center !important;
      gap: 9px !important;
    }

    .mirage-system-led {
      display: inline-block !important;
      width: 8px !important;
      height: 8px !important;
      flex: 0 0 8px !important;
      border-radius: 50% !important;
      background: #87938b !important;
      transition: background .2s ease, box-shadow .2s ease !important;
    }

    .mirage-system-led.online {
      background: #32e59a !important;
      box-shadow: 0 0 7px #32e59a, 0 0 16px rgba(50,229,154,.4) !important;
    }

    .mirage-system-led.offline {
      background: #ff5368 !important;
      box-shadow: 0 0 7px #ff5368, 0 0 16px rgba(255,83,104,.4) !important;
    }

    .top-actions .connection {
      display: none !important;
    }

    .live-pill,
    .live-badge,
    .live-indicator {
      display: none !important;
    }

    #refresh-btn {
      flex: 0 0 40px !important;
      width: 40px !important;
      height: 40px !important;
      border-radius: 13px !important;
      color: #9af5ca !important;
      background: #102017 !important;
      border: 1px solid rgba(102, 224, 165, .2) !important;
    }

    /* MODE SELECTOR */

    .mirage-mode-toolbar {
      position: relative !important;
      z-index: 80 !important;
      width: 100% !important;
      max-width: 900px !important;
      margin: 0 auto 18px !important;
      padding: 12px 18px !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      background: linear-gradient(90deg, #07120c, #0c1b12, #07120c) !important;
      border-bottom: 1px solid rgba(90, 210, 151, .13) !important;
    }

    .mirage-mode-caption {
      min-width: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
    }

    .mirage-mode-caption strong {
      color: #e6fff1 !important;
      font-size: 9px !important;
      font-weight: 900 !important;
      letter-spacing: 2px !important;
    }

    .mirage-mode-caption small {
      color: #799487 !important;
      font-size: 9px !important;
    }

    .mirage-mode-switch {
      position: relative !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      align-items: center !important;
      flex: 0 0 auto !important;
      width: 226px !important;
      min-height: 45px !important;
      padding: 4px !important;
      border: 1px solid rgba(91, 221, 164, .35) !important;
      border-radius: 14px !important;
      background: linear-gradient(145deg, #14241b, #08110c) !important;
      box-shadow: 0 7px 24px rgba(0,0,0,.3),
                  0 0 18px rgba(52,197,137,.08) !important;
      overflow: hidden !important;
    }

    .mirage-mode-option {
      position: relative !important;
      z-index: 2 !important;
      min-width: 0 !important;
      height: 35px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 5px !important;
      padding: 0 4px !important;
      border: 0 !important;
      border-radius: 10px !important;
      background: transparent !important;
      color: #82978b !important;
      font-size: 8px !important;
      font-weight: 900 !important;
      letter-spacing: .5px !important;
      white-space: nowrap !important;
      cursor: pointer !important;
      transition: color .25s ease !important;
    }

    .mirage-mode-option.active {
      color: #effff6 !important;
    }

    .mirage-mode-option:focus-visible {
      outline: 2px solid #68efb7 !important;
      outline-offset: 2px !important;
    }

    .mirage-mode-highlight {
      position: absolute !important;
      z-index: 1 !important;
      left: 4px !important;
      top: 4px !important;
      bottom: 4px !important;
      width: calc(50% - 4px) !important;
      border: 1px solid rgba(110,255,194,.35) !important;
      border-radius: 10px !important;
      background: linear-gradient(145deg, #245a40, #123522) !important;
      box-shadow: 0 0 17px rgba(48,219,147,.2) !important;
      transition: transform .35s cubic-bezier(.2,.8,.2,1) !important;
      pointer-events: none !important;
    }

    .mirage-mode-switch.is-spectre .mirage-mode-highlight {
      transform: translateX(100%) !important;
      background: linear-gradient(145deg, #164a38, #09251a) !important;
    }

    /* SHARED COMPONENTS */

    .page-intro {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      margin: 0 0 17px !important;
      padding: 4px 2px 13px !important;
      border-bottom: 1px solid rgba(114,208,165,.1) !important;
    }

    .page-intro .eyebrow,
    .eyebrow {
      color: #65c99c !important;
      font-size: 8px !important;
      font-weight: 900 !important;
      letter-spacing: 2px !important;
    }

    .page-intro h1 {
      margin: 5px 0 !important;
      color: #f0fff6 !important;
      font-size: clamp(24px, 5vw, 33px) !important;
      font-weight: 900 !important;
      letter-spacing: -1px !important;
    }

    .subtle {
      color: #83998d !important;
    }

    .hero-card,
    .premium-kpi,
    #premium-equity,
    #premium-positions,
    #premium-activity,
    .chart-panel,
    .market-row,
    .mini-market,
    .strategy-card,
    .status-card,
    .portfolio-total,
    .risk-note,
    .mi-panel {
      border-color: var(--mirage-line) !important;
      transition: background .3s ease, border-color .3s ease,
                  box-shadow .3s ease, transform .3s ease !important;
    }

    .hero-card {
      position: relative !important;
      overflow: hidden !important;
      border-radius: 22px !important;
      border: 1px solid rgba(92,220,165,.22) !important;
      background:
        radial-gradient(ellipse at 90% 0%, rgba(52,203,143,.17), transparent 45%),
        linear-gradient(145deg, #102019, #08100c 72%) !important;
      box-shadow: 0 16px 38px rgba(0,0,0,.3) !important;
    }

    .hero-balance {
      color: #f2fff7 !important;
      text-shadow: 0 0 27px rgba(61,219,157,.12) !important;
    }

    .hero-pnl {
      color: #65e6ad !important;
    }

    .premium-kpi {
      min-width: 0 !important;
      border-radius: 17px !important;
      background: linear-gradient(145deg, #13231a, #0a120d) !important;
      border: 1px solid rgba(104,213,161,.14) !important;
    }

    .premium-kpi strong {
      color: #f1fff7 !important;
    }

    #premium-equity,
    #premium-positions,
    #premium-activity {
      border-radius: 19px !important;
      background: linear-gradient(145deg, #111f17, #080f0b) !important;
      border: 1px solid rgba(106,213,161,.14) !important;
    }

    .section-title h2 {
      color: #e9f8ef !important;
    }

    .chart-panel,
    .analysis-card,
    .analysis-placeholder {
      border-radius: 18px !important;
      background: linear-gradient(145deg, #101d16, #080f0b) !important;
    }

    .market-row {
      border-radius: 14px !important;
      background: rgba(12,25,17,.82) !important;
    }

    .market-row.selected {
      border-color: rgba(76,231,167,.48) !important;
      background: rgba(26,82,54,.22) !important;
    }

    .strategy-card {
      border-radius: 17px !important;
      background: linear-gradient(145deg, #13231a, #09110c) !important;
    }

    .portfolio-total {
      border-radius: 21px !important;
      background: linear-gradient(145deg, #12241a, #07100b) !important;
    }

    .risk-note {
      border-radius: 16px !important;
      background: rgba(13,30,19,.75) !important;
    }

    .bottom-nav {
      background: rgba(4,12,8,.97) !important;
      border: 1px solid rgba(106,213,161,.18) !important;
      box-shadow: 0 14px 38px rgba(0,0,0,.55) !important;
      backdrop-filter: blur(22px) !important;
      -webkit-backdrop-filter: blur(22px) !important;
    }

    .bottom-nav .nav-item {
      min-width: 0 !important;
      color: #71867a !important;
      border-radius: 13px !important;
    }

    .bottom-nav .nav-item.active {
      color: #78f0bc !important;
      background: rgba(49,169,112,.13) !important;
    }   
    .bottom-nav .nav-item.active small {
      color: #a3f5d0 !important;
    }

    .primary-btn,
    .mi-primary {
      background: linear-gradient(110deg, #1e8052, #155b3b) !important;
      border: 1px solid rgba(110,241,183,.25) !important;
      color: #f0fff7 !important;
    }

    /* PAGE GRID */

    .page.active {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 13px !important;
      align-content: start !important;
      animation: mirage-page-enter .35s ease both !important;
    }

    .page > * {
      min-width: 0 !important;
    }

    @keyframes mirage-page-enter {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Dashboard blocks */

    #dashboard .page-intro { grid-area: intro; }
    #dashboard .hero-card { grid-area: hero; }
    #dashboard #premium-kpis { grid-area: metrics; }
    #dashboard #premium-equity { grid-area: equity; }
    #dashboard #premium-positions { grid-area: positions; }
    #dashboard #premium-activity { grid-area: activity; }

    #dashboard .mirage-market-heading { grid-area: market-heading; }
    #dashboard #dashboard-markets { grid-area: markets; }
    #dashboard .mirage-system-heading { grid-area: system-heading; }
    #dashboard .status-grid { grid-area: system; }

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

    /* Markets */

    #markets.active {
      grid-template-areas:
        "intro"
        "market-toolbar"
        "market-list"
        "market-chart";
    }

    #markets .page-intro { grid-area: intro; }
    #markets .market-toolbar { grid-area: market-toolbar; }
    #markets #markets-list { grid-area: market-list; }
    #markets .chart-panel { grid-area: market-chart; }

    /* Signals */

    #signals.active {
      grid-template-areas:
        "intro"
        "signal-controls"
        "signal-result"
        "signal-disclaimer";
    }

    #signals .page-intro { grid-area: intro; }
    #signals .signal-selector { grid-area: signal-controls; }
    #signals #analysis-result { grid-area: signal-result; }
    #signals .disclaimer { grid-area: signal-disclaimer; }

    /* Strategies */

    #strategies.active {
      grid-template-areas:
        "intro"
        "strategy-summary"
        "strategy-list"
        "robustness"
        "risk-note";
    }

    #strategies .page-intro { grid-area: intro; }
    #strategies .strategy-summary { grid-area: strategy-summary; }
    #strategies #strategy-list { grid-area: strategy-list; }
    #strategies .risk-note { grid-area: risk-note; }
    #strategies .mi-panel { grid-area: robustness; }

    /* Portfolio */

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

    #portfolio .page-intro { grid-area: intro; }
    #portfolio .portfolio-total { grid-area: portfolio-total; }
    #portfolio .portfolio-stats { grid-area: portfolio-stats; }
    #portfolio .mirage-positions-heading { grid-area: positions-heading; }
    #portfolio #positions-list { grid-area: positions-list; }
    #portfolio .mirage-accounts-heading { grid-area: accounts-heading; }
    #portfolio #portfolio-accounts { grid-area: accounts; }
    #portfolio .mirage-history-heading { grid-area: history-heading; }
    #portfolio #history-list { grid-area: history; }

    /* STEALTH — compact command center */

    body[data-mirage-mode="stealth"] .hero-card {
      min-height: 190px !important;
      padding: 22px !important;
      border-radius: 23px !important;
    }

    body[data-mirage-mode="stealth"] #premium-kpis {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 9px !important;
    }

    body[data-mirage-mode="stealth"] .premium-kpi {
      min-height: 91px !important;
      padding: 12px !important;
    }

    body[data-mirage-mode="stealth"] #premium-equity,
    body[data-mirage-mode="stealth"] #premium-activity {
      display: none !important;
    }

    body[data-mirage-mode="stealth"] #premium-positions {
      padding: 14px !important;
    }

    body[data-mirage-mode="stealth"] .section-title {
      margin: 10px 0 !important;
    }

    body[data-mirage-mode="stealth"] .section-title h2 {
      font-size: 14px !important;
    }

    body[data-mirage-mode="stealth"] .page-intro h1 {
      font-size: 25px !important;
    }

    /* SPECTRE — full intelligence console */

    body[data-mirage-mode="spectre"] {
      --mirage-bg: #030706;
      --mirage-panel: #0a100e;
      --mirage-line: rgba(75,224,164,.22);
    }

    body[data-mirage-mode="spectre"] .app-shell {
      max-width: 1040px !important;
    }

    body[data-mirage-mode="spectre"] .page.active {
      gap: 17px !important;
    }

    body[data-mirage-mode="spectre"] .hero-card {
      min-height: 245px !important;
      padding: 30px !important;
      border-radius: 18px !important;
      background:
        radial-gradient(circle at 85% 15%, rgba(16,185,129,.17), transparent 36%),
        linear-gradient(145deg, #101b18, #070d0b) !important;
      border-color: rgba(65,235,172,.28) !important;
    }

    body[data-mirage-mode="spectre"] #premium-kpis {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 12px !important;
    }

    body[data-mirage-mode="spectre"] .premium-kpi {
      min-height: 120px !important;
      padding: 17px !important;
    }

    body[data-mirage-mode="spectre"] #premium-equity,
    body[data-mirage-mode="spectre"] #premium-activity,
    body[data-mirage-mode="spectre"] #premium-positions {
      display: block !important;
      padding: 19px !important;
    }

    body[data-mirage-mode="spectre"] .section-title h2 {
      font-size: 16px !important;
      letter-spacing: .02em !important;
    }

    body[data-mirage-mode="spectre"] .mi-panel {
      display: block !important;
      padding: 20px !important;
      border-color: rgba(52,211,153,.2) !important;
      background: linear-gradient(145deg, #111b18, #090f0e) !important;
    }

    body[data-mirage-mode="spectre"] .mi-table th {
      color: #8ecfc1 !important;
    }

    body[data-mirage-mode="spectre"] .mi-table td {
      border-color: rgba(102,211,161,.13) !important;
    }

    /* TRANSITION */

    .mirage-mode-transition {
      position: fixed !important;
      inset: 0 !important;
      z-index: 99999 !important;
      pointer-events: none !important;
      opacity: 0 !important;
      background: radial-gradient(circle at center,
        rgba(16,185,129,.2), rgba(2,6,5,.97) 75%) !important;
      transition: opacity .25s ease !important;
    }

    .mirage-mode-transition.active {
      opacity: 1 !important;
    }

    .mirage-mode-transition::after {
      content: "MIRAGE" !important;
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      color: #a7f3d0 !important;
      font-size: 20px !important;
      font-weight: 900 !important;
      letter-spacing: .4em !important;
      text-shadow: 0 0 35px rgba(16,185,129,.55) !important;
    }

    /* MOBILE */

    @media (max-width: 600px) {
      .mirage-mode-toolbar {
        padding: 11px 12px !important;
        gap: 7px !important;
      }

      .mirage-mode-caption strong {
        font-size: 8px !important;
        letter-spacing: 1.3px !important;
      }

      .mirage-mode-caption small {
        font-size: 8px !important;
      }

      .mirage-mode-switch {
        width: 204px !important;
      }

      .mirage-mode-option {
        font-size: 7px !important;
        letter-spacing: .2px !important;
      }

      body[data-mirage-mode="spectre"] #premium-kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }

      .bottom-nav {
        width: calc(100% - 20px) !important;
        max-width: 710px !important;
        height: 76px !important;
        min-height: 76px !important;
        padding: 5px !important;
        display: grid !important;
        grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
        gap: 2px !important;
      }

      .bottom-nav > .nav-item {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        margin: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 4px !important;
      }

      .bottom-nav > .nav-item > span {
        font-size: 18px !important;
      }

      .bottom-nav > .nav-item > small {
        font-size: 9px !important;
        white-space: nowrap !important;
      }
    }

    @media (min-width: 601px) {
      body[data-mirage-mode="spectre"] #premium-kpis {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
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

    /* 2.9.1 SPECTRE VISUAL IDENTITY — violet intelligence console */
    body[data-mirage-mode="spectre"] {
      --mirage-bg:#080610;
      --mirage-panel:#100d1d;
      --mirage-panel-2:#171128;
      --mirage-line:rgba(170,125,255,.22);
      --mirage-green:#bd8cff;
      --mirage-green-soft:#e0c9ff;
      --mirage-text:#f4efff;
      --mirage-muted:#9a8eae;
      background:#080610!important;
      color:#f4efff!important;
    }

    body[data-mirage-mode="spectre"] {
      background:
        radial-gradient(ellipse at 85% 0%,rgba(132,75,210,.22),transparent 42%),
        radial-gradient(ellipse at 0% 55%,rgba(84,52,145,.14),transparent 42%),
        #080610!important;
    }

    body[data-mirage-mode="spectre"] .topbar {
      background:rgba(9,6,18,.96)!important;
      border-color:rgba(174,132,255,.2)!important;
    }

    body[data-mirage-mode="spectre"] .mirage-mode-toolbar {
      background:linear-gradient(100deg,#0d0918,#1a1030,#0d0918)!important;
      border-color:rgba(177,133,255,.22)!important;
    }

    body[data-mirage-mode="spectre"] .mirage-mode-switch {
      background:linear-gradient(145deg,#211638,#100b1c)!important;
      border-color:rgba(192,151,255,.4)!important;
      box-shadow:0 0 26px rgba(151,93,235,.13)!important;
    }

    body[data-mirage-mode="spectre"] .mirage-mode-highlight {
      background:linear-gradient(145deg,#7543b8,#40236f)!important;
      border-color:rgba(220,192,255,.45)!important;
      box-shadow:0 0 22px rgba(168,112,255,.35)!important;
    }

    body[data-mirage-mode="spectre"] .mirage-mode-option.active,
    body[data-mirage-mode="spectre"] .mirage-mode-caption strong,
    body[data-mirage-mode="spectre"] .page-intro .eyebrow,
    body[data-mirage-mode="spectre"] .eyebrow {
      color:#d5b5ff!important;
    }

    body[data-mirage-mode="spectre"] .hero-card {
      min-height:230px!important;
      padding:26px!important;
      border-radius:12px!important;
      border:1px solid rgba(187,145,255,.32)!important;
      background:
        linear-gradient(115deg,transparent 0 62%,rgba(157,102,235,.12) 62.2%,transparent 62.6%),
        radial-gradient(circle at 88% 15%,rgba(159,101,244,.25),transparent 38%),
        linear-gradient(135deg,#1a1230,#0c0917 72%)!important;
      box-shadow:inset 0 0 35px rgba(142,87,220,.07),0 18px 48px rgba(0,0,0,.38)!important;
    }

    body[data-mirage-mode="spectre"] .hero-balance {
      color:#f4eaff!important;
      text-shadow:0 0 30px rgba(181,133,255,.22)!important;
    }

    body[data-mirage-mode="spectre"] .hero-pnl {
      color:#c69aff!important;
    }

    body[data-mirage-mode="spectre"] .premium-kpi,
    body[data-mirage-mode="spectre"] #premium-equity,
    body[data-mirage-mode="spectre"] #premium-positions,
    body[data-mirage-mode="spectre"] #premium-activity,
    body[data-mirage-mode="spectre"] .chart-panel,
    body[data-mirage-mode="spectre"] .analysis-card,
    body[data-mirage-mode="spectre"] .analysis-placeholder,
    body[data-mirage-mode="spectre"] .strategy-card,
    body[data-mirage-mode="spectre"] .portfolio-total,
    body[data-mirage-mode="spectre"] .risk-note,
    body[data-mirage-mode="spectre"] .mi-panel {
      background:linear-gradient(145deg,#171128,#0d0a18)!important;
      border:1px solid rgba(171,126,245,.2)!important;
      border-radius:12px!important;
      box-shadow:inset 0 1px rgba(255,255,255,.025),0 12px 28px rgba(0,0,0,.2)!important;
    }

    body[data-mirage-mode="spectre"] .market-row {
      background:rgba(23,16,40,.88)!important;
      border-color:rgba(171,126,245,.16)!important;
    }

    body[data-mirage-mode="spectre"] .market-row.selected {
      background:rgba(110,66,166,.2)!important;
      border-color:rgba(197,157,255,.5)!important;
    }

    body[data-mirage-mode="spectre"] .section-title h2,
    body[data-mirage-mode="spectre"] .page-intro h1 {
      color:#f2eaff!important;
    }

    body[data-mirage-mode="spectre"] .bottom-nav {
      background:rgba(10,7,19,.97)!important;
      border-color:rgba(174,132,255,.25)!important;
    }

    body[data-mirage-mode="spectre"] .bottom-nav .nav-item.active {
      color:#d4b4ff!important;
      background:rgba(135,82,204,.18)!important;
    }

    body[data-mirage-mode="spectre"] .mirage-mode-transition {
      background:radial-gradient(circle at center,rgba(130,75,210,.3),rgba(5,3,12,.98) 75%)!important;
    }

    body[data-mirage-mode="spectre"] .mirage-mode-transition::after {
      content:"SPECTRE"!important;
      color:#d8bcff!important;
      text-shadow:0 0 38px rgba(173,119,255,.7)!important;
    }

    .bottom-nav .nav-item > span svg {
      width:21px!important;
      height:21px!important;
      fill:none!important;
      stroke:currentColor!important;
      stroke-width:1.7!important;
      stroke-linecap:round!important;
      stroke-linejoin:round!important;
      display:block!important;
    }

    @media(max-width:380px) {
      .mirage-mode-toolbar {
        align-items:flex-start!important;
        flex-direction:column!important;
      }
      .mirage-mode-switch {
        width:100%!important;
      }
    } `;

  const styleId = "mirage-dual-interface-v291-style";
  let styleNode = document.getElementById(styleId);

  if (!styleNode) {
    styleNode = document.createElement("style");
    styleNode.id = styleId;
    document.head.appendChild(styleNode);
  }

  styleNode.textContent = css;

  /* ==========================================================
     2. MODE TOOLBAR
  ========================================================== */

  function buildToolbar() {
    const topbar = $(".topbar");
    if (!topbar) return;

    let toolbar = $("#mirage-mode-toolbar");

    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "mirage-mode-toolbar";
      toolbar.className = "mirage-mode-toolbar";

      toolbar.innerHTML = `
        <div class="mirage-mode-caption">
          <strong>INTERFACE PROFILE</strong>
          <small>Выбери свой режим MIRAGE</small>
        </div>

        <div class="mirage-mode-switch" role="group"
             aria-label="Режим интерфейса">
          <span class="mirage-mode-highlight"></span>

          <button type="button"
                  class="mirage-mode-option"
                  data-mode="stealth"
                  aria-pressed="false">
            ◉ STEALTH
          </button>

          <button type="button"
                  class="mirage-mode-option"
                  data-mode="spectre"
                  aria-pressed="false">
            ◈ SPECTRE
          </button>
        </div>
      `;

      topbar.insertAdjacentElement("afterend", toolbar);

      toolbar.querySelectorAll("[data-mode]").forEach(button => {
        button.addEventListener("click", () => {
          changeMode(button.dataset.mode);
        });
      });
    }

    updateToolbar();
  }

  function updateToolbar() {
    const toolbar = $("#mirage-mode-toolbar");
    if (!toolbar) return;

    const switcher = $(".mirage-mode-switch", toolbar);
    switcher?.classList.toggle("is-spectre", mode === "spectre");

    toolbar.querySelectorAll("[data-mode]").forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  /* ==========================================================
     3. BRAND AND CONNECTION LED
  ========================================================== */

  function setupBrand() {
    const brandCopy = $(".brand-copy");
    const brand = $(".brand-copy b");

    if (brand && !$("#mirage-connection-led")) {
      const line = document.createElement("span");
      line.className = "mirage-brand-line";

      const led = document.createElement("span");
      led.id = "mirage-connection-led";
      led.className = "mirage-system-led";
      led.setAttribute("role", "status");
      led.setAttribute("aria-label", "Состояние соединения");

      brand.parentNode.insertBefore(line, brand);
      line.appendChild(brand);
      line.appendChild(led);
    }

    if (brandCopy) {
      const live = $$(".live-pill, .live-badge, .live-indicator");
      live.forEach(node => node.remove());
    }

    updateConnectionLed();
  }

  function updateConnectionLed() {
    const led = $("#mirage-connection-led");
    if (!led) return;

    const label = $("#connection-label");
    const text = (label?.textContent || "").toLowerCase();

    const sourceDot = $(".connection i");
    const sourceColor = sourceDot
      ? getComputedStyle(sourceDot).backgroundColor
      : "";

    const isOffline =
      text.includes("нет связи") ||
      text.includes("ошибка") ||
      text.includes("отключ") ||
      text.includes("offline") ||
      text.includes("error") ||
      text.includes("недоступ");

    const isOnline =
      text.includes("онлайн") ||
      text.includes("online") ||
      text.includes("подключено") ||
      text.includes("connected") ||
      sourceColor.includes("53, 229, 155") ||
      sourceColor.includes("35, 229, 155");

    led.classList.toggle("offline", isOffline);
    led.classList.toggle("online", !isOffline && isOnline);
  }

  /* ==========================================================
     4. PAGE STRUCTURE HELPERS
  ========================================================== */

  function addHeading(page, selector, className, eyebrow, title) {
    const host = $(selector, page);
    if (!host) return;

    const existing = $(`.${className}`, page);
    if (existing) return;

    const heading = document.createElement("div");
    heading.className = `section-title ${className}`;
    heading.innerHTML = `
      <div>
        <span class="eyebrow">${eyebrow}</span>
        <h2>${title}</h2>
      </div>
    `;

    host.insertAdjacentElement("beforebegin", heading);
  }

  function prepareDashboard() {
    const page = $("#dashboard");
    if (!page) return;

    const marketHost = $("#dashboard-markets", page);
    if (marketHost) {
      marketHost.style.display = "grid";
      marketHost.style.gap = "10px";
      addHeading(
        page,
        "#dashboard-markets",
        "mirage-market-heading",
        "MARKET WATCH",
        "Рынок сейчас"
      );
    }

    const statusGrid = $(".status-grid", page);
    if (statusGrid) {
      statusGrid.style.display = "grid";
      addHeading(
        page,
        ".status-grid",
        "mirage-system-heading",
        "SYSTEM STATUS",
        "Состояние системы"
      );
    }
  }

  function preparePortfolio() {
    const page = $("#portfolio");
    if (!page) return;

    addHeading(
      page,
      "#positions-list",
      "mirage-positions-heading",
      "OPEN POSITIONS",
      "Открытые позиции"
    );

    addHeading(
      page,
      "#portfolio-accounts",
      "mirage-accounts-heading",
      "ACCOUNT BREAKDOWN",
      "Счета стратегий"
    );

    addHeading(
      page,
      "#history-list",
      "mirage-history-heading",
      "RECENT ACTIVITY",
      "Последние сделки"
    );
  }

  function preparePages() {
    prepareDashboard();
    preparePortfolio();

    // Keep the app's existing navigation nodes and their event listeners intact.
    const nav = $(".bottom-nav");
    if (!nav) return;

    const icons = {
      dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
      markets: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5m0 14h17M7 15l4-5 3 3 6-8"/></svg>',
      signals: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
      strategies: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="16" rx="1"/><rect x="14" y="4" width="6" height="7" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
      portfolio: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-8 0v2h-2v-2"/></svg>'
    };

    nav.querySelectorAll(".nav-item").forEach((button) => {
      const svg = icons[button.dataset.page];
      const span = button.querySelector("span");

      if (svg && span && !span.dataset.mirageSvg) {
        span.innerHTML = svg;
        span.dataset.mirageSvg = "1";
      }
    });
  }  /* ==========================================================
     5. MODE APPLICATION
  ========================================================== */

  function applyMode() {
    document.documentElement.dataset.mirageMode = mode;
    document.body.dataset.mirageMode = mode;

    updateToolbar();
    updateConnectionLed();

    window.dispatchEvent(new CustomEvent("mirage:modechange", {
      detail: { mode }
    }));
  }

  function changeMode(nextMode) {
    if (!VALID_MODES.includes(nextMode)) return;
    if (nextMode === mode || transitionBusy) return;

    mode = nextMode;

    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {}

    const overlay = $("#mirage-mode-transition");

    if (!overlay || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyMode();
      return;
    }

    transitionBusy = true;
    overlay.classList.add("active");

    window.setTimeout(() => {
      applyMode();

      window.setTimeout(() => {
        overlay.classList.remove("active");
        transitionBusy = false;
      }, 180);
    }, 170);
  }

  /* ==========================================================
     6. TRANSITION OVERLAY
  ========================================================== */

  function setupTransition() {
    if ($("#mirage-mode-transition")) return;

    const overlay = document.createElement("div");
    overlay.id = "mirage-mode-transition";
    overlay.className = "mirage-mode-transition";
    overlay.setAttribute("aria-hidden", "true");

    document.body.appendChild(overlay);
  }

  /* ==========================================================
     7. INITIALIZATION
  ========================================================== */

  function initialize() {
    setupBrand();
    buildToolbar();
    preparePages();
    setupTransition();
    applyMode();

    const label = $("#connection-label");

    if (label) {
      const statusObserver = new MutationObserver(updateConnectionLed);

      statusObserver.observe(label, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    const sourceDot = $(".connection i");

    if (sourceDot) {
      const dotObserver = new MutationObserver(updateConnectionLed);

      dotObserver.observe(sourceDot, {
        attributes: true,
        attributeFilter: ["style", "class"]
      });
    }

    console.info(
      `[MIRAGE] 2.9.1 initialized: ${mode.toUpperCase()}`
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

})();
