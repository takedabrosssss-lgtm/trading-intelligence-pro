
(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || "";
  const API = "/api";

  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#090b10");
    tg.setBackgroundColor("#090b10");
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const symbols = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT",
    "SOLUSDT", "XRPUSDT", "ADAUSDT"
  ];

  const state = {
    portfolio: null,
    prices: {},
    lastUpdate: null
  };

  function notify(message) {
    const box = $("#notifications");
    if (!box) {
      alert(message);
      return;
    }

    box.textContent = message;
    box.classList.add("show");

    clearTimeout(notify.timer);
    notify.timer = setTimeout(
      () => box.classList.remove("show"),
      3000
    );
  }

  function money(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";

    return number.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    });
  }

  function number(value, digits = 2) {
    const n = Number(value);
    return Number.isFinite(n)
      ? n.toLocaleString("en-US", {
          maximumFractionDigits: digits
        })
      : "—";
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  async function api(path) {
    const headers = {
      "Accept": "application/json"
    };

    if (initData) {
      headers["X-Telegram-Init-Data"] = initData;
    }

    const response = await fetch(API + path, {
      method: "GET",
      headers,
      cache: "no-store"
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `API ${response.status}: ${message.slice(0, 180)}`
      );
    }

    return response.json();
  }

  function navigate(page) {
    const target = $("#" + page);
    if (!target) return;

    $$(".page").forEach(element =>
      element.classList.toggle("active", element === target)
    );

    $$(".nav-item").forEach(element =>
      element.classList.toggle(
        "active",
        element.dataset.page === page
      )
    );

    if (page === "portfolio") loadPortfolio();
    if (page === "history") loadHistory();
    if (page === "markets") loadMarkets();
    if (page === "signals") loadSignals();
  }

  function updateTime() {
    const clock = $("#clock");
    const updated = $("#updated");

    const now = new Date();

    if (clock) {
      clock.textContent = now.toLocaleTimeString();
    }

    if (updated) {
      updated.textContent = now.toLocaleTimeString();
    }
  }

  function renderPortfolio(data) {
    state.portfolio = data;

    const balance = money(data.balance);
    const pnl = Number(data.total_pnl || 0);
    const pnlClass = pnl >= 0 ? "positive" : "negative";

    $$(".balance-value").forEach(el => {
      el.textContent = balance;
    });

    $$(".portfolio-change").forEach(el => {
      el.textContent = `${pnl >= 0 ? "+" : ""}${money(pnl)}`;
      el.classList.remove("positive", "negative");
      el.classList.add(pnlClass);
    });

    const stats = $(".portfolio-stats");

    if (stats) {
      stats.innerHTML = `
        <div class="metric">
          <span>Начальный капитал</span>
          <strong>${money(data.initial_capital)}</strong>
        </div>
        <div class="metric">
          <span>Баланс</span>
          <strong>${balance}</strong>
        </div>
        <div class="metric">
          <span>Equity</span>
          <strong>${money(data.equity)}</strong>
        </div>
        <div class="metric">
          <span>Общий PnL</span>
          <strong class="${pnlClass}">
            ${pnl >= 0 ? "+" : ""}${money(pnl)}
          </strong>
        </div>
      `;
    }

    const strategyList = $(".strategy-list");

    if (strategyList) {
      strategyList.innerHTML = (data.accounts || []).map(account => `
        <div class="card">
          <div class="card-header">
            <strong>${escapeHTML(account.name)}</strong>
            <span>${escapeHTML(account.strategy)}</span>
          </div>
          <div class="metric">
            <span>Баланс</span>
            <strong>${money(account.balance)}</strong>
          </div>
          <div class="metric">
            <span>Equity</span>
            <strong>${money(account.equity)}</strong>
          </div>
          <div class="metric">
            <span>Открытые позиции</span>
            <strong>${number(account.open_positions, 0)}</strong>
          </div>
        </div>
      `).join("") || "<p>Счета пока не созданы.</p>";
    }
  }

  function renderMarkets() {
    const containers = [
      $(".market-grid"),
      $("#markets .market-list")
    ].filter(Boolean);

    if (!containers.length) return;

    const html = Object.values(state.prices).map(item => {
      const price = Number(item.lastPrice);
      const change = Number(item.priceChangePercent);
      const positive = change >= 0;

      return `
        <div class="market-card card">
          <div class="card-header">
            <strong>${escapeHTML(item.symbol)}</strong>
            <span class="${positive ? "positive" : "negative"}">
              ${positive ? "+" : ""}${number(change)}%
            </span>
          </div>
          <div class="market-price">${money(price)}</div>
          <div class="metric">
            <span>Объём за 24ч</span>
            <strong>${number(item.quoteVolume, 0)} USDT</strong>
          </div>
        </div>
      `;
    }).join("");

    containers.forEach(container => {
      container.innerHTML = html ||
        "<p>Рыночные данные пока недоступны.</p>";
    });
  }

  async function loadMarkets() {
    const results = await Promise.allSettled(
      symbols.map(symbol =>
        api(`/market/price/${symbol}`)
      )
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        state.prices[symbols[index]] = result.value;
      }
    });

    renderMarkets();
  }

  async function loadPortfolio() {
    try {
      const data = await api("/portfolio");
      renderPortfolio(data);
    } catch (error) {
      notify("Не удалось загрузить портфель: " + error.message);
    }
  }

  async function loadHistory() {
    const container = $("#history-list") ||
      $("#history .empty-state");

    if (!container) return;

    try {
      const data = await api("/history?limit=50");
      const trades = data.trades || [];

      container.innerHTML = trades.length
        ? trades.map(trade => `
          <div class="card">
            <div class="card-header">
              <strong>${escapeHTML(trade.symbol)}</strong>
              <span class="${Number(trade.net_pnl) >= 0 ? "positive" : "negative"}">
                ${money(trade.net_pnl)}
              </span>
            </div>
            <div class="metric">
              <span>Направление</span>
              <strong>${escapeHTML(trade.direction)}</strong>
            </div>
            <div class="metric">
              <span>Стратегия</span>
              <strong>${escapeHTML(trade.strategy)}</strong>
            </div>
            <div class="metric">
              <span>Причина закрытия</span>
              <strong>${escapeHTML(trade.exit_reason)}</strong>
            </div>
          </div>
        `).join("")
        : "<p>Закрытых сделок пока нет.</p>";

    } catch (error) {
      container.textContent =
        "История временно недоступна: " + error.message;
    }
  }

  async function analyzeSymbol(symbol, interval = "1h") {
    const container = $("#signals .signal-results") ||
      $("#signals .empty-state") ||
      $("#signals");

    if (!container) return;

    container.innerHTML = "<p>Выполняется технический анализ...</p>";

    try {
      const result = await api(
        `/analysis/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`
      );

      const direction = result.direction ||
        result.signal ||
        result.action ||
        "NEUTRAL";

      const score = result.score ?? result.confluence_score;
      const grade = result.grade || "—";
      const entry = result.entry ?? result.entry_price;
      const stop = result.stop_loss ?? result.sl;
      const target = result.take_profit_1 ?? result.tp1;

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <strong>${escapeHTML(symbol)} · ${escapeHTML(interval)}</strong>
            <span>${escapeHTML(grade)}</span>
          </div>
          <h3>${escapeHTML(direction)}</h3>
          <div class="metric">
            <span>Оценка confluence</span>
            <strong>${score == null ? "—" : number(score, 0)}</strong>
          </div>
          <div class="metric">
            <span>Вход</span>
            <strong>${money(entry)}</strong>
          </div>
          <div class="metric">
            <span>Stop Loss</span>
            <strong>${money(stop)}</strong>
          </div>
          <div class="metric">
            <span>Take Profit</span>
            <strong>${money(target)}</strong>
          </div>
          <p>Это аналитическая оценка, а не гарантия результата.</p>
        </div>
      `;

    } catch (error) {
      container.textContent =
        "Анализ не выполнен: " + error.message;
    }
  }

  async function loadSignals() {
    const container = $("#signals .signal-results") ||
      $("#signals .empty-state");

    if (!container) return;

    container.innerHTML = `
      <div class="card">
        <strong>Ручной технический анализ</strong>
        <p>Выбери актив для анализа.</p>
        <div class="signal-actions">
          ${symbols.map(symbol => `
            <button class="nav-item" data-ti-analyze="${symbol}">
              ${symbol}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  async function loadStatus() {
    try {
      const data = await api("/status");
      const status = $(".connection-status");

      if (status) {
        status.textContent = data.status || "Подключено";
      }
    } catch (error) {
      console.warn("Status:", error.message);
    }
  }

  async function initialize() {
    updateTime();
    setInterval(updateTime, 1000);

    if (!initData) {
      notify("Открой Mini App через Telegram для авторизации.");
      return;
    }

    await loadStatus();

    const results = await Promise.allSettled([
      loadPortfolio(),
      loadMarkets()
    ]);

    state.lastUpdate = new Date();

    console.log("Trading Intelligence PRO initialized", results);
  }

  document.addEventListener("click", event => {
    const nav = event.target.closest(".nav-item[data-page]");

    if (nav) {
      navigate(nav.dataset.page);
      return;
    }

    const analyze = event.target.closest("[data-ti-analyze]");

    if (analyze) {
      analyzeSymbol(analyze.dataset.tiAnalyze);
    }

    const openPage = event.target.closest("[data-open-page]");

    if (openPage) {
      navigate(openPage.dataset.openPage);
    }
  });

  window.TradingIntelligence = {
    openPage: navigate,
    notify,
    analyze: analyzeSymbol,
    refresh: initialize,
    telegram: tg
  };

  initialize();
})();
  
