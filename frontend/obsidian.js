
(() => {
  "use strict";
  if (window.__TI_OBSIDIAN_V2__) return;
  window.__TI_OBSIDIAN_V2__ = true;

  const css = `
  :root {
    color-scheme: dark;
    --obs-bg: #030405;
    --obs-panel: #101315;
    --obs-line: rgba(255,255,255,.105);
    --obs-muted: #8d9693;
    --obs-text: #f5f8f6;
    --obs-green: #35e59b;
    --obs-red: #ff5968;
    --gold: #aeb7b4;
    --gold2: #e5ebe8;
    --green: #35e59b;
    --red: #ff5968;
  }

  html, body {
    background: #030405 !important;
    color: var(--obs-text) !important;
  }

  body {
    position: relative;
    isolation: isolate;
    overflow-x: hidden;
    background:
      radial-gradient(ellipse at 50% -20%, #252b2b 0%, #0a0d0e 34%, #030405 72%) !important;
  }

  body:before {
    content: "";
    position: fixed;
    inset: -12%;
    z-index: -2;
    pointer-events: none;
    background:
      radial-gradient(ellipse at 15% 20%, rgba(190,205,199,.13), transparent 28%),
      radial-gradient(ellipse at 85% 12%, rgba(150,165,160,.12), transparent 26%),
      radial-gradient(ellipse at 78% 80%, rgba(105,122,116,.10), transparent 29%),
      radial-gradient(ellipse at 20% 88%, rgba(255,255,255,.045), transparent 26%);
    filter: blur(28px);
    animation: obsAmbient 18s ease-in-out infinite alternate;
  }

  body:after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    opacity: .14;
    background-image:
      linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.014) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: linear-gradient(to bottom, black, transparent 85%);
  }

  @keyframes obsAmbient {
    0% { transform: translate3d(-1%,0,0) scale(1); }
    100% { transform: translate3d(1%,2%,0) scale(1.06); }
  }

  .obs-orbs {
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    overflow: hidden;
    perspective: 900px;
  }

  .obs-orb {
    position: absolute;
    border-radius: 50%;
    background:
      radial-gradient(circle at 28% 22%,
        rgba(255,255,255,.58) 0,
        rgba(255,255,255,.18) 5%,
        rgba(125,140,136,.18) 17%,
        rgba(25,31,31,.9) 46%,
        rgba(2,4,5,.98) 72%);
    box-shadow:
      inset -22px -28px 48px rgba(0,0,0,.9),
      inset 10px 12px 24px rgba(255,255,255,.13),
      0 24px 70px rgba(0,0,0,.62),
      0 0 42px rgba(205,220,214,.055);
    filter: saturate(.55);
  }

  .obs-orb:after {
    content: "";
    position: absolute;
    inset: 8% 12% auto auto;
    width: 38%;
    height: 18%;
    border-radius: 50%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent);
    filter: blur(9px);
    transform: rotate(-28deg);
  }

  .obs-orb.one {
    width: 190px;
    height: 190px;
    right: -65px;
    top: 13%;
    animation: obsFloatA 17s ease-in-out infinite;
  }

  .obs-orb.two {
    width: 112px;
    height: 112px;
    left: -44px;
    top: 47%;
    animation: obsFloatB 21s ease-in-out infinite;
  }

  .obs-orb.three {
    width: 250px;
    height: 250px;
    right: 10%;
    bottom: -170px;
    animation: obsFloatC 24s ease-in-out infinite;
  }

  .obs-orb.four {
    width: 64px;
    height: 64px;
    left: 55%;
    top: 28%;
    opacity: .55;
    animation: obsFloatB 15s ease-in-out infinite reverse;
  }

  @keyframes obsFloatA {
    0%,100% { transform: translate3d(0,0,0) rotate(0) scale(1); }
    50% { transform: translate3d(-34px,42px,35px) rotate(18deg) scale(1.08); }
  }

  @keyframes obsFloatB {
    0%,100% { transform: translate3d(0,0,0) rotate(0); }
    50% { transform: translate3d(26px,-34px,22px) rotate(-22deg); }
  }

  @keyframes obsFloatC {
    0%,100% { transform: translate3d(0,0,0) scale(1); }
    50% { transform: translate3d(-45px,-38px,0) scale(1.1); }
  }

  .app-shell {
    position: relative;
    z-index: 1;
    max-width: 1120px;
  }

  .topbar, .bottom-nav {
    background: rgba(5,7,8,.82) !important;
    border-color: rgba(255,255,255,.1) !important;
    backdrop-filter: blur(28px) saturate(155%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(155%) !important;
    box-shadow:
      0 10px 35px rgba(0,0,0,.34),
      inset 0 1px rgba(255,255,255,.045) !important;
  }

  .brand-mark {
    width: 43px !important;
    height: 43px !important;
    border-radius: 14px !important;
    border: 1px solid rgba(235,244,240,.28) !important;
    background: radial-gradient(circle at 28% 18%, #68716e 0, #242b29 28%, #090c0d 72%) !important;
    box-shadow:
      inset 0 1px 2px #fff7,
      inset -7px -9px 18px #000c,
      0 7px 22px #000b !important;
    color: #f7faf8 !important;
    font-size: 23px !important;
    letter-spacing: -5px !important;
  }

  .brand-mark i {
    background: linear-gradient(180deg,#fff,#6d7773) !important;
    box-shadow: 0 0 10px #fff7 !important;
  }

  .brand-copy em { color: #dce4e0 !important; }
  .brand-copy small { color: #8d9793 !important; }

  .icon-btn {
    color: #e8eeeb !important;
    border-color: #ffffff20 !important;
    background: linear-gradient(145deg,#202625,#090c0d) !important;
    box-shadow: inset 0 1px #ffffff20, 0 5px 14px #0009 !important;
  }

  main { padding-top: 25px !important; }

  .eyebrow, .overline, .hero-top .overline {
    color: #aeb8b3 !important;
    letter-spacing: 1.7px !important;
  }

  h1, h2, h3, .hero-balance, .strategy-balance, .portfolio-total b {
    color: #f5f8f6 !important;
  }

  .subtle, .hero-metrics span, .coin-sub {
    color: #929c98 !important;
  }

  .hero-card,
  .portfolio-total,
  .strategy-summary,
  .strategy-card,
  .status-card,
  .mini-market,
  .chart-panel,
  .analysis-card,
  .analysis-placeholder,
  .position-card,
  .stat-box,
  .account-row,
  .history-row,
  .risk-note,
  .ti-kpi,
  .ti-equity,
  .signal-selector {
    background: linear-gradient(145deg,rgba(32,39,37,.94),rgba(8,12,12,.97)) !important;
    border: 1px solid rgba(235,245,240,.12) !important;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.12),
      inset 0 -1px 0 rgba(0,0,0,.7),
      0 18px 42px rgba(0,0,0,.42) !important;
    backdrop-filter: blur(18px) saturate(135%) !important;
    -webkit-backdrop-filter: blur(18px) saturate(135%) !important;
  }

  .hero-card {
    border-radius: 25px !important;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 84% 4%,rgba(255,255,255,.16),transparent 35%),
      linear-gradient(135deg,#252d2b 0%,#111716 48%,#080b0c 100%) !important;
  }

  .hero-card:before {
    content: "";
    position: absolute;
    width: 270px;
    height: 270px;
    right: -95px;
    top: -135px;
    border-radius: 50%;
    background: radial-gradient(circle at 28% 25%,
      #ffffff65 0,
      rgba(200,214,207,.18) 8%,
      rgba(110,126,119,.12) 28%,
      transparent 68%);
    box-shadow: inset -20px -24px 42px #0009;
    animation: obsHeroOrb 13s ease-in-out infinite;
    pointer-events: none;
  }

  .hero-card:after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(112deg,transparent 20%,rgba(255,255,255,.035) 43%,transparent 62%);
    transform: translateX(-100%);
    animation: obsSheen 9s ease-in-out infinite;
  }

  @keyframes obsHeroOrb {
    0%,100% { transform: translate3d(0,0,0) rotate(0); }
    50% { transform: translate3d(-16px,18px,0) rotate(14deg); }
  }

  @keyframes obsSheen {
    0%,70%,100% { transform: translateX(-100%); }
    85% { transform: translateX(100%); }
  }

  .hero-watermark { color: rgba(230,240,235,.035) !important; }
  .hero-balance { text-shadow: 0 0 28px rgba(255,255,255,.13) !important; }

  .hero-pnl, .positive, .nav-item.active { color: var(--obs-green) !important; }
  .negative { color: var(--obs-red) !important; }

  .paper-tag, .live-pill {
    color: #d4ddd8 !important;
    background: linear-gradient(145deg,#ffffff12,#ffffff04) !important;
    border: 1px solid #ffffff20 !important;
  }

  .live-pill i, .connection i, .status-dot.good {
    background: var(--obs-green) !important;
    box-shadow: 0 0 12px #35e59b99 !important;
  }

  .text-btn { color: #dce5e0 !important; }

  .market-row {
    border: 1px solid #ffffff12 !important;
    background: linear-gradient(110deg,#1b2220,#0b0f0e) !important;
    border-radius: 17px !important;
    box-shadow: inset 0 1px #ffffff0b, 0 8px 20px #0005 !important;
  }

  .market-row.selected, .market-row:hover {
    border-color: #35e59b70 !important;
    background: linear-gradient(110deg,#1c2c25,#0d1511) !important;
  }

  .coin-icon {
    width: 43px !important;
    height: 43px !important;
    border-radius: 50% !important;
    background: radial-gradient(circle at 30% 25%,#39413e,#111615 72%) !important;
    border: 1px solid #ffffff22 !important;
    box-shadow: inset 0 1px #ffffff2b, 0 5px 13px #0009 !important;
    color: transparent !important;
  }

  .coin-icon:after {
    width: 31px !important;
    height: 31px !important;
  }

  .status-icon {
    background: linear-gradient(145deg,#29312e,#0b0f0e) !important;
    color: #dfe8e3 !important;
    border: 1px solid #ffffff18 !important;
  }

  .bottom-nav {
    position: fixed !important;
    left: 12px !important;
    right: 12px !important;
    bottom: max(10px,env(safe-area-inset-bottom)) !important;
    width: auto !important;
    max-width: 700px !important;
    margin: auto !important;
    padding: 8px 7px !important;
    border: 1px solid rgba(255,255,255,.14) !important;
    border-radius: 23px !important;
    display: grid !important;
    grid-template-columns: repeat(5,minmax(0,1fr)) !important;
    gap: 5px !important;
    box-shadow: 0 18px 55px #000c,inset 0 1px #ffffff18 !important;
  }

  .nav-item {
    min-width: 0 !important;
    min-height: 58px !important;
    padding: 7px 2px 6px !important;
    border: 1px solid transparent !important;
    border-radius: 16px !important;
    background: transparent !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 5px !important;
    color: #89938f !important;
    transition: transform .22s ease,background .22s ease,border-color .22s ease,box-shadow .22s ease !important;
  }

  .nav-item span {
    width: 29px !important;
    height: 27px !important;
    display: grid !important;
    place-items: center !important;
    font-size: 0 !important;
    line-height: 1 !important;
    color: inherit !important;
  }

  .nav-item span svg {
    width: 24px;
    height: 24px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .nav-item small {
    font-size: 9px !important;
    font-weight: 700 !important;
    letter-spacing: .15px !important;
    color: inherit !important;
    white-space: nowrap;
  }

  .nav-item.active {
    background: linear-gradient(145deg,rgba(255,255,255,.16),rgba(255,255,255,.035)) !important;
    border-color: rgba(255,255,255,.15) !important;
    color: #43e9a2 !important;
    box-shadow:
      inset 0 1px #ffffff25,
      0 5px 18px #0009,
      0 0 18px #35e59b10 !important;
    transform: translateY(-2px);
  }

  .nav-item.active span svg {
    filter: drop-shadow(0 0 7px #35e59b66);
  }

  .primary-btn {
    background: linear-gradient(145deg,#eaf1ed,#9aa7a0) !important;
    color: #090d0b !important;
    border: 1px solid #ffffff70 !important;
    box-shadow: inset 0 1px #fff,0 8px 18px #0008 !important;
  }

  .analysis-placeholder { border-style: solid !important; }

  .placeholder-mark {
    border-color: #ffffff30 !important;
    color: #e9efeb !important;
    background: linear-gradient(145deg,#2b3430,#0b100e) !important;
    box-shadow: inset 0 1px #ffffff2b,0 8px 22px #0008 !important;
  }

  .score-track i {
    background: linear-gradient(90deg,#159e69,#42efaa) !important;
  }

  .intervals button.active {
    background: #35e59b17 !important;
    border-color: #35e59b55 !important;
    color: #55eaaa !important;
  }

  .ti-kpi strong.green { color: var(--obs-green) !important; }
  .ti-kpi strong.red { color: var(--obs-red) !important; }

  .ti-equity .curve {
    stroke: var(--obs-green) !important;
    filter: drop-shadow(0 0 6px #35e59b88) !important;
  }

  .ti-equity .gridline { stroke: #ffffff14 !important; }
  .market-preview { gap: 11px !important; }

  @media(max-width:600px) {
    main { padding: 20px 15px 30px !important; }
    .topbar { height: 66px !important; padding: 0 16px !important; }
    .brand-copy b { font-size: 10px !important; }
    .bottom-nav { left: 8px !important; right: 8px !important; padding: 7px 5px !important; }
    .nav-item { min-height: 56px !important; }
    .nav-item small { font-size: 8px !important; }
    .obs-orb.one { width: 145px; height: 145px; right: -65px; }
    .obs-orb.three { width: 190px; height: 190px; }
    .hero-card { padding: 21px 18px !important; }
    .hero-balance { font-size: 37px !important; }
    .market-preview { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
  }

  @media(prefers-reduced-motion:reduce) {
    *,*:before,*:after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }
  }
  `;

  const style = document.createElement("style");
  style.id = "ti-obsidian-v2-style";
  style.textContent = css;
  document.head.appendChild(style);

  function addOrbs() {
    if (document.querySelector(".obs-orbs")) return;

    const layer = document.createElement("div");
    layer.className = "obs-orbs";
    layer.setAttribute("aria-hidden", "true");

    ["one","two","three","four"].forEach(n => {
      const orb = document.createElement("i");
      orb.className = "obs-orb " + n;
      layer.appendChild(orb);
    });

    document.body.prepend(layer);
  }

  const icons = {
    dashboard: '<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
    markets: '<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h17"/><path d="m7 15 4-5 3 2 5-7"/><path d="M16 5h3v3"/></svg>',
    signals: '<svg viewBox="0 0 24 24"><path d="M3 12h3l3-8 5 16 3-8h4"/></svg>',
    strategies: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 8v8M12 8v8M16 8v8"/></svg>',
    portfolio: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M8 5V3h8v2M3 10h18M15 14h2"/></svg>'
  };

  function restyleBrand() {
    const mark = document.querySelector(".brand-mark");
    if (mark && !mark.dataset.obsidian) {
      mark.dataset.obsidian = "1";
      mark.innerHTML = '<span style="font-size:21px;letter-spacing:-4px">TI</span><i></i>';
    }
  }

  function restyleNav() {
    document.querySelectorAll(".nav-item").forEach(btn => {
      const key = btn.dataset.page;
      const span = btn.querySelector("span");

      if (span && icons[key] && !btn.dataset.obsidian) {
        span.innerHTML = icons[key];
        btn.dataset.obsidian = "1";
      }
    });
  }

  const $ = (s,r=document) => r.querySelector(s);

  const money = v => Number(v || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function addDashboardBlocks() {
    const hero = $(".hero-card");
    if (!hero || $("#ti-kpi-grid")) return;

    hero.insertAdjacentHTML("afterend", `
      <div class="ti-kpi-grid" id="ti-kpi-grid">
        <div class="ti-kpi">
          <span>WIN RATE</span>
          <strong id="ti-winrate">—</strong>
        </div>
        <div class="ti-kpi">
          <span>P&amp;L · 24 ЧАСА</span>
          <strong id="ti-pnl24">—</strong>
        </div>
      </div>
      <section class="ti-equity">
        <div class="ti-equity-head">
          <b>Динамика капитала</b>
          <small>ПО ЗАКРЫТЫМ СДЕЛКАМ</small>
        </div>
        <div id="ti-equity-chart">
          <div class="loading-state">Загружаем историю сделок…</div>
        </div>
      </section>
    `);
  }

  function drawCurve(trades, initial, equity) {
    const host = $("#ti-equity-chart");
    if (!host) return;

    const ordered = [...trades]
      .filter(t => t.closed_at && Number.isFinite(Number(t.net_pnl)))
      .sort((a,b) => new Date(a.closed_at) - new Date(b.closed_at));

    if (!ordered.length) {
      host.innerHTML = '<div class="empty-message">График появится после первых закрытых сделок</div>';
      return;
    }

    let value = Number(initial) || 10000;
    const values = [value];

    ordered.forEach(t => {
      value += Number(t.net_pnl) || 0;
      values.push(value);
    });

    const last = Number(equity);
    if (Number.isFinite(last) && Math.abs(last - values[values.length - 1]) > .01) {
      values.push(last);
    }

    const w = 600, h = 120, pad = 8;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);

    const pts = values.map((v,i) => [
      pad + i * (w - 2 * pad) / Math.max(values.length - 1, 1),
      h - pad - (v - min) / range * (h - 2 * pad)
    ]);

    const path = pts.map((p,i) =>
      (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)
    ).join(" ");

    const area = path +
      ` L ${pts[pts.length-1][0]} ${h} L ${pts[0][0]} ${h} Z`;

    host.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Динамика капитала">
        <defs>
          <linearGradient id="tiArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#35e59b" stop-opacity=".28"/>
            <stop offset="1" stop-color="#35e59b" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path class="gridline" d="M0 30H600 M0 60H600 M0 90H600"/>
        <path class="area" d="${area}"/>
        <path class="curve" d="${path}"/>
      </svg>
    `;
  }

  async function refreshStats() {
    try {
      const headers = {Accept:"application/json"};
      const init = window.Telegram?.WebApp?.initData || "";

      if (init) headers["X-Telegram-Init-Data"] = init;

      const [pRes,hRes] = await Promise.all([
        fetch("/api/portfolio",{headers,cache:"no-store"}),
        fetch("/api/history?limit=200",{headers,cache:"no-store"})
      ]);

      if (!pRes.ok || !hRes.ok) throw new Error("stats unavailable");

      const portfolio = await pRes.json();
      const history = await hRes.json();
      const trades = history.trades || [];
      const closed = trades.filter(t => t.closed_at);

      const wins = closed.filter(t => Number(t.net_pnl) > 0).length;
      const rate = closed.length ? wins / closed.length * 100 : null;
      const cutoff = Date.now() - 86400000;

      const pnl24 = closed
        .filter(t => new Date(t.closed_at).getTime() >= cutoff)
        .reduce((sum,t) => sum + (Number(t.net_pnl) || 0), 0);

      const wr = $("#ti-winrate");
      const pn = $("#ti-pnl24");

      if (wr) wr.textContent = rate === null ? "—" : rate.toFixed(1) + "%";

      if (pn) {
        pn.textContent = (pnl24 >= 0 ? "+" : "") + money(pnl24);
        pn.className = pnl24 >= 0 ? "green" : "red";
      }

      drawCurve(closed, portfolio.initial_capital, portfolio.equity);

    } catch(e) {
      const host = $("#ti-equity-chart");
      if (host) host.innerHTML = '<div class="empty-message">Статистика временно недоступна</div>';
    }
  }

  function decorateCoins() {
    document.querySelectorAll(".coin-icon").forEach(el => {
      const coin = el.textContent.trim().toUpperCase();
      el.dataset.coin = coin;
    });
  }

  function run() {
    addOrbs();
    restyleBrand();
    restyleNav();
    addDashboardBlocks();
    decorateCoins();
    refreshStats();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  document.addEventListener("click", e => {
    if (e.target.closest('[data-page="dashboard"]')) 
      {
      setTimeout(() => {
        addOrbs();
        restyleBrand();
        restyleNav();
        addDashboardBlocks();
        decorateCoins();
        refreshStats();
      }, 80);
    }
  });

  setInterval(refreshStats, 60000);
})();
