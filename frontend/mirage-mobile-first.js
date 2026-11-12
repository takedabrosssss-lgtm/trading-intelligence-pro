/* MIRAGE Mobile First — six-screen app shell.
   Presentation and read-only data loading only. Trading logic is untouched. */
(() => {
  "use strict";
  if (window.__MIRAGE_MOBILE_FIRST__) return;
  window.__MIRAGE_MOBILE_FIRST__ = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const NAV = [
    ["dashboard", "Главная", "home"],
    ["signals", "Сигналы", "pulse"],
    ["markets", "Аналитика", "chart"],
    ["news", "Новости", "news"],
    ["profile", "Профиль", "user"]
  ];
  const ICONS = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    pulse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h4l3-8 5 16 3-8h5"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V12M10 20V5M16 20v-9M22 20V3"/></svg>',
    news: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18M16 14h2"/><path d="M6 5V4a2 2 0 0 1 2-2h10"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/></svg>'
  };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const money = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
  };
  const timeAgo = value => {
    if (!value) return "Время не указано";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Время не указано";
    const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
    if (mins < 1) return "Только что";
    if (mins < 60) return `${mins} мин. назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ч. назад`;
    return `${Math.floor(hours / 24)} дн. назад`;
  };
  const authHeaders = () => {
    const headers = { Accept: "application/json" };
    const initData = window.Telegram?.WebApp?.initData || "";
    if (initData) headers["X-Telegram-Init-Data"] = initData;
    return headers;
  };
  async function getJSON(path, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(path, { headers: authHeaders(), cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 ? "Открой MIRAGE через Telegram для авторизации." : `Сервер ответил ${response.status}.`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function installStylesLast() {
    let link = $('link#mirage-mobile-first-css');
    if (!link) {
      link = document.createElement("link");
      link.id = "mirage-mobile-first-css";
      link.rel = "stylesheet";
      link.href = "mirage-mobile-first.css?v=3";
    }
    document.head.appendChild(link);
  }

  function buildNav() {
    const nav = $(".bottom-nav");
    if (!nav) return;   
     if (nav.parentElement !== document.body) {
      document.body.appendChild(nav);
    }
    nav.innerHTML = NAV.map(([page, label, icon]) => `
      <button type="button" class="nav-item${page === "dashboard" ? " active" : ""}" data-page="${page}" aria-label="${label}" aria-current="${page === "dashboard" ? "page" : "false"}">
        <span>${ICONS[icon]}</span><small>${label}</small>
      </button>`).join("");
    nav.setAttribute("aria-label", "Основная навигация");
    nav.dataset.mobileFirst = "true";
  }

  function ensureAnalyticsOverview() {
    const page = $("#markets");
    const intro = $(".page-intro", page);
    if (!page || !intro || $("#mobile-analytics-overview")) return;
    const block = document.createElement("section");
    block.id = "mobile-analytics-overview";
    block.className = "mobile-analytics-overview";
    block.innerHTML = `
      <article class="mobile-return-card"><div><span>ОБЩАЯ ДОХОДНОСТЬ PAPER TRADING</span><b id="analytics-return">—</b><small id="analytics-net-pnl">Реализованный P&amp;L: —</small></div><div class="mobile-return-orbit">↗</div></article>
      <div class="mobile-analytics-stats" id="analytics-statistics"><div class="mobile-analytics-stat"><small>Сделки</small><b>—</b></div><div class="mobile-analytics-stat"><small>Win Rate</small><b>—</b></div><div class="mobile-analytics-stat"><small>Просадка</small><b>—</b></div></div>
      <section class="mobile-allocation"><div class="mobile-section-heading"><div><span class="eyebrow">ACCOUNT MIX</span><h2>Распределение капитала</h2></div></div><div id="analytics-allocation" class="mobile-allocation-list"><div class="mobile-empty-state">Загружаем статистику счетов…</div></div></section>`;
    intro.insertAdjacentElement("afterend", block);
  }

  function ensureNewsPage() {
    if ($("#news")) return;
    const section = document.createElement("section");
    section.className = "page mirage-mobile-page";
    section.id = "news";
    section.innerHTML = `
      <div class="mobile-page-head"><div class="mobile-page-icon">${ICONS.news}</div><div><span class="eyebrow">MARKET INTELLIGENCE</span><h1>Новости</h1><p>Рыночные события и их возможное влияние</p></div><button class="mobile-icon-button" id="news-refresh" aria-label="Обновить новости">${ICONS.refresh}</button></div>
      <div class="mobile-filter-row" role="group" aria-label="Категории новостей">
        <button class="mobile-chip active" data-news-filter="all">Все</button><button class="mobile-chip" data-news-filter="crypto">Крипто</button><button class="mobile-chip" data-news-filter="economy">Экономика</button><button class="mobile-chip" data-news-filter="analysis">Аналитика</button>
      </div>
      <div class="mobile-feed-meta"><b id="news-count">Последние события</b><span id="news-updated">Подключаем источники…</span></div>
      <div id="news-feed" class="mobile-news-feed"><div class="mobile-empty-state">Загружаем новости…</div></div>
      <p class="mobile-footnote">Оценка влияния — эвристическая классификация по тексту публикации, не торговый сигнал и не прогноз цены.</p>`;
    const markets = $("#markets");
    if (markets) markets.insertAdjacentElement("afterend", section);
  }

  function ensureProfilePage() {
    if ($("#profile")) return;
    const section = document.createElement("section");
    section.className = "page mirage-mobile-page";
    section.id = "profile";
    section.innerHTML = `
      <div class="mobile-page-head"><div class="mobile-page-icon">${ICONS.user}</div><div><span class="eyebrow">PERSONAL SPACE</span><h1>Профиль</h1><p>Настройки и управление MIRAGE</p></div></div>
      <article class="profile-identity-card"><div class="profile-avatar" id="profile-avatar">M</div><div class="profile-identity-copy"><b id="profile-user-name">Пользователь</b><span id="profile-user-subtitle">MIRAGE · Paper Trading</span><small>Личный терминал</small></div><span class="profile-member-mark">${ICONS.user}</span></article>
      <section class="profile-mode-card"><div class="profile-section-heading"><div><span class="eyebrow">INTERFACE</span><h2>Режим интерфейса</h2></div><span class="profile-mode-status" id="profile-mode-status">STEALTH MODE</span></div><div id="profile-mode-host" class="profile-mode-host"></div></section>
      <section class="profile-menu-card" aria-label="Настройки профиля">
        <button class="profile-menu-row" type="button" data-profile-action="settings"><span class="profile-menu-icon">⚙</span><span><b>Настройки</b><small>Внешний вид и поведение приложения</small></span><i>›</i></button>
        <button class="profile-menu-row" type="button" data-profile-action="notifications"><span class="profile-menu-icon">♧</span><span><b>Уведомления</b><small>Управление через Telegram-бота</small></span><i>›</i></button>
        <button class="profile-menu-row" type="button" data-page="portfolio" data-profile-scroll="portfolio-account-tiles"><span class="profile-menu-icon">▣</span><span><b>Портфель и счета</b><small>Баланс, четыре Paper Trading аккаунта и позиции</small></span><i>›</i></button>
        <button class="profile-menu-row" type="button" data-page="strategies"><span class="profile-menu-icon">▦</span><span><b>Управление капиталом</b><small>Стратегии, Research Studio и стресс-тесты</small></span><i>›</i></button>
        <button class="profile-menu-row" type="button" data-page="portfolio" data-profile-scroll="history-list"><span class="profile-menu-icon">▤</span><span><b>История сделок</b><small>Журнал и результаты Paper Trading</small></span><i>›</i></button>
        <button class="profile-menu-row" type="button" data-profile-action="about"><span class="profile-menu-icon">ⓘ</span><span><b>О приложении</b><small>Версия, режим работы и ограничения</small></span><i>›</i></button>
      </section>
      <div class="profile-extra" id="profile-settings" hidden><div class="profile-extra-head"><b>Настройки отображения</b><button type="button" class="profile-extra-close" data-profile-close>×</button></div><label class="profile-setting-row"><span><b>Уменьшить анимации</b><small>Для более плавной работы на слабых устройствах</small></span><input id="profile-reduced-motion" type="checkbox"></label><p class="mobile-footnote">Режим STEALTH / SPECTRE влияет только на оформление. Расчёты и функции остаются активными.</p></div>
      <div class="profile-extra" id="profile-notifications" hidden><div class="profile-extra-head"><b>Уведомления Telegram</b><button type="button" class="profile-extra-close" data-profile-close>×</button></div><p>Торговые уведомления отправляются существующим Telegram-ботом. Здесь нет отдельного переключателя, который мог бы создать ложное впечатление о включении уведомлений.</p><a class="profile-telegram-link" href="https://t.me/tradingintelligenceprobot" target="_blank" rel="noopener">Открыть Telegram-бота ${ICONS.arrow}</a></div>
      <div class="profile-extra" id="profile-about" hidden><div class="profile-extra-head"><b>О MIRAGE</b><button type="button" class="profile-extra-close" data-profile-close>×</button></div><div class="profile-about-logo">MIRAGE</div><p>Trading Intelligence PRO</p><div class="profile-safe-label">PAPER TRADING ONLY</div><p class="mobile-footnote">Только симуляция сделок. Реальные биржевые ордера отключены. Рыночные данные и аналитика не являются гарантией результата.</p></div>
      <div class="profile-security-note"><span>◆</span><div><b>Paper Trading only</b><small>Реальные сделки и биржевые ордера отключены.</small></div></div>`;
    const portfolio = $("#portfolio");
    if (portfolio) portfolio.insertAdjacentElement("afterend", section);
  }

  function ensurePortfolioTiles() {
    const total = $("#portfolio .portfolio-total");
    if (!total || $("#portfolio-account-tiles")) return;
    const block = document.createElement("section");
    block.className = "mobile-accounts-section";
    block.innerHTML = `<div class="mobile-section-heading"><div><span class="eyebrow">PAPER TRADING</span><h2>Ваши счета</h2></div><button type="button" class="mobile-text-link" data-page="strategies">Управлять ${ICONS.arrow}</button></div><div id="portfolio-account-tiles" class="mobile-account-grid"><div class="mobile-empty-state">Загружаем счета…</div></div>`;
    total.insertAdjacentElement("afterend", block);
  }

  function addHomeModeSwitch() {
    const intro = $("#dashboard .page-intro");
    if (!intro || $("#home-mode-switch")) return;
    const switcher = document.createElement("div");
    switcher.id = "home-mode-switch";
    switcher.className = "mobile-home-mode-switch";
    switcher.innerHTML = `<button type="button" data-mobile-mode="stealth">✧ <span>STEALTH</span></button><button type="button" data-mobile-mode="spectre">◉ <span>SPECTRE</span></button>`;
    intro.insertAdjacentElement("afterend", switcher);
  }

  function enhanceSignalsPage() {
    const page = $("#signals");
    if (!page || $("#mobile-signal-feed")) return;
    const intro = $(".page-intro", page);
    const host = document.createElement("section");
    host.id = "mobile-signal-feed";
    host.className = "mobile-primary-feed";
    host.innerHTML = `
      <div class="mobile-signal-overview"><div class="mobile-signal-pulse">⌁</div><div><b id="mobile-signal-count">Активные сигналы</b><small id="mobile-signal-summary">Свежие подтверждённые системой возможности</small></div><button type="button" class="mobile-icon-button" id="signals-refresh" aria-label="Обновить сигналы">${ICONS.refresh}</button></div>
      <div class="mobile-filter-row" role="group" aria-label="Фильтр силы сигнала"><button class="mobile-chip active" data-signal-filter="all">Все</button><button class="mobile-chip" data-signal-filter="high">Высокий</button><button class="mobile-chip" data-signal-filter="medium">Средний</button><button class="mobile-chip" data-signal-filter="low">Низкий</button></div>
      <div id="mobile-signals-list" class="mobile-signals-list"><div class="mobile-empty-state">Загружаем сигналы…</div></div>
      <p class="mobile-footnote">Показываются только сигналы, прошедшие существующие фильтры. Это аналитические данные, а не команда на реальную сделку.</p>`;
    if (intro) intro.insertAdjacentElement("afterend", host);

    const oldTools = document.createElement("details");
    oldTools.className = "mobile-advanced-details";
    oldTools.innerHTML = `<summary>Дополнительный технический анализ</summary><div class="mobile-details-body" id="mobile-analysis-tools"></div>`;
    const selector = $(".signal-selector", page);
    const result = $("#analysis-result", page);
    const disclaimer = $(".disclaimer", page);
    if (selector || result || disclaimer) {
      page.appendChild(oldTools);
      const body = $("#mobile-analysis-tools", oldTools);
      [selector, result, disclaimer].filter(Boolean).forEach(node => body.appendChild(node));
    }
    const archive = $("#mirage4-signal-archive", page);
    if (archive && !archive.closest("details")) {
      const details = document.createElement("details");
      details.className = "mobile-advanced-details";
      details.innerHTML = `<summary>Архив сигналов и Signal Intelligence</summary>`;
      archive.insertAdjacentElement("beforebegin", details);
      details.appendChild(archive);
    }
  }

  function profileInfo() {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user || {};
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || "Пользователь";
    const subtitle = user.username ? `@${user.username}` : "MIRAGE · Paper Trading";
    const nameNode = $("#profile-user-name");
    const subNode = $("#profile-user-subtitle");
    const avatar = $("#profile-avatar");
    if (nameNode) nameNode.textContent = name;
    if (subNode) subNode.textContent = subtitle;
    if (avatar) {
      if (user.photo_url) avatar.innerHTML = `<img src="${esc(user.photo_url)}" alt="">`;
      else avatar.textContent = name.slice(0, 1).toLocaleUpperCase("ru");
    }
  }

  function moveModeToolbar() {
    const toolbar = $(".mirage-mode-toolbar");
    const host = $("#profile-mode-host");
    if (toolbar && host && toolbar.parentElement !== host) host.appendChild(toolbar);
    syncModeLabel();
  }

  function syncModeLabel() {
    const mode = document.body.dataset.mirageMode === "spectre" ? "spectre" : "stealth";
    const label = $("#profile-mode-status");
    if (label) label.textContent = mode === "spectre" ? "SPECTRE MODE" : "STEALTH MODE";
    $$('[data-mobile-mode]').forEach(button => button.classList.toggle("active", button.dataset.mobileMode === mode));
  }

  function setActiveNav(page) {
    const selected = ["strategies", "portfolio"].includes(page) ? "profile" : page;
    $$(".bottom-nav [data-page]").forEach(button => {
      const active = button.dataset.page === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function formatSignal(signal) {
    const isLong = signal.direction === "BUY";
    const score = Number(signal.score ?? 0);
    const side = isLong ? "LONG" : "SHORT";
    const tier = score >= 80 ? "high" : score >= 65 ? "medium" : "low";
    return { tier, html: `
      <article class="mobile-signal-card ${isLong ? "is-long" : "is-short"}">
        <div class="mobile-signal-accent"></div>
        <div class="mobile-signal-top"><div><b>${esc(String(signal.symbol || "").replace(/USDT$/, ""))}<span>/USDT</span></b><small>${esc(signal.timeframe || "—")} · ${timeAgo(signal.created_at)}</small></div><span class="mobile-direction ${isLong ? "long" : "short"}">${side}</span></div>
        <div class="mobile-signal-middle"><span>Grade <b>${esc(signal.grade || "—")}</b></span><span>Score <b>${Number.isFinite(score) ? score.toFixed(0) : "—"}/100</b></span><span>${esc(signal.strategy || "Technical")}</span></div>
        <div class="mobile-signal-prices"><div><small>Вход</small><b>${money(signal.entry_price)}</b></div><div><small>TP</small><b>${money(signal.take_profit)}</b></div><div><small>SL</small><b>${money(signal.stop_loss)}</b></div></div>
        ${signal.reasoning ? `<p class="mobile-signal-reason">${esc(signal.reasoning).slice(0, 240)}</p>` : ""}
      </article>` };
  }

  let signalsData = [];
  let signalsTier = "all";
  async function loadSignals() {
    const host = $("#mobile-signals-list");
    if (!host) return;
    host.innerHTML = `<div class="mobile-empty-state">Обновляем список…</div>`;
    try {
      const data = await getJSON("/api/mirage/signals?limit=100");
      signalsData = (data.signals || []).filter(item => ["new", "sent", "eligible"].includes(item.status));
      renderSignals();
    } catch (error) {
      host.innerHTML = `<div class="mobile-empty-state">${esc(error.message || "Не удалось загрузить сигналы")}</div>`;
      const count = $("#mobile-signal-count");
      if (count) count.textContent = "Сигналы недоступны";
    }
  }

  function renderSignals() {
    const host = $("#mobile-signals-list");
    if (!host) return;
    const formatted = signalsData.map(signal => ({ signal, view: formatSignal(signal) }));
    const visible = formatted.filter(({ view }) => signalsTier === "all" || view.tier === signalsTier);
    const count = $("#mobile-signal-count");
    const summary = $("#mobile-signal-summary");
    if (count) count.textContent = `${signalsData.length} активных сигнал${signalsData.length === 1 ? "" : signalsData.length < 5 ? "а" : "ов"}`;
    if (summary) summary.textContent = signalsData.length ? "Сигналы, прошедшие текущие фильтры качества" : "Сейчас нет активных сигналов, прошедших отбор";
    host.innerHTML = visible.length ? visible.map(({ view }) => view.html).join("") : `<div class="mobile-empty-state">${signalsData.length ? "Нет сигналов в этой категории." : "Новых подходящих сигналов пока нет."}</div>`;
  }

  let newsData = [];
  let newsFilter = "all";
  async function loadNews(force = false) {
    const host = $("#news-feed");
    if (!host) return;
    host.innerHTML = `<div class="mobile-empty-state">Загружаем свежие публикации…</div>`;
    try {
      const data = await getJSON(`/api/news?limit=60${force ? "&refresh=true" : ""}`, 16000);
      newsData = Array.isArray(data.items) ? data.items : [];
      renderNews();
      const updated = $("#news-updated");
      if (updated) updated.textContent = data.updated_at ? `Обновлено ${new Date(data.updated_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "Источники RSS";
    } catch (error) {
      host.innerHTML = `<div class="mobile-empty-state">${esc(error.message || "Новости временно недоступны")}<button type="button" class="mobile-retry-button" id="news-retry">Повторить загрузку</button></div>`;
      const updated = $("#news-updated");
      if (updated) updated.textContent = "Нет соединения с лентами";
    }
  }

  const impactLabel = value => value === "high" ? "ВАЖНО" : value === "medium" ? "ВЛИЯНИЕ" : "ОБЗОР";
  function renderNews() {
    const host = $("#news-feed");
    if (!host) return;
    const filtered = newsData.filter(item => newsFilter === "all" || item.category === newsFilter);
    const count = $("#news-count");
    if (count) count.textContent = `${filtered.length} публикаций`;
    host.innerHTML = filtered.length ? filtered.map(item => `
      <a class="mobile-news-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
        <div class="mobile-news-thumb ${esc(item.category)}"><span>${item.category === "economy" ? "◌" : item.category === "analysis" ? "⌁" : "₿"}</span></div>
        <div class="mobile-news-copy"><div class="mobile-news-meta"><span class="impact-tag impact-${esc(item.impact)}">${impactLabel(item.impact)}</span><span>${esc(item.source || "RSS")}</span></div><b>${esc(item.title)}</b><p>${esc(item.summary || "Откройте источник, чтобы прочитать публикацию полностью.")}</p><div class="mobile-news-foot"><span>${esc(timeAgo(item.published_at))}</span><span>${(item.assets || []).map(esc).join(" · ")}</span><i>›</i></div></div>
      </a>`).join("") : `<div class="mobile-empty-state">В этой категории пока нет публикаций.</div>`;
  }


  let analyticsLoadedAt = 0;
  async function loadAnalytics(force = false) {
    const host = $("#analytics-allocation");
    if (!host) return;
    if (!force && Date.now() - analyticsLoadedAt < 30000) return;
    host.innerHTML = `<div class="mobile-empty-state">Собираем показатели Paper Trading…</div>`;
    const results = await Promise.allSettled([
      getJSON("/api/mirage/command-center"),
      getJSON("/api/portfolio")
    ]);
    const command = results[0].status === "fulfilled" ? results[0].value : null;
    const portfolio = results[1].status === "fulfilled" ? results[1].value : null;
    if (!command || !portfolio) {
      host.innerHTML = `<div class="mobile-empty-state">Не удалось загрузить аналитику. Проверь соединение и открой раздел ещё раз.</div>`;
      return;
    }
    analyticsLoadedAt = Date.now();
    const p = command.portfolio || {};
    const t = command.trading || {};
    const ret = Number(p.return_pct);
    const returnNode = $("#analytics-return");
    const pnlNode = $("#analytics-net-pnl");
    if (returnNode) {
      returnNode.textContent = Number.isFinite(ret) ? `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%` : "—";
      returnNode.className = ret >= 0 ? "positive" : "negative";
    }
    if (pnlNode) pnlNode.textContent = `Реализованный P&L: ${money(p.net_realized_pnl)}`;
    const stats = $("#analytics-statistics");
    if (stats) stats.innerHTML = [
      ["Закрытые сделки", Number(t.closed_trades || 0).toLocaleString("ru-RU")],
      ["Win Rate", t.win_rate_pct == null ? "—" : `${Number(t.win_rate_pct).toFixed(1)}%`],
      ["Текущая просадка", p.current_drawdown_pct == null ? "—" : `${Number(p.current_drawdown_pct).toFixed(2)}%`]
    ].map(([label, value]) => `<div class="mobile-analytics-stat"><small>${label}</small><b>${esc(value)}</b></div>`).join("");
    const accounts = Array.isArray(portfolio.accounts) ? portfolio.accounts : [];
    const total = accounts.reduce((sum, account) => sum + Math.max(0, Number(account.equity || 0)), 0);
    host.innerHTML = accounts.length ? accounts.map(account => {
      const equity = Number(account.equity || 0);
      const share = total > 0 ? Math.max(0, equity) / total * 100 : 0;
      return `<div class="mobile-allocation-row"><div class="mobile-allocation-head"><b>${esc(account.name)}</b><strong>${money(equity)}</strong></div><div class="mobile-allocation-track"><i style="width:${Math.min(100, share).toFixed(1)}%"></i></div><small>${share.toFixed(1)}% капитала · ${Number(account.open_positions || 0)} позиций</small></div>`;
    }).join("") : `<div class="mobile-empty-state">Нет данных по счетам.</div>`;
  }

  function setupProfileActions() {
    const reduced = $("#profile-reduced-motion");
    if (reduced) {
      reduced.checked = localStorage.getItem("mirage-reduced-motion") === "1";
      reduced.addEventListener("change", () => {
        localStorage.setItem("mirage-reduced-motion", reduced.checked ? "1" : "0");
        document.documentElement.classList.toggle("mirage-reduced-motion", reduced.checked);
      });
      document.documentElement.classList.toggle("mirage-reduced-motion", reduced.checked);
    }
    document.addEventListener("click", event => {
      const action = event.target.closest("[data-profile-action]");
      if (action) {
        const target = $("#profile-" + action.dataset.profileAction);
        if (target) {
          $$ (".profile-extra").forEach(node => { if (node !== target) node.hidden = true; });
          target.hidden = !target.hidden;
          target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
      if (event.target.closest("[data-profile-close]")) {
        event.target.closest(".profile-extra").hidden = true;
      }
      const jump = event.target.closest("[data-profile-scroll]");
      if (jump) {
        window.setTimeout(() => $("#" + jump.dataset.profileScroll)?.scrollIntoView({ behavior: "smooth", block: "start" }), 180);
      }
      const modeButton = event.target.closest("[data-mobile-mode]");
      if (modeButton) window.MIRAGE_MODES?.set?.(modeButton.dataset.mobileMode);
      const retry = event.target.closest("#news-retry");
      if (retry) loadNews(true);
    });
  }

  function bindFilters() {
    document.addEventListener("click", event => {
      const newsChip = event.target.closest("[data-news-filter]");
      if (newsChip) {
        newsFilter = newsChip.dataset.newsFilter;
        $$ ("[data-news-filter]").forEach(button => button.classList.toggle("active", button === newsChip));
        renderNews();
      }
      const signalChip = event.target.closest("[data-signal-filter]");
      if (signalChip) {
        signalsTier = signalChip.dataset.signalFilter;
        $$ ("[data-signal-filter]").forEach(button => button.classList.toggle("active", button === signalChip));
        renderSignals();
      }
    });
    $("#news-refresh")?.addEventListener("click", () => loadNews(true));
    $("#signals-refresh")?.addEventListener("click", loadSignals);
  }

  function start() {
    installStylesLast();
    ensureAnalyticsOverview();
    ensureNewsPage();
    ensureProfilePage();
    ensurePortfolioTiles();
    addHomeModeSwitch();
    enhanceSignalsPage();
    profileInfo();
    moveModeToolbar();
    buildNav();
    setupProfileActions();
    bindFilters();
    setActiveNav($("main .page.active")?.id || "dashboard");
    window.addEventListener("mirage:pagechange", event => {
      const page = event.detail?.page || "dashboard";
      setActiveNav(page);
      if (page === "news") loadNews();
      if (page === "signals") loadSignals();
      if (page === "markets") loadAnalytics();
      if (page === "profile") { profileInfo(); moveModeToolbar(); syncModeLabel(); }
    });
    document.addEventListener("mirage:modechange", syncModeLabel);
    const modeObserver = new MutationObserver(syncModeLabel);
    modeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-mirage-mode"] });
    loadNews();
    loadSignals();
    window.setInterval(() => {
      if ($("#news")?.classList.contains("active")) loadNews();
      if ($("#signals")?.classList.contains("active")) loadSignals();
    }, 120000);
    console.info("MIRAGE mobile-first shell initialized");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
