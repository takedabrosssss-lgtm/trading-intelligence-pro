
(() => {
  "use strict";
  if (window.__TI_OBSIDIAN_FIX_V2__) return;
  window.__TI_OBSIDIAN_FIX_V2__ = true;

  const css = `
    :root {
      --ti-font: "DM Sans", -apple-system, BlinkMacSystemFont,
        "Segoe UI", sans-serif;
    }

    html, body {
      width: 100%;
      max-width: 100%;
      overflow-x: clip !important;
      font-family: var(--ti-font) !important;
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }

    body, button, input, select, textarea {
      font-family: var(--ti-font) !important;
    }

    .app-shell {
      width: 100% !important;
      max-width: 1120px !important;
      min-width: 0 !important;
      margin-inline: auto !important;
      overflow-x: clip !important;
    }

    main, .page, .page-intro, .hero-card,
    .market-row, .strategy-card, .position-card,
    .history-row {
      min-width: 0 !important;
      max-width: 100% !important;
    }

    h1, h2, h3, p, small, b, strong, span, label {
      overflow-wrap: anywhere;
    }

    h1 {
      font-size: clamp(23px, 6vw, 32px) !important;
      line-height: 1.16 !important;
    }

    .hero-balance {
      font-size: clamp(29px, 8vw, 46px) !important;
      line-height: 1.08 !important;
      letter-spacing: -1.2px !important;
      overflow-wrap: normal !important;
      word-break: keep-all !important;
    }

    .brand {
      min-width: 0 !important;
    }

    .brand-mark {
      flex: 0 0 43px !important;
      width: 43px !important;
      height: 43px !important;
      padding: 0 !important;
      overflow: hidden !important;
      border-radius: 13px !important;
    }

    .brand-mark img {
      display: block !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    .brand-copy {
      min-width: 0 !important;
    }

    .brand-copy b {
      font-size: clamp(8px, 2.5vw, 12px) !important;
      letter-spacing: 1.8px !important;
      white-space: nowrap !important;
    }

    .brand-copy small {
      font-size: 7px !important;
      letter-spacing: 1px !important;
      white-space: nowrap !important;
    }

    .bottom-nav {
      position: fixed !important;
      left: 50% !important;
      right: auto !important;
      bottom: max(10px, env(safe-area-inset-bottom)) !important;
      transform: translateX(-50%) !important;
      width: calc(100% - 24px) !important;
      max-width: 560px !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
      display: grid !important;
      grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
      align-items: stretch !important;
      justify-content: stretch !important;
      gap: 4px !important;
      padding: 7px !important;
      margin: 0 !important;
      direction: ltr !important;
      z-index: 1000 !important;
    }

    .bottom-nav .nav-item {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 7px 1px 6px !important;
      display: flex !important;
      flex: initial !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 5px !important;
      text-align: center !important;
      white-space: nowrap !important;
      box-sizing: border-box !important;
    }

    .bottom-nav .nav-item span {
      width: 27px !important;
      height: 27px !important;
      flex: 0 0 27px !important;
      display: grid !important;
      place-items: center !important;
      overflow: visible !important;
    }

    .bottom-nav .nav-item span svg {
      display: block !important;
      width: 23px !important;
      height: 23px !important;
      stroke: currentColor !important;
      stroke-width: 2 !important;
      stroke-linecap: round !important;
      stroke-linejoin: round !important;
      fill: none !important;
    }

    .bottom-nav .nav-item small {
      display: block !important;
      max-width: 100% !important;
      font-size: clamp(7px, 2.1vw, 9px) !important;
      line-height: 1.1 !important;
      letter-spacing: 0 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
    }

    @media (max-width: 380px) {
      .topbar {
        padding-inline: 12px !important;
      }

      .brand {
        gap: 8px !important;
      }

      .brand-mark {
        flex-basis: 39px !important;
        width: 39px !important;
        height: 39px !important;
      }

      .brand-copy b {
        font-size: 8px !important;
      }

      .bottom-nav {
        width: calc(100% - 16px) !important;
        gap: 2px !important;
        padding: 6px 4px !important;
      }

      .bottom-nav .nav-item {
        padding-inline: 0 !important;
      }
    }
  `;

  const style = document.createElement("style");
  style.id = "ti-obsidian-fix-v2-style";
  style.textContent = css;
  document.head.appendChild(style);
})();
