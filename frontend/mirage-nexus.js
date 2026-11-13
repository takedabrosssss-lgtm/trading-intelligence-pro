/* MIRAGE NEXUS — additive presentation layer.
 * Uses existing MIRAGE read-only APIs and existing DOM ids.
 * Does not alter signal generation, risk rules, Paper Trading or order execution.
 */
(() => {
  "use strict";
  if (window.__MIRAGE_NEXUS__) return;
  window.__MIRAGE_NEXUS__ = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    portfolio: null,
    trades: [],
    signals: [],
    health: null,
    range: "ALL",
    busy: false,
    lastLoadedAt: 0,
    marketObserver: null
  };

  const STRATEGIES = {
    scalping: { label: "Scalping", icon: "⌁", timeframe: "15M" },
    intraday: { label: "Intraday", icon: "◈", timeframe: "1H" },
    swing: { label: "Swing", icon: "↗", timeframe: "4H" },
    position: { label: "Position", icon: "▦", timeframe: "1D" }
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const money = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-US", {
      style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2
    }) : "—";
  };
  const signedMoney = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
  };
  const signedPct = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;
  };
  const timestamp = value => {
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const ago = value => {
    const time = timestamp(value);
    if (!time) return "Время не указано";
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return "Только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч. назад`;
    return `${Math.floor(hours / 24)} дн. назад`;
  };

  function authHeaders() {
    const headers = { Accept: "application/json" };
    const initData = window.Telegram?.WebApp?.initData || "";
    if (initData) headers["X-Telegram-Init-Data"] = initData;
    return headers;
  }

  async function getJSON(url, timeout = 12000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: "GET", headers: authHeaders(), cache: "no-store", signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.detail || `Сервер ответил ${response.status}`;
        throw new Error(message);
      }
      return data;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Истекло время ожидания ответа сервера");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function cardHead(kicker, title, subtitle, right = "") {
    return `<div class="nexus-card-head"><div><div class="nexus-kicker">${esc(kicker)}</div><h2 class="nexus-card-title">${esc(title)}</h2>${subtitle ? `<div class="nexus-card-sub">${esc(subtitle)}</div>` : ""}</div>${right}</div>`;
  }

  function enhancePhantomCard() {
    const card = $("#mirage-phantom-card");
    if (!card || $(".nexus-phantom-visual", card)) return;
    card.classList.add("nexus-phantom-enhanced");
    const visual = document.createElement("div");
    visual.className = "nexus-phantom-visual";
    visual.innerHTML = `<div class="nexus-phantom-orb" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M32 6c-14 0-24 10-24 25v22c0 3 3 4 5 2l7-6 5 5c3 3 6 3 9 0l5-5 7 6c2 2 5 1 5-2V31C56 16 46 6 32 6Z"/><path d="M23 28h.1M41 28h.1M23 39c6 5 12 5 18 0"/></svg></div><div><div class="nexus-kicker">EMERGENCY CONTROL</div><b>PROTOCOL PHANTOM</b><small>Изолированная защитная блокировка MIRAGE</small></div>`;
    card.insertBefore(visual, card.firstChild);
  }

  function createDashboardModules() {
    const dashboard = $("#dashboard");
    const hero = $("#dashboard .hero-card");
    if (!dashboard || !hero || $("#nexus-command")) return;

    const command = document.createElement("section");
    command.id = "nexus-command";
    command.className = "nexus-command";
    command.setAttribute("aria-label", "MIRAGE NEXUS Command Center");
    command.innerHTML = `
      <div class="nexus-command-top">
        <section class="nexus-card nexus-performance">
          ${cardHead("NEXUS / PERFORMANCE", "Equity Curve", "Движение виртуального капитала по закрытым Paper Trading сделкам", '<span class="nexus-live-state">PAPER ONLY</span>')}
          <div class="nexus-metric-row">
            <div class="nexus-metric"><small>Текущая Equity</small><b id="nexus-equity">—</b></div>
            <div class="nexus-metric"><small>Общий Net P&amp;L</small><b id="nexus-total-pnl">—</b></div>
            <div class="nexus-metric"><small>Доходность</small><b id="nexus-return">—</b></div>
          </div>
          <div class="nexus-chart-wrap"><div id="nexus-equity-chart" class="nexus-chart-empty">Загружаем историю капитала…</div></div>
          <div class="nexus-chart-meta"><span id="nexus-equity-meta">История закрытых сделок</span><div class="nexus-chart-ranges" role="group" aria-label="Период графика"><button type="button" data-nx-range="7D">7Д</button><button type="button" data-nx-range="30D">30Д</button><button type="button" class="active" data-nx-range="ALL">ВСЕ</button></div></div>
        </section>
        <section class="nexus-card nexus-core nexus-expert-only" id="nexus-core-card">
          ${cardHead("MIRAGE / SYSTEM CORE", "Intelligence Core", "Состояние основных сервисов приложения", '<span class="nexus-live-state">LIVE CHECK</span>')}
          <div class="nexus-core-visual"><div class="nexus-core-orb" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.8 19.2 7v5.5c0 4.2-2.7 7.2-7.2 8.7-4.5-1.5-7.2-4.5-7.2-8.7V7L12 2.8Z"/><path d="m8.4 12.2 2.2 2.2 4.8-5"/></svg></div><div class="nexus-core-copy"><b id="nexus-core-status">Проверяем систему</b><small id="nexus-core-note">Состояние базы, сканера и рыночных данных</small></div></div>
          <div id="nexus-core-checks" class="nexus-core-checks"><div class="nexus-check"><span>Инициализация</span><b class="warn">CHECKING</b></div></div>
          <div class="nexus-core-foot">Диагностика показывает доступность сервисов, а не качество или вероятность торгового сигнала.</div>
        </section>
      </div>
      <div class="nexus-command-bottom">
        <section class="nexus-card nexus-radar-card nexus-expert-only" id="nexus-radar-card">
          ${cardHead("MARKET INTELLIGENCE", "Market Radar", "Ширина движения выбранных активов за 24 часа")}
          <div class="nexus-radar-layout"><div id="nexus-radar-ring" class="nexus-radar-ring" style="--nexus-positive-share:50%"><div class="nexus-radar-center"><b id="nexus-radar-value">—</b><small>UP / TOTAL</small></div></div><div class="nexus-radar-copy"><b id="nexus-radar-title">Ожидаем котировки</b><p id="nexus-radar-copy">Радар использует изменения 24ч по активам, уже загруженным приложением.</p><div class="nexus-radar-stats"><span id="nexus-radar-up">Рост: —</span><span id="nexus-radar-down">Снижение: —</span></div></div></div>
        </section>
        <section class="nexus-card nexus-heatmap-card" id="nexus-heatmap-card">
          ${cardHead("LIVE MARKET / 24H", "Market Heatmap", "Реальные котировки Binance Spot из основного Market Watch")}
          <div id="nexus-heatmap-grid" class="nexus-heatmap-grid"><div class="nexus-empty">Ожидаем данные рынка…</div></div>
          <div class="nexus-heatmap-foot" id="nexus-heatmap-foot">Цвет отражает направление изменения цены за 24 часа, а не прогноз.</div>
        </section>
      </div>
      <section class="nexus-card nexus-expert-only" id="nexus-intelligence-feed-card">
        ${cardHead("INTELLIGENCE FEED", "События системы", "Последние сигналы и завершённые Paper Trading сделки", '<span class="nexus-live-state">READ ONLY</span>')}
        <div id="nexus-intelligence-feed" class="nexus-feed"><div class="nexus-empty">Загружаем события…</div></div>
      </section>
    `;
    hero.insertAdjacentElement("afterend", command);

    const strategy = document.createElement("section");
    strategy.className = "nexus-strategy-section";
    strategy.id = "nexus-strategy-section";
    strategy.innerHTML = `
      <div class="section-title"><div><span class="eyebrow">FOUR PAPER ENGINES</span><h2>Стратегические модули</h2></div><button class="text-btn" type="button" data-page="strategies">Управление <span>↗</span></button></div>
      <div id="nexus-strategy-grid" class="nexus-strategy-grid"><div class="nexus-empty">Загружаем четыре счёта…</div></div>
    `;
    command.insertAdjacentElement("afterend", strategy);

    // Reuse the original Market Watch nodes and their renderer. No duplicate
    // market API polling is introduced by the design layer.
    const marketBox = $("#dashboard-markets", dashboard);
    const marketHeading = marketBox?.previousElementSibling;
    const heatmap = $("#nexus-heatmap-card");
    if (marketBox && heatmap) {
      if (marketHeading?.classList.contains("section-title")) marketHeading.remove();
      const preview = marketBox;
      preview.classList.add("nexus-original-market-source");
      heatmap.appendChild(preview);
    }

    // Keep the original status nodes alive so app.js can continue updating
    // #market-status-dot; in SPECTRE they sit alongside the live health API.
    const statusGrid = $("#dashboard .status-grid");
    if (statusGrid) {
      const core = $("#nexus-core-card");
      if (core) core.appendChild(statusGrid);
    }

    const heroTop = $("#dashboard .hero-top");
    if (heroTop && !$(".nexus-brand-stamp", heroTop)) {
      const stamp = document.createElement("span");
      stamp.className = "nexus-brand-stamp";
      stamp.textContent = "NEXUS COMMAND CENTER";
      heroTop.appendChild(stamp);
    }
  }

  function normalizeMarketRows() {
    const host = $("#dashboard-markets");
    if (!host) return [];
    return $$(".mini-market[data-market-symbol]", host).map(node => {
      const changeText = $(".coin-change", node)?.textContent || "";
      const change = Number(changeText.replace(/[^0-9+\-.]/g, ""));
      const price = $(".coin-price", node)?.textContent?.trim() || "—";
      const symbol = node.dataset.marketSymbol || "";
      return { symbol: symbol.replace(/USDT$/, ""), change: Number.isFinite(change) ? change : 0, price };
    }).filter(item => item.symbol);
  }

  function renderMarketSnapshot() {
    const rows = normalizeMarketRows();
    const grid = $("#nexus-heatmap-grid");
    const count = rows.length;
    if (grid) {
      grid.innerHTML = count ? rows.map(item => `
        <div class="nexus-heat-tile" data-tone="${item.change >= 0 ? "up" : "down"}">
          <b>${esc(item.symbol)}</b><strong>${esc(item.price)}</strong>
          <small>${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}%</small>
        </div>`).join("") : '<div class="nexus-empty">Рынок ещё загружается. Котировки появятся после ответа Market API.</div>';
    }

    const up = rows.filter(item => item.change > 0).length;
    const down = rows.filter(item => item.change < 0).length;
    const unchanged = Math.max(0, count - up - down);
    const share = count ? up / count * 100 : 50;
    const ring = $("#nexus-radar-ring");
    if (ring) ring.style.setProperty("--nexus-positive-share", `${share.toFixed(1)}%`);
    const value = $("#nexus-radar-value");
    if (value) value.textContent = count ? `${up}/${count}` : "—";
    const title = $("#nexus-radar-title");
    if (title) title.textContent = !count ? "Ожидаем котировки" : up > down ? "Преобладает рост" : down > up ? "Преобладает снижение" : "Смешанное движение";
    const copy = $("#nexus-radar-copy");
    if (copy) copy.textContent = count ? `Из ${count} активов ${up} растут, ${down} снижаются, ${unchanged} почти без изменения за последние 24 часа.` : "Нет доступных котировок для расчёта ширины рынка.";
    const upNode = $("#nexus-radar-up");
    if (upNode) upNode.textContent = `Рост: ${up}`;
    const downNode = $("#nexus-radar-down");
    if (downNode) downNode.textContent = `Снижение: ${down}`;
    const foot = $("#nexus-heatmap-foot");
    if (foot) foot.textContent = count ? `${count} активов · Binance Spot · изменения за 24 часа` : "Нет свежих котировок";
  }

  function selectedTrades() {
    const now = Date.now();
    const days = state.range === "7D" ? 7 : state.range === "30D" ? 30 : 0;
    const cutoff = days ? now - days * 86400000 : 0;
    return state.trades.filter(trade => !cutoff || timestamp(trade.closed_at) >= cutoff);
  }

  function createEquityCurve(trades, portfolio) {
    const balance = Number(portfolio?.balance ?? portfolio?.equity ?? 0);
    const equity = Number(portfolio?.equity ?? balance);
    const pnlValues = trades.map(trade => Number(trade.net_pnl || 0)).filter(Number.isFinite);
    const pnlSum = pnlValues.reduce((sum, value) => sum + value, 0);
    const start = balance - pnlSum;
    const values = [start];
    let cumulative = start;
    pnlValues.forEach(value => { cumulative += value; values.push(cumulative); });
    // Current equity includes the latest unrealized mark; it is shown as a
    // distinct final point instead of mislabeling realized cash as equity.
    if (Number.isFinite(equity) && (values.length < 2 || Math.abs(values[values.length - 1] - equity) > .005)) values.push(equity);
    return values.filter(Number.isFinite);
  }

  function renderEquityCurve() {
    const host = $("#nexus-equity-chart");
    if (!host) return;
    const trades = selectedTrades().sort((a, b) => timestamp(a.closed_at) - timestamp(b.closed_at));
    const values = createEquityCurve(trades, state.portfolio);
    if (values.length < 2) {
      host.className = "nexus-chart-empty";
      host.textContent = "Кривая появится после первых закрытых сделок.";
      return;
    }

    const width = 620, height = 116, left = 7, right = 7, top = 9, bottom = 9;
    let min = Math.min(...values), max = Math.max(...values);
    if (Math.abs(max - min) < .000001) { max += 1; min -= 1; }
    const span = max - min;
    const coords = values.map((value, index) => {
      const x = left + (values.length === 1 ? 0 : index / (values.length - 1)) * (width - left - right);
      const y = top + (1 - (value - min) / span) * (height - top - bottom);
      return [x, y];
    });
    const path = coords.map(([x,y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `${path} L${coords[coords.length - 1][0].toFixed(2)},${(height-bottom).toFixed(2)} L${coords[0][0].toFixed(2)},${(height-bottom).toFixed(2)} Z`;
    const [lastX, lastY] = coords[coords.length - 1];
    host.className = "nexus-chart-wrap";
    host.innerHTML = `
      <svg class="nexus-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="График изменения Paper Trading капитала">
        <defs><linearGradient id="nexus-equity-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--nx-accent)" stop-opacity=".48"/><stop offset="100%" stop-color="var(--nx-accent)" stop-opacity="0"/></linearGradient></defs>
        <path class="nexus-chart-grid" d="M0 28H620 M0 58H620 M0 88H620"/>
        <path class="nexus-chart-area" fill="url(#nexus-equity-gradient)" d="${area}"/>
        <path class="nexus-chart-line" d="${path}"/>
        <circle class="nexus-chart-dot" cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="4"/>
      </svg>`;
    const meta = $("#nexus-equity-meta");
    if (meta) meta.textContent = `${trades.length} закрытых сделок · последняя точка включает текущую unrealized Equity`;
    $$('[data-nx-range]').forEach(button => button.classList.toggle("active", button.dataset.nxRange === state.range));
  }

  function renderPortfolio(portfolio) {
    if (!portfolio || typeof portfolio !== "object") return;
    state.portfolio = portfolio;
    const equity = Number(portfolio.equity || 0);
    const initial = Number(portfolio.initial_capital || 0);
    const pnl = Number(portfolio.total_pnl ?? (equity - initial));
    const ret = initial > 0 ? pnl / initial * 100 : 0;
    const assignments = [
      ["#nexus-equity", money(equity), ""],
      ["#nexus-total-pnl", signedMoney(pnl), pnl >= 0 ? "positive" : "negative"],
      ["#nexus-return", signedPct(ret), ret >= 0 ? "positive" : "negative"]
    ];
    assignments.forEach(([selector, value, cls]) => {
      const node = $(selector);
      if (node) { node.textContent = value; node.className = cls; }
    });

    const accounts = Array.isArray(portfolio.accounts) ? portfolio.accounts : [];
    const strategyGrid = $("#nexus-strategy-grid");
    if (strategyGrid) {
      strategyGrid.innerHTML = accounts.length ? accounts.map(account => {
        const key = String(account.strategy || "").toLowerCase();
        const info = STRATEGIES[key] || { label: account.name || key || "Paper", icon: "◈", timeframe: "—" };
        const accountEquity = Number(account.equity ?? account.balance ?? 0);
        const accountPnl = Number(account.total_pnl || 0);
        return `<article class="nexus-strategy-card" data-strategy="${esc(key)}">
          <div class="nexus-strategy-top"><span class="nexus-strategy-icon">${info.icon}</span><span class="nexus-live-state">${esc(info.timeframe)}</span></div>
          <div class="nexus-strategy-name">${esc(info.label)}</div>
          <div class="nexus-strategy-value">${money(accountEquity)}</div>
          <div class="nexus-strategy-pnl ${accountPnl >= 0 ? "positive" : "negative"}">${signedMoney(accountPnl)}</div>
          <div class="nexus-strategy-meta">${Number(account.open_positions || 0)} открытых позиций · Cash ${money(account.balance)}</div>
        </article>`;
      }).join("") : '<div class="nexus-empty">Счета для этого пользователя пока не возвращены API.</div>';
    }
    renderEquityCurve();
  }

  function statusLabel(value) {
    const status = String(value || "unknown").toLowerCase();
    if (["ok", "running", "connected", "healthy"].includes(status)) return ["ONLINE", ""];
    if (["disabled"].includes(status)) return ["DISABLED", "warn"];
    if (["degraded", "not_running", "unknown"].includes(status)) return [status.replace(/_/g, " ").toUpperCase(), "warn"];
    return [status.toUpperCase(), "bad"];
  }

  function renderHealth(data) {
    if (!data) return;
    state.health = data;
    const status = $("#nexus-core-status");
    const note = $("#nexus-core-note");
    const checks = $("#nexus-core-checks");
    if (status) status.textContent = data.status === "ok" ? "Все проверки пройдены" : data.status === "degraded" ? "Часть сервисов ограничена" : "Есть системные ошибки";
    if (note) note.textContent = `Проверено ${data.checked_at ? new Date(data.checked_at).toLocaleTimeString("ru-RU") : "—"} · Paper Trading only`;
    const labels = { database: "База данных", market_data: "Рыночные данные", scanner: "Сканер", telegram_bot: "Telegram polling" };
    if (checks) {
      checks.innerHTML = Object.entries(data.checks || {}).map(([key, item]) => {
        const [label, cls] = statusLabel(item.status);
        return `<div class="nexus-check"><span>${esc(labels[key] || key)}</span><b class="${cls}">${esc(label)}</b></div>`;
      }).join("") || '<div class="nexus-empty">Нет диагностических данных.</div>';
    }
  }

  function renderFeed(signals, trades) {
    const host = $("#nexus-intelligence-feed");
    if (!host) return;
    const events = [];
    (Array.isArray(signals) ? signals : []).forEach(signal => events.push({
      type: "signal", at: signal.created_at, symbol: signal.symbol || "—", direction: signal.direction || "—",
      title: `${signal.direction === "SELL" ? "SHORT" : "LONG"} ${String(signal.symbol || "").replace(/USDT$/, "")}`,
      detail: `${signal.timeframe || "—"} · Grade ${signal.grade || "—"} · Score ${Number(signal.score || 0).toFixed(0)}/100`, value: `#${signal.id ?? "—"}`
    }));
    (Array.isArray(trades) ? trades : []).forEach(trade => {
      const value = Number(trade.net_pnl || 0);
      events.push({
        type: "trade", at: trade.closed_at, symbol: trade.symbol || "—", direction: trade.direction || "—",
        title: `Закрыта ${String(trade.symbol || "").replace(/USDT$/, "")}`,
        detail: `${trade.strategy || "Paper Trading"} · ${trade.exit_reason || "Закрытие"}`, value: signedMoney(value), positive: value >= 0
      });
    });
    events.sort((a, b) => timestamp(b.at) - timestamp(a.at));
    const recent = events.slice(0, 7);
    host.innerHTML = recent.length ? recent.map(event => `
      <div class="nexus-feed-item">
        <span class="nexus-feed-icon">${event.type === "signal" ? (event.direction === "SELL" ? "↘" : "↗") : "✓"}</span>
        <div class="nexus-feed-copy"><b>${esc(event.title)}</b><small>${esc(event.detail)} · ${esc(ago(event.at))}</small></div>
        <span class="nexus-feed-value ${event.type === "trade" ? (event.positive ? "positive" : "negative") : ""}">${esc(event.value)}</span>
      </div>`).join("") : '<div class="nexus-empty">Новых сигналов и закрытых сделок пока нет. Здесь отображаются только реальные события из журнала MIRAGE.</div>';
  }

  async function refreshData(force = false) {
    if (state.busy) return;
    if (!force && Date.now() - state.lastLoadedAt < 45000) return;
    state.busy = true;
    state.lastLoadedAt = Date.now();
    try {
      const [portfolioResult, historyResult, healthResult, signalsResult] = await Promise.allSettled([
        getJSON("/api/portfolio"),
        getJSON("/api/history?limit=200"),
        getJSON("/api/mirage/health"),
        getJSON("/api/mirage/signals?page=1&limit=8")
      ]);
      if (portfolioResult.status === "fulfilled") renderPortfolio(portfolioResult.value);
      else {
        const chart = $("#nexus-equity-chart");
        if (chart) { chart.className = "nexus-chart-empty"; chart.textContent = `Не удалось загрузить портфель: ${portfolioResult.reason?.message || "API недоступен"}`; }
      }
      if (historyResult.status === "fulfilled") {
        state.trades = Array.isArray(historyResult.value.trades) ? historyResult.value.trades : [];
        renderEquityCurve();
      }
      if (healthResult.status === "fulfilled") renderHealth(healthResult.value);
      const signalData = signalsResult.status === "fulfilled" ? signalsResult.value : null;
      state.signals = Array.isArray(signalData?.signals) ? signalData.signals : [];
      renderFeed(state.signals, state.trades);
      renderMarketSnapshot();
    } finally {
      state.busy = false;
    }
  }

  function ensureStylesLast() {
    let link = $("#mirage-nexus-css");
    if (!link) {
      link = document.createElement("link");
      link.id = "mirage-nexus-css";
      link.rel = "stylesheet";
      link.href = "mirage-nexus.css?v=20261113-nexus1";
    }
    // Mobile-first and release layers append their styles dynamically. Move
    // NEXUS to the end so its deliberate design tokens win the cascade.
    document.head.appendChild(link);
  }

  const EXPERT_SEARCH_TERMS = [
    "Research Studio", "Backtest", "Walk-forward", "Cross-Asset Research",
    "Глубокое исследование", "Robustness Engine", "Signal Intelligence",
    "Архив сигналов", "Command Center", "System Health", "Журнал сделок"
  ];
  function applyQuickFindMode() {
    const stealth = document.body.dataset.mirageMode !== "spectre";
    ["#mirage41-links .mirage41-link", "#mirage41-results .mirage41-result"].forEach(selector => {
      $$(selector).forEach(node => {
        const label = node.textContent || "";
        const expert = EXPERT_SEARCH_TERMS.some(term => label.toLowerCase().includes(term.toLowerCase()));
        node.hidden = Boolean(stealth && expert);
      });
    });
  }

  function syncMode() {
    const mode = document.body.dataset.mirageMode === "spectre" ? "spectre" : "stealth";
    document.documentElement.dataset.nexusMode = mode;
    const label = $(".nexus-brand-stamp");
    if (label) label.textContent = mode === "spectre" ? "NEXUS / SPECTRAL INTELLIGENCE" : "NEXUS / FOCUSED EXECUTION";
    const marketTitle = $("#nexus-heatmap-card .nexus-card-title");
    if (marketTitle) marketTitle.textContent = mode === "spectre" ? "Market Heatmap" : "Market Snapshot";
    $("#home-mode-switch")?.remove(); // one global mode switch, not a duplicate on Home
    applyQuickFindMode();
  }

  function bindControls() {
    const quickFind = $("#mirage41-links") || $("#mirage41-results");
    if (quickFind) {
      const searchObserver = new MutationObserver(applyQuickFindMode);
      searchObserver.observe(quickFind.parentElement || quickFind, { childList: true, subtree: true, characterData: true });
    }
    document.addEventListener("click", event => {
      const range = event.target.closest("[data-nx-range]");
      if (range) {
        state.range = range.dataset.nxRange;
        $$('[data-nx-range]').forEach(button => button.classList.toggle("active", button === range));
        renderEquityCurve();
      }
    });
    $("#refresh-btn")?.addEventListener("click", () => window.setTimeout(() => refreshData(true), 900));
    document.addEventListener("mirage:pagechange", event => {
      if (event.detail?.page === "dashboard") {
        renderMarketSnapshot();
        refreshData(false);
      }
      if (event.detail?.page === "markets") renderMarketSnapshot();
    });
    document.addEventListener("mirage:modechange", syncMode);
    const modeObserver = new MutationObserver(syncMode);
    modeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-mirage-mode"] });
  }

  function init() {
    ensureStylesLast();
    createDashboardModules();
    enhancePhantomCard();
    syncMode();
    bindControls();
    const marketHost = $("#dashboard-markets");
    if (marketHost) {
      state.marketObserver = new MutationObserver(() => renderMarketSnapshot());
      state.marketObserver.observe(marketHost, { childList: true, subtree: true, characterData: true });
    }
    // Existing modules finish their initial portfolio and market fetches first.
    window.setTimeout(() => refreshData(true), 900);
    window.setInterval(() => {
      if (document.visibilityState === "visible" && $("#dashboard")?.classList.contains("active")) refreshData(false);
    }, 90000);
    console.info("MIRAGE NEXUS visual layer initialized");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(init, 80), { once: true });
  } else {
    window.setTimeout(init, 80);
  }
})();
