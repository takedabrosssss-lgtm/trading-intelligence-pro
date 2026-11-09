
/* MIRAGE — application controller */
(() => {
  "use strict";
  if (window.__MIRAGE_APP__) return;
  window.__MIRAGE_APP__ = true;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT",
    "SOLUSDT", "XRPUSDT", "ADAUSDT",
    "DOGEUSDT", "AVAXUSDT"
  ];

  const state = {
    symbol: "BTCUSDT",
    interval: "1h",
    chart: null,
    candleSeries: null,
    portfolio: null,
    loading: false,
    analysisLoading: false
  };

  const money = value => {
    const n = Number(value || 0);
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const number = (value, digits = 2) =>
    Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });

  const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[ch]);

  const coin = symbol => String(symbol || "")
    .replace(/USDT|USD/g, "")
    .toUpperCase();

  function authHeaders() {
    const headers = { Accept: "application/json" };
    const initData = window.Telegram?.WebApp?.initData || "";
    if (initData) headers["X-Telegram-Init-Data"] = initData;
    return headers;
  }

  async function api(path, timeout = 18000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(path, {
        method: "GET",
        headers: authHeaders(),
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        const message = response.status === 401
          ? "Открой MIRAGE через Telegram, чтобы авторизоваться"
          : response.status === 403
            ? "Нет доступа к этому аккаунту"
            : `Ошибка сервера: ${response.status}`;

        throw new Error(message);
      }

      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Сервер не ответил вовремя. Попробуй обновить данные.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function toast(message) {
    const node = $("#toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 3200);
  }

  function setConnection(online, message) {
    const label = $("#connection-label");
    const dot = $(".connection i");
    if (label) label.textContent = message || (online ? "СИСТЕМА ОНЛАЙН" : "НЕТ СВЯЗИ");
    if (dot) {
      dot.style.background = online ? "#35e59b" : "#ff5968";
      dot.style.boxShadow = online
        ? "0 0 9px rgba(53,229,155,.7)"
        : "0 0 9px rgba(255,89,104,.7)";
    }
  }

  function showError(host, message) {
    if (!host) return;
    host.innerHTML = `<div class="loading-state">${safe(message)}</div>`;
  }

  function coinLogo(symbol) {
    const id = coin(symbol).toLowerCase();
    const known = ["btc", "eth", "bnb", "sol", "xrp", "ada", "doge", "avax"];
    if (!known.includes(id)) return "";
    return `https://assets.coincap.io/assets/icons/${id}@2x.png`;
  }

  function coinIcon(symbol) {
    const src = coinLogo(symbol);
    return src
      ? `<img class="coin-avatar" src="${src}" alt="${safe(coin(symbol))}" onerror="this.remove()">`
      : `<span class="coin-icon">${safe(coin(symbol).slice(0, 1))}</span>`;
  }

  function renderMarketCard(ticker) {
    const symbol = ticker.symbol;
    const change = Number(ticker.priceChangePercent || 0);
    const positive = change >= 0;

    return `
      <article class="mini-market" data-market-symbol="${safe(symbol)}">
        <div class="coin-line">
          <div class="market-asset">
            ${coinIcon(symbol)}
            <div>
              <div class="coin-name">${safe(coin(symbol))}</div>
              <div class="coin-sub">USDT · Spot</div>
            </div>
          </div>
          <span class="coin-change ${positive ? "positive" : "negative"}">
            ${positive ? "+" : ""}${number(change)}%
          </span>
        </div>
        <div class="coin-price">${money(ticker.lastPrice)}</div>
      </article>`;
  }

  function renderMarketRow(ticker) {
    const symbol = ticker.symbol;
    const change = Number(ticker.priceChangePercent || 0);
    const positive = change >= 0;

    return `
      <button type="button"
        class="market-row ${state.symbol === symbol ? "selected" : ""}"
        data-select-symbol="${safe(symbol)}">
        <div class="market-asset">
          ${coinIcon(symbol)}
          <div>
            <b>${safe(coin(symbol))} / USDT</b>
            <small>${safe(ticker.provider || "Spot market")}</small>
          </div>
        </div>
        <div class="market-quote">
          <b>${money(ticker.lastPrice)}</b>
          <small class="${positive ? "positive" : "negative"}">
            ${positive ? "+" : ""}${number(change)}%
          </small>
        </div>
      </button>`;
  }

  async function loadMarkets() {
    const preview = $("#dashboard-markets");
    const list = $("#markets-list");

    const results = await Promise.allSettled(
      SYMBOLS.map(symbol => api(`/api/market/price/${symbol}`))
    );

    const tickers = results
      .filter(result => result.status === "fulfilled")
      .map(result => result.value);

    if (!tickers.length) {
      const reason = results.find(x => x.status === "rejected")?.reason?.message
        || "Не удалось получить котировки";
      showError(preview, reason);
      showError(list, reason);
      setConnection(false, "РЫНОК НЕДОСТУПЕН");
      return;
    }

    if (preview) {
      preview.innerHTML = tickers.slice(0, 6).map(renderMarketCard).join("");
    }

    if (list) {
      list.innerHTML = tickers.map(renderMarketRow).join("");
    }

    setConnection(true, "СИСТЕМА ОНЛАЙН");
    const dot = $("#market-status-dot");
    if (dot) dot.classList.add("good");
  }

  function destroyChart() {
    if (state.chart) {
      try { state.chart.remove(); } catch (_) {}
    }
    state.chart = null;
    state.candleSeries = null;
  }

  function drawFallbackChart(host, candles) {
    if (!host || !candles.length) return;

    const values = candles.map(c => Number(c.close));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const width = 700;
    const height = 230;
    const pad = 12;

    const points = values.map((value, index) => {
      const x = pad + index * (width - pad * 2) / Math.max(1, values.length - 1);
      const y = height - pad - (value - min) / span * (height - pad * 2);
      return [x, y];
    });

    const path = points.map((p, i) =>
      `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`
    ).join(" ");

    host.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}"
        preserveAspectRatio="none"
        style="width:100%;height:100%;display:block">
        <defs>
          <linearGradient id="mirageChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#35e59b" stop-opacity=".28"/>
            <stop offset="1" stop-color="#35e59b" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${path} L${width-pad},${height} L${pad},${height}Z"
          fill="url(#mirageChartFill)"/>
        <path d="${path}" fill="none" stroke="#35e59b"
          stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
  }

  async function loadChart() {
    const host = $("#price-chart");
    if (!host) return;

    host.innerHTML = '<div class="loading-state">Загружаем свечи…</div>';

    try {
      const candles = await api(
        `/api/market/klines/${state.symbol}?interval=${state.interval}&limit=200`
      );

      if (!Array.isArray(candles) || !candles.length) {
        throw new Error("Сервер не вернул свечи");
      }

      const title = $("#chart-title");
      if (title) title.textContent = `${coin(state.symbol)} / USDT`;

      const updated = $("#chart-updated");
      if (updated) updated.textContent =
        "Обновлено " + new Date().toLocaleTimeString("ru-RU");

      if (!window.LightweightCharts) {
        drawFallbackChart(host, candles);
        return;
      }

      destroyChart();
      host.innerHTML = "";

      state.chart = LightweightCharts.createChart(host, {
        width: host.clientWidth || 600,
        height: host.clientHeight || 245,
        layout: {
          background: { color: "transparent" },
          textColor: "#91a09a",
          fontFamily: "DM Sans, sans-serif"
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,.035)" },
          horzLines: { color: "rgba(255,255,255,.07)" }
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,.10)"
        },
        timeScale: {
          borderColor: "rgba(255,255,255,.10)",
          timeVisible: true,
          secondsVisible: false
        },
        crosshair: {
          vertLine: { color: "rgba(53,229,155,.35)" },
          horzLine: { color: "rgba(53,229,155,.35)" }
        },
        handleScroll: true,
        handleScale: true
      });

      state.candleSeries = state.chart.addCandlestickSeries({
        upColor: "#35e59b",
        downColor: "#ff5968",
        borderUpColor: "#35e59b",
        borderDownColor: "#ff5968",
        wickUpColor: "#35e59b",
        wickDownColor: "#ff5968"
      });

      state.candleSeries.setData(candles.map(c => ({
        time: Math.floor(Number(c.timestamp) / 1000),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close)
      })));

      state.chart.timeScale().fitContent();

      if (window.ResizeObserver) {
        state.chartResizeObserver?.disconnect();
        state.chartResizeObserver = new ResizeObserver(() => {
          if (state.chart && host.clientWidth) {
            state.chart.applyOptions({ width: host.clientWidth });
          }
        });
        state.chartResizeObserver.observe(host);
      }
    } catch (error) {
      showError(host, error.message || "Ошибка загрузки графика");
    }
  }

  function renderAnalysis(result) {
    const host = $("#analysis-result");
    if (!host) return;

    const direction = result.direction || "NEUTRAL";
    const buy = direction === "BUY";
    const sell = direction === "SELL";
    const color = buy ? "positive" : sell ? "negative" : "";
    const label = buy ? "ПОКУПКА" : sell ? "ПРОДАЖА" : "НЕЙТРАЛЬНО";

    const indicators = result.indicators || {};
    const reasons = Array.isArray(result.reasoning) ? result.reasoning : [];

    const metric = (name, value) =>
      `<div><span>${name}</span><b>${value ?? "—"}</b></div>`;

    host.className = "analysis-card";
    host.innerHTML = `
      <div class="analysis-top">
        <span class="paper-tag">${safe(result.symbol)} · ${safe(result.interval)}</span>
        <span class="paper-tag">PAPER ANALYSIS</span>
      </div>
      <div class="analysis-direction ${color}">${label}</div>
      <div class="score-line">
        <b>Оценка ${number(result.score, 1)}/100</b>
        <div class="score-track"><i style="width:${Math.max(0, Math.min(100, Number(result.score || 0)))}%"></i></div>
        <b>${safe(result.grade || "—")}</b>
      </div>
      <div class="analysis-metrics">
        ${metric("Текущая цена", money(result.entry_price))}
        ${metric("Stop Loss", money(result.stop_loss))}
        ${metric("Take Profit", money(result.take_profit))}
      </div>
      <div class="analysis-metrics">
        ${metric("RSI", indicators.rsi == null ? "—" : number(indicators.rsi, 1))}
        ${metric("ATR", indicators.atr == null ? "—" : number(indicators.atr, 5))}
        ${metric("EMA 20", indicators.ema20 == null ? "—" : money(indicators.ema20))}
      </div>
      <h3>Факторы анализа</h3>
      ${reasons.length
        ? `<ul class="reason-list">${reasons.map(x => `<li>${safe(x)}</li>`).join("")}</ul>`
        : '<p class="subtle">Дополнительных факторов нет.</p>'}
      <p class="disclaimer">Это технический анализ, а не гарантия результата. Реальные ордера не размещаются.</p>`;
  }

  async function runAnalysis() {
    if (state.analysisLoading) return;

    const button = $("#run-analysis");
    const host = $("#analysis-result");
    const symbol = $("#signal-symbol")?.value || "BTCUSDT";
    const interval = $("#signal-interval")?.value || "1h";

    state.analysisLoading = true;
    if (button) {
      button.disabled = true;
      button.textContent = "Анализируем…";
    }
    if (host) {
      host.className = "analysis-placeholder";
      host.innerHTML = '<div class="loading-state">Получаем свечи и рассчитываем индикаторы…</div>';
    }

    try {
      const result = await api(
        `/api/analysis/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`
      );
      renderAnalysis(result);
    } catch (error) {
      if (host) {
        host.className = "analysis-placeholder";
        showError(host, error.message || "Не удалось выполнить анализ");
      }
      toast(error.message || "Ошибка анализа");
    } finally {
      state.analysisLoading = false;
      if (button) {
        button.disabled = false;
        button.innerHTML = 'Запустить анализ <span>→</span>';
      }
    }
  }

  function renderPositions(positions) {
    const host = $("#positions-list");
    if (!host) return;

    if (!positions.length) {
      host.innerHTML = '<div class="empty-message">Открытых виртуальных позиций нет</div>';
      return;
    }

    host.innerHTML = positions.map(p => {
      const up = Number(p.unrealized_pnl || 0) >= 0;
      return `
        <article class="position-card">
          <div class="position-head">
            <div>
              <b>${safe(coin(p.symbol))} / USDT</b>
              <small>${safe(p.account || p.strategy || "Paper Trading")} · ${safe(p.opened_at || "")}</small>
            </div>
            <span class="position-direction ${p.direction === "BUY" ? "positive" : "negative"}">
              ${p.direction === "BUY" ? "LONG" : "SHORT"}
            </span>
          </div>
          <div class="position-pnl ${up ? "positive" : "negative"}">
            ${up ? "+" : ""}${money(p.unrealized_pnl)}
            <small>Нереализованный P&amp;L</small>
          </div>
          <div class="position-grid">
            <div><span>Вход</span><b>${money(p.entry_price)}</b></div>
            <div><span>Текущая цена</span><b>${money(p.current_price)}</b></div>
            <div><span>Stop Loss</span><b>${money(p.stop_loss)}</b></div>
            <div><span>Take Profit</span><b>${money(p.take_profit)}</b></div>
            <div><span>Количество</span><b>${number(p.quantity, 6)}</b></div>
          </div>
        </article>`;
    }).join("");
  }

  function renderAccounts(accounts) {
    const host = $("#portfolio-accounts");
    const strategies = $("#strategy-list");
    if (!Array.isArray(accounts)) accounts = [];

    const rows = accounts.map(a => {
      const pnl = Number(a.total_pnl || 0);
      const cls = pnl >= 0 ? "positive" : "negative";
      return `
        <div class="account-row">
          <div>
            <b>${safe(a.name)}</b>
            <small>${safe(a.strategy)} · Позиций: ${Number(a.open_positions || 0)}</small>
          </div>
          <div class="account-values">
            <strong>${money(a.equity)}</strong>
            <small class="${cls}">${pnl >= 0 ? "+" : ""}${money(pnl)}</small>
          </div>
        </div>`;
    });

    if (host) {
      host.innerHTML = rows.length
        ? rows.join("")
        : '<div class="empty-message">Счета пока не созданы</div>';
    }

    if (strategies) {
      strategies.innerHTML = accounts.length
        ? accounts.map(a => `
          <article class="strategy-card">
            <div class="strategy-card-head">
              <h3>${safe(a.name)}</h3><span class="strategy-symbol">◈</span>
            </div>
            <div class="strategy-balance">${money(a.equity)}</div>
            <small>Баланс: ${money(a.balance)}</small>
            <small>Открытых позиций: ${Number(a.open_positions || 0)}</small>
            <small class="${Number(a.total_pnl) >= 0 ? "positive" : "negative"}">
              P&amp;L: ${money(a.total_pnl)}
            </small>
          </article>`).join("")
        : '<div class="empty-message">Нет данных по счетам</div>';
    }
  }

  function renderHistory(trades) {
    const host = $("#history-list");
    if (!host) return;

    if (!trades.length) {
      host.innerHTML = '<div class="empty-message">История сделок пока пуста</div>';
      return;
    }

    host.innerHTML = trades.map(t => {
      const pnl = Number(t.net_pnl || 0);
      const cls = pnl >= 0 ? "positive" : "negative";
      const date = t.closed_at
        ? new Date(t.closed_at).toLocaleString("ru-RU")
        : "Открыта";

      return `
        <div class="history-row">
          <div>
            <b>${safe(coin(t.symbol))} / USDT</b>
            <small>${safe(t.strategy || "Paper")} · ${safe(date)}</small>
          </div>
          <div>
            <strong class="${cls}">${pnl >= 0 ? "+" : ""}${money(pnl)}</strong>
            <small>${safe(t.exit_reason || t.direction || "")}</small>
          </div>
        </div>`;
    }).join("");
  }

  function renderPortfolioStats(p) {
    const host = $("#portfolio-stats");
    if (!host) return;

    const stats = [
      ["Начальный капитал", money(p.initial_capital)],
      ["Доступный баланс", money(p.balance)],
      ["Equity", money(p.equity)],
      ["Нереализованный P&L", money(p.unrealized_pnl)]
    ];

    host.innerHTML = stats.map(([label, value]) => `
      <div class="stat-box"><span>${label}</span><b>${value}</b></div>
    `).join("");
  }

  async function loadPortfolio() {
    const [p, h] = await Promise.all([
      api("/api/portfolio"),
      api("/api/history?limit=200")
    ]);

    state.portfolio = p;

    const balance = $("#portfolio-balance");
    const pnl = $("#portfolio-pnl");
    if (balance) balance.textContent = money(p.equity);
    if (pnl) {
      pnl.textContent = `${Number(p.total_pnl) >= 0 ? "+" : ""}${money(p.total_pnl)}`;
      pnl.className = Number(p.total_pnl) >= 0 ? "positive" : "negative";
    }

    const dashBalance = $("#dashboard-balance");
    const dashPnl = $("#dashboard-pnl");
    const initial = $("#dashboard-initial");
    const equity = $("#dashboard-equity");
    const accountCount = $("#dashboard-accounts");

    if (dashBalance) dashBalance.textContent = money(p.equity);
    if (dashPnl) {
      dashPnl.textContent = `${Number(p.total_pnl) >= 0 ? "+" : ""}${money(p.total_pnl)}`;
      dashPnl.className = Number(p.total_pnl) >= 0 ? "hero-pnl positive" : "hero-pnl negative";
    }
    if (initial) initial.textContent = money(p.initial_capital);
    if (equity) equity.textContent = money(p.equity);
    if (accountCount) accountCount.textContent = String((p.accounts || []).length);

    renderPortfolioStats(p);
    renderPositions(p.positions || []);
    renderAccounts(p.accounts || []);
    renderHistory(h.trades || []);
  }

  async function refreshAll() {
    if (state.loading) return;
    state.loading = true;

    try {
      await Promise.allSettled([
        loadMarkets(),
        loadPortfolio()
      ]);
    } finally {
      state.loading = false;
    }
  }

  function activatePage(page) {
    if (page === "markets") loadChart();
    if (page === "portfolio") loadPortfolio().catch(error => {
      showError($("#positions-list"), error.message);
      showError($("#portfolio-accounts"), error.message);
      showError($("#history-list"), error.message);
    });
  }

  func
