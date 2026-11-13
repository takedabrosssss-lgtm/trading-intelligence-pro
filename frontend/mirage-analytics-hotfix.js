/* MIRAGE Analytics UI hotfix — presentation/data bootstrap only.
   Does not call trading, scanner, signal-generation, or Paper Trading functions. */
(() => {
  "use strict";
  if (window.__MIRAGE_ANALYTICS_UI_HOTFIX__) return;
  window.__MIRAGE_ANALYTICS_UI_HOTFIX__ = true;

  const style = document.createElement("style");
  style.id = "mirage-analytics-ui-hotfix-css";
  style.textContent = `
    /* STEALTH: the Intelligence panel was designed with dark-panel muted
       colors, while the current release renders its cards on light surfaces. */
    body[data-mirage-mode="stealth"] .mi-panel {
      color: #26343b !important;
      background: #ffffff !important;
      border-color: #e1e8eb !important;
    }
    body[data-mirage-mode="stealth"] .mi-panel h3,
    body[data-mirage-mode="stealth"] .mi-panel .mi-stat b,
    body[data-mirage-mode="stealth"] .mi-panel .mi-result-head b,
    body[data-mirage-mode="stealth"] .mi-panel .mi-folds b {
      color: #26343b !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="stealth"] .mi-panel .mi-stat small,
    body[data-mirage-mode="stealth"] .mi-panel .mi-sub,
    body[data-mirage-mode="stealth"] .mi-panel .mi-foot,
    body[data-mirage-mode="stealth"] .mi-panel .mi-result,
    body[data-mirage-mode="stealth"] .mi-panel .mi-status-line,
    body[data-mirage-mode="stealth"] .mi-panel .mi-result-head span,
    body[data-mirage-mode="stealth"] .mi-panel .mi-folds div,
    body[data-mirage-mode="stealth"] .mi-panel .mi-table th {
      color: #687780 !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="stealth"] .mi-panel .mi-stat,
    body[data-mirage-mode="stealth"] .mi-panel .mi-folds,
    body[data-mirage-mode="stealth"] .mi-panel .mi-table-wrap {
      background: #f7f9fa !important;
      border-color: #e2e9ec !important;
    }
    body[data-mirage-mode="stealth"] .mi-panel .mi-table td {
      color: #34444c !important;
    }

    /* Keep the same readable contrast in other light-mode intelligence cards. */
    body[data-mirage-mode="stealth"] .m4-panel small,
    body[data-mirage-mode="stealth"] .m4-panel .m4-muted {
      color: #687780 !important;
      opacity: 1 !important;
    }

    /* SPECTRE retains its dark visual language, but muted labels remain legible. */
    body[data-mirage-mode="spectre"] .mi-panel .mi-stat small,
    body[data-mirage-mode="spectre"] .mi-panel .mi-sub,
    body[data-mirage-mode="spectre"] .mi-panel .mi-foot,
    body[data-mirage-mode="spectre"] .mi-panel .mi-result,
    body[data-mirage-mode="spectre"] .mi-panel .mi-status-line,
    body[data-mirage-mode="spectre"] .mi-panel .mi-folds div,
    body[data-mirage-mode="spectre"] .m4-panel small,
    body[data-mirage-mode="spectre"] .m4-panel .m4-muted {
      color: #a69bbd !important;
      opacity: 1 !important;
    }
  `;
  document.head.appendChild(style);

  function bootstrapAnalytics() {
    const analyticsPage = document.getElementById("markets");
    if (!analyticsPage || !analyticsPage.classList.contains("active")) return;

    // The mobile-first module registers this event listener during startup.
    // Re-dispatching the normal page-change event runs its existing read-only
    // analytics loader; it does not trigger market scanning or trade execution.
    window.dispatchEvent(new CustomEvent("mirage:pagechange", {
      detail: { page: "markets", source: "initial-page-bootstrap" }
    }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.setTimeout(bootstrapAnalytics, 0);
    }, { once: true });
  } else {
    window.setTimeout(bootstrapAnalytics, 0);
  }

  console.info("MIRAGE analytics UI hotfix initialized");
})();
