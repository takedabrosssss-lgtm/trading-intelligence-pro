/* MIRAGE runtime hotfix 2026-11-13.
 * Fixes the pagechange event target mismatch and forces readable mode-aware text.
 * Read-only UI code only: no scanner, strategy, risk, or Paper Trading changes.
 */
(() => {
  "use strict";
  if (window.__MIRAGE_RUNTIME_HOTFIX_20261113__) return;
  window.__MIRAGE_RUNTIME_HOTFIX_20261113__ = true;

  const EVENT_NAME = "mirage:pagechange";
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const money = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-US", {
      style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2
    }) : "—";
  };

  // app.js dispatches pagechange on document, while mobile-first and Quick Find
  // subscribe on window. Forward the event so both subscribers receive it.
  document.addEventListener(EVENT_NAME, event => {
    const detail = event && event.detail ? event.detail : {};
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { ...detail, forwardedFromDocument: true } }));
    if (detail.page === "markets") {
      window.setTimeout(() => fallbackAnalytics(false), 1400);
    }
  });

  const css = `
    /* The mobile-first stylesheet currently leaves its dark palette on :root
       even when the app is in STEALTH MODE. Reset the complete token set. */
    body[data-mirage-mode="stealth"] {
      --mf-bg: #f4f7f8 !important;
      --mf-panel: #ffffff !important;
      --mf-panel-2: #f7f9fa !important;
      --mf-line: #e3e9ec !important;
      --mf-text: #23313a !important;
      --mf-muted: #60717b !important;
      --mf-accent: #2e8278 !important;
      --mf-accent-2: #236e65 !important;
      --mf-negative: #c84d5a !important;
    }

    /* STEALTH MODE: readable dark text on the light surface. */
    body[data-mirage-mode="stealth"] .mirage41-nav {
      background: rgba(255,255,255,.98) !important;
      color: #26343b !important;
      border-color: #dce5e8 !important;
      box-shadow: 0 8px 24px rgba(25,48,57,.08) !important;
    }
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-nav-title,
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-nav-title b,
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-link,
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-result,
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-result b {
      color: #26343b !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-link {
      background: #f4f8f7 !important;
      border-color: #dce8e4 !important;
    }
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-link-index,
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-dot {
      color: #187b5b !important;
    }
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-search-wrap {
      background: #f4f7f8 !important;
      border-color: #dce5e8 !important;
      color: #53636b !important;
    }
    body[data-mirage-mode="stealth"] .mirage41-nav input,
    body[data-mirage-mode="stealth"] .mirage41-nav input::placeholder,
    body[data-mirage-mode="stealth"] .mirage41-nav kbd,
    body[data-mirage-mode="stealth"] .mirage41-nav small,
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-empty,
    body[data-mirage-mode="stealth"] .mirage41-nav .mirage41-result small {
      color: #52636b !important;
      opacity: 1 !important;
    }

    body[data-mirage-mode="stealth"] .mi-panel {
      color: #26343b !important;
      background: #ffffff !important;
      background-image: none !important;
      border-color: #dfe7ea !important;
    }
    body[data-mirage-mode="stealth"] .mi-panel h2,
    body[data-mirage-mode="stealth"] .mi-panel h3,
    body[data-mirage-mode="stealth"] .mi-panel b,
    body[data-mirage-mode="stealth"] .mi-panel strong {
      color: #26343b !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="stealth"] .mi-panel span,
    body[data-mirage-mode="stealth"] .mi-panel small,
    body[data-mirage-mode="stealth"] .mi-panel p,
    body[data-mirage-mode="stealth"] .mi-panel label,
    body[data-mirage-mode="stealth"] .mi-panel td,
    body[data-mirage-mode="stealth"] .mi-panel .mi-sub,
    body[data-mirage-mode="stealth"] .mi-panel .mi-foot,
    body[data-mirage-mode="stealth"] .mi-panel .mi-result,
    body[data-mirage-mode="stealth"] .mi-panel .mi-status-line {
      color: #52636b !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="stealth"] .mi-panel .mi-stat,
    body[data-mirage-mode="stealth"] .mi-panel .mi-folds,
    body[data-mirage-mode="stealth"] .mi-panel .mi-table-wrap {
      background: #f6f8f9 !important;
      border-color: #e1e8eb !important;
    }

    body[data-mirage-mode="stealth"] .m4-panel {
      color: #26343b !important;
      background: #ffffff !important;
      background-image: none !important;
      border-color: #dfe7ea !important;
      box-shadow: 0 8px 24px rgba(25,48,57,.07) !important;
    }
    body[data-mirage-mode="stealth"] .m4-panel .m4-head h3,
    body[data-mirage-mode="stealth"] .m4-panel .m4-metric b,
    body[data-mirage-mode="stealth"] .m4-panel .m4-row b,
    body[data-mirage-mode="stealth"] .m4-panel .m4-score-ring b {
      color: #26343b !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="stealth"] .m4-panel .m4-muted,
    body[data-mirage-mode="stealth"] .m4-panel .m4-metric span,
    body[data-mirage-mode="stealth"] .m4-panel .m4-row span,
    body[data-mirage-mode="stealth"] .m4-panel .m4-score-note,
    body[data-mirage-mode="stealth"] .m4-panel small {
      color: #52636b !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="stealth"] .m4-panel .m4-kicker { color: #247765 !important; }
    body[data-mirage-mode="stealth"] .m4-panel .m4-metric,
    body[data-mirage-mode="stealth"] .m4-panel .m4-row {
      background: #f6f8f9 !important;
      border-color: #e1e8eb !important;
    }
    body[data-mirage-mode="stealth"] .m4-panel .m4-status { color: #236e65 !important; }
    body[data-mirage-mode="stealth"] .m4-panel .m4-status.bad { color: #a93e4a !important; }
    body[data-mirage-mode="stealth"] .m4-panel .m4-score-ring:before { background: #eef4f2 !important; }

    body[data-mirage-mode="stealth"] .mobile-analytics-overview,
    body[data-mirage-mode="stealth"] .mobile-return-card,
    body[data-mirage-mode="stealth"] .mobile-analytics-stat,
    body[data-mirage-mode="stealth"] .mobile-allocation,
    body[data-mirage-mode="stealth"] .mobile-allocation-row {
      color: #26343b !important;
    }
    body[data-mirage-mode="stealth"] .mobile-return-card span,
    body[data-mirage-mode="stealth"] .mobile-return-card small,
    body[data-mirage-mode="stealth"] .mobile-analytics-stat small,
    body[data-mirage-mode="stealth"] .mobile-allocation-row small,
    body[data-mirage-mode="stealth"] .mobile-empty-state {
      color: #52636b !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="stealth"] .mobile-return-card b,
    body[data-mirage-mode="stealth"] .mobile-analytics-stat b,
    body[data-mirage-mode="stealth"] .mobile-allocation-row b,
    body[data-mirage-mode="stealth"] .mobile-allocation-row strong {
      color: #26343b !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="stealth"] .mobile-return-card,
    body[data-mirage-mode="stealth"] .mobile-analytics-stat,
    body[data-mirage-mode="stealth"] .mobile-allocation-list {
      background: #ffffff !important;
      border-color: #dfe7ea !important;
    }
    body[data-mirage-mode="stealth"] .mobile-allocation-row {
      background: #f6f8f9 !important;
      border-color: #e1e8eb !important;
    }

    /* SPECTRE MODE: the same hierarchy on dark surfaces. */
    body[data-mirage-mode="spectre"] .mirage41-nav {
      background: rgba(10,14,20,.98) !important;
      color: #edf2f4 !important;
      border-color: #29343d !important;
    }
    body[data-mirage-mode="spectre"] .mirage41-nav .mirage41-link,
    body[data-mirage-mode="spectre"] .mirage41-nav .mirage41-result,
    body[data-mirage-mode="spectre"] .mirage41-nav .mirage41-nav-title,
    body[data-mirage-mode="spectre"] .mirage41-nav .mirage41-nav-title b {
      color: #e7edf0 !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="spectre"] .mirage41-nav .mirage41-link {
      background: #141c23 !important;
      border-color: #29343d !important;
    }
    body[data-mirage-mode="spectre"] .mirage41-nav input,
    body[data-mirage-mode="spectre"] .mirage41-nav input::placeholder,
    body[data-mirage-mode="spectre"] .mirage41-nav kbd,
    body[data-mirage-mode="spectre"] .mirage41-nav small,
    body[data-mirage-mode="spectre"] .mirage41-nav .mirage41-empty,
    body[data-mirage-mode="spectre"] .mirage41-nav .mirage41-result small {
      color: #a6b3bb !important;
      opacity: 1 !important;
    }
    body[data-mirage-mode="spectre"] .mi-panel {
      color: #e7edf0 !important;
      background: #10161b !important;
      background-image: none !important;
      border-color: #29343d !important;
    }
    body[data-mirage-mode="spectre"] .mi-panel h2,
    body[data-mirage-mode="spectre"] .mi-panel h3,
    body[data-mirage-mode="spectre"] .mi-panel b,
    body[data-mirage-mode="spectre"] .mi-panel strong { color: #edf2f4 !important; opacity: 1 !important; }
    body[data-mirage-mode="spectre"] .mi-panel span,
    body[data-mirage-mode="spectre"] .mi-panel small,
    body[data-mirage-mode="spectre"] .mi-panel p,
    body[data-mirage-mode="spectre"] .mi-panel label,
    body[data-mirage-mode="spectre"] .mi-panel td,
    body[data-mirage-mode="spectre"] .mi-panel .mi-sub,
    body[data-mirage-mode="spectre"] .mi-panel .mi-foot,
    body[data-mirage-mode="spectre"] .mi-panel .mi-result,
    body[data-mirage-mode="spectre"] .mi-panel .mi-status-line { color: #a6b3bb !important; opacity: 1 !important; }

    body[data-mirage-mode="spectre"] .m4-panel {
      color: #e7edf0 !important;
      background: #10161b !important;
      background-image: none !important;
      border-color: #29343d !important;
    }
    body[data-mirage-mode="spectre"] .m4-panel .m4-head h3,
    body[data-mirage-mode="spectre"] .m4-panel .m4-metric b,
    body[data-mirage-mode="spectre"] .m4-panel .m4-row b,
    body[data-mirage-mode="spectre"] .m4-panel .m4-score-ring b { color: #edf2f4 !important; opacity: 1 !important; }
    body[data-mirage-mode="spectre"] .m4-panel .m4-muted,
    body[data-mirage-mode="spectre"] .m4-panel .m4-metric span,
    body[data-mirage-mode="spectre"] .m4-panel .m4-row span,
    body[data-mirage-mode="spectre"] .m4-panel small { color: #a6b3bb !important; opacity: 1 !important; }
    body[data-mirage-mode="spectre"] .m4-panel .m4-kicker { color: #bdaaf2 !important; }
    body[data-mirage-mode="spectre"] .m4-panel .m4-metric,
    body[data-mirage-mode="spectre"] .m4-panel .m4-row { background: #0b1014 !important; border-color: #26323a !important; }
    body[data-mirage-mode="spectre"] .m4-panel .m4-status { color: #78d9ae !important; }
    body[data-mirage-mode="spectre"] .m4-panel .m4-status.bad { color: #ff9aa3 !important; }
    body[data-mirage-mode="spectre"] .m4-panel .m4-score-ring:before { background: #10161b !important; }
    body[data-mirage-mode="spectre"] .mobile-return-card span,
    body[data-mirage-mode="spectre"] .mobile-return-card small,
    body[data-mirage-mode="spectre"] .mobile-analytics-stat small,
    body[data-mirage-mode="spectre"] .mobile-allocation-row small,
    body[data-mirage-mode="spectre"] .mobile-empty-state { color: #a6b3bb !important; opacity: 1 !important; }
    body[data-mirage-mode="spectre"] .mobile-return-card b,
    body[data-mirage-mode="spectre"] .mobile-analytics-stat b,
    body[data-mirage-mode="spectre"] .mobile-allocation-row b,
    body[data-mirage-mode="spectre"] .mobile-allocation-row strong { color: #edf2f4 !important; opacity: 1 !important; }
  `;
  const style = document.createElement("style");
  style.id = "mirage-runtime-hotfix-styles";
  style.textContent = css;
  document.head.appendChild(style);

  let fallbackBusy = false;
  let lastFallbackAt = 0;
  function authHeaders() {
    const headers = { Accept: "application/json" };
    const initData = window.Telegram?.WebApp?.initData || "";
    if (initData) headers["X-Telegram-Init-Data"] = initData;
    return headers;
  }
  async function getJSON(path, timeout = 12000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(path, { headers: authHeaders(), cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
      return data;
    } finally {
      window.clearTimeout(timer);
    }
  }

  // Fallback only runs if the original analytics loader never changed its
  // initial placeholder. This avoids duplicate requests when the normal loader works.
  async function fallbackAnalytics(force) {
    const page = $("#markets");
    const host = $("#analytics-allocation");
    if (!page || !host || !page.classList.contains("active")) return;
    const stillInitial = /Загружаем статистику счетов/i.test(host.textContent || "");
    if (!force && !stillInitial) return;
    if (fallbackBusy || Date.now() - lastFallbackAt < 2500) return;

    fallbackBusy = true;
    lastFallbackAt = Date.now();
    host.innerHTML = '<div class="mobile-empty-state">Загружаем данные портфеля…</div>';
    try {
      const [portfolioResult, commandResult] = await Promise.allSettled([
        getJSON("/api/portfolio"),
        getJSON("/api/mirage/command-center")
      ]);
      if (portfolioResult.status !== "fulfilled") throw portfolioResult.reason;
      const portfolio = portfolioResult.value;
      if (!portfolio || typeof portfolio !== "object") throw new Error("Сервер вернул пустой портфель");

      const initial = Number(portfolio.initial_capital || 0);
      const pnl = Number(portfolio.total_pnl || 0);
      const equity = Number(portfolio.equity || 0);
      const ret = initial > 0 ? pnl / initial * 100 : 0;
      const returnNode = $("#analytics-return");
      const pnlNode = $("#analytics-net-pnl");
      if (returnNode) {
        returnNode.textContent = `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`;
        returnNode.className = ret >= 0 ? "positive" : "negative";
      }
      if (pnlNode) pnlNode.textContent = `Общий P&L: ${pnl >= 0 ? "+" : ""}${money(pnl)} · Equity ${money(equity)}`;

      const accounts = Array.isArray(portfolio.accounts) ? portfolio.accounts : [];
      const total = accounts.reduce((sum, account) => sum + Math.max(0, Number(account.equity || 0)), 0);
      host.innerHTML = accounts.length ? accounts.map(account => {
        const value = Number(account.equity || 0);
        const share = total > 0 ? Math.max(0, value) / total * 100 : 0;
        const accountPnl = Number(account.total_pnl || 0);
        return `<div class="mobile-allocation-row"><div class="mobile-allocation-head"><b>${esc(account.name || account.strategy || "Paper account")}</b><strong>${money(value)}</strong></div><div class="mobile-allocation-track"><i style="width:${Math.max(0, Math.min(100, share)).toFixed(1)}%"></i></div><small>${share.toFixed(1)}% капитала · ${Number(account.open_positions || 0)} позиций · P&L ${accountPnl >= 0 ? "+" : ""}${money(accountPnl)}</small></div>`;
      }).join("") : '<div class="mobile-empty-state">API портфеля ответил, но счета для этого Telegram-аккаунта не найдены.</div>';

      const stats = $("#analytics-statistics");
      if (stats) {
        const command = commandResult.status === "fulfilled" ? commandResult.value : null;
        const t = command?.trading || {};
        const p = command?.portfolio || {};
        stats.innerHTML = [
          ["Закрытые сделки", command ? Number(t.closed_trades || 0).toLocaleString("ru-RU") : "Нет данных"],
          ["Win Rate", t.win_rate_pct == null ? "—" : `${Number(t.win_rate_pct).toFixed(1)}%`],
          ["Просадка", p.current_drawdown_pct == null ? "—" : `${Number(p.current_drawdown_pct).toFixed(2)}%`]
        ].map(([label, value]) => `<div class="mobile-analytics-stat"><small>${esc(label)}</small><b>${esc(value)}</b></div>`).join("");
      }
      console.info("MIRAGE analytics fallback rendered", { accounts: accounts.length, commandCenter: commandResult.status });
    } catch (error) {
      host.innerHTML = `<div class="mobile-empty-state">Не удалось загрузить аналитику: ${esc(error?.message || "ошибка запроса")}<button type="button" id="mirage-analytics-retry" class="mobile-retry-button">Повторить загрузку</button></div>`;
    } finally {
      fallbackBusy = false;
    }
  }

  document.addEventListener("click", event => {
    if (event.target.closest("#mirage-analytics-retry")) fallbackAnalytics(true);
  });

  // First-visit guard: if Analytics is already the active page, initialise it.
  const boot = () => {
    const active = $("main .page.active");
    if (active?.id === "markets") {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { page: "markets", source: "runtime-hotfix-boot" } }));
      window.setTimeout(() => fallbackAnalytics(false), 1400);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(boot, 0), { once: true });
  } else {
    window.setTimeout(boot, 0);
  }

  console.info("MIRAGE runtime hotfix loaded: page events bridged; contrast enforced.");
})();
