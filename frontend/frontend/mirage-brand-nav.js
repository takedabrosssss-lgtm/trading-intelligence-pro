
(() => {
  "use strict";

  if (window.__MIRAGE_BRAND_NAV__) return;
  window.__MIRAGE_BRAND_NAV__ = true;

  const BRAND = "MIRAGE";
  const TAGLINE = "SEE BEYOND THE MARKET";

  const logo = `
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mirage-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset=".48" stop-color="#aebdb7"/>
          <stop offset="1" stop-color="#46534e"/>
        </linearGradient>
        <linearGradient id="mirage-green" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#087c57"/>
          <stop offset=".55" stop-color="#35edaa"/>
          <stop offset="1" stop-color="#c0ffe5"/>
        </linearGradient>
      </defs>
      <path d="M5 35 15 11l9 15 9-15 10 24h-7l-5-12-7 12h-1l-7-12-5 12z"
        fill="url(#mirage-metal)"/>
      <path d="M4 32 Q19 34 29 20 T45 9"
        fill="none" stroke="url(#mirage-green)"
        stroke-width="2.1" stroke-linecap="round"/>
    </svg>
  `;

  const icons = {
    dashboard: '<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
    markets: '<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-8"/></svg>',
    signals: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    strategies: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    portfolio: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>'
  };

  const tabs = [
    ["dashboard", "Обзор"],
    ["markets", "Рынки"],
    ["signals", "Сигналы"],
    ["strategies", "Стратегии"],
    ["portfolio", "Портфель"]
  ];

  function installStyles() {
    if (document.getElementById("mirage-brand-styles")) return;

    const style = document.createElement("style");
    style.id = "mirage-brand-styles";

    style.textContent = `
      :root {
        --ti-green: #35e6a5;
        --ti-red: #ff6375;
        --mirage-black: #030605;
      }

      html, body {
        background-color: #030605 !important;
      }

      body {
        background:
          radial-gradient(ellipse at 50% -15%, rgba(27,95,70,.19), transparent 45%),
          radial-gradient(ellipse at 100% 60%, rgba(12,65,48,.10), transparent 42%),
          #030605 !important;
      }

      .brand-mark {
        display: grid !important;
        place-items: center !important;
        flex: 0 0 46px !important;
        width: 46px !important;
        height: 46px !important;
        padding: 5px !important;
        border-radius: 15px !important;
        overflow: hidden !important;
        background: linear-gradient(145deg,#27332e,#080c0a) !important;
        border: 1px solid rgba(180,255,220,.25) !important;
        box-shadow:
          inset 0 1px 2px rgba(255,255,255,.22),
          0 0 22px rgba(32,220,145,.09),
          0 8px 22px #000b !important;
      }

      .brand-mark svg {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
      }

      .brand-copy b {
        color: #f4faf7 !important;
        font-size: 13px !important;
        font-weight: 800 !important;
        letter-spacing: 3px !important;
      }

      .brand-copy small {
        color: #8d9c95 !important;
        font-size: 8px !important;
        letter-spacing: 1.3px !important;
      }

      .bottom-nav {
        display: grid !important;
        grid-template-columns: repeat(5,minmax(0,1fr)) !important;
        gap: 3px !important;
        width: calc(100% - 20px) !important;
        max-width: 580px !important;
        left: 50% !important;
        right: auto !important;
        transform: translateX(-50%) !important;
        padding: 7px 6px max(8px,env(safe-area-inset-bottom)) !important;
        border: 1px solid rgba(190,255,220,.10) !important;
        border-radius: 20px !important;
        background: rgba(5,10,8,.94) !important;
        backdrop-filter: blur(25px) saturate(150%) !important;
        -webkit-backdrop-filter: blur(25px) saturate(150%) !important;
        box-shadow: 0 12px 38px #000b, inset 0 1px #ffffff0b !important;
        z-index: 1000 !important;
      }

      .bottom-nav .nav-item {
        display: flex !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        padding: 7px 1px !important;
        border: 0 !important;
        border-radius: 13px !important;
        background: transparent !important;
        color: #7f8b85 !important;
        transition: color .2s ease, background .2s ease !important;
      }

      .bottom-nav .nav-item span {
        display: grid !important;
        place-items: center !important;
        width: 25px !important;
        height: 25px !important;
      }

      .bottom-nav .nav-item svg {
        display: block !important;
        width: 23px !important;
        height: 23px !important;
        fill: none !important;
        stroke: currentColor !important;
        stroke-width: 1.8 !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
      }

      .bottom-nav .nav-item small {
        display: block !important;
        max-width: 100% !important;
        font-size: clamp(7px,2vw,9px) !important;
        line-height: 1.1 !important;
        white-space: nowrap !important;
        color: inherit !important;
      }

      .bottom-nav .nav-item.active {
        color: #35e6a5 !important;
        background: linear-gradient(145deg,rgba(35,225,155,.13),rgba(35,225,155,.025)) !important;
        box-shadow: inset 0 0 0 1px rgba(53,230,165,.12) !important;
      }

      .bottom-nav .nav-item.active svg {
        filter: drop-shadow(0 0 5px rgba(53,230,165,.45));
      }

      .page {
        display: none !important;
      }

      .page.active {
        display: block !important;
        animation: miragePageIn .24s ease both;
      }

      @keyframes miragePageIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .hero-card,
      .chart-panel,
      .strategy-card,
      .status-card,
      .portfolio-total,
      .account-row,
      .history-row,
      .market-row {
        border-color: rgba(190,255,220,.12) !important;
      }

      .hero-card {
        box-shadow:
          inset 0 1px rgba(255,255,255,.15),
          0 18px 45px rgba(0,0,0,.55),
          0 0 35px rgba(20,180,120,.055) !important;
      }

      .positive, .hero-pnl {
        color: #35e6a5 !important;
      }

      .negative {
        color: #ff6375 !important;
      }

      @media(max-width:380px) {
        .bottom-nav {
          width: calc(100% - 12px) !important;
          gap: 1px !important;
          padding-inline: 3px !important;
        }

        .bottom-nav .nav-item {
          gap: 4px !important;
        }

        .bottom-nav .nav-item small {
          font-size: 7px !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function applyBrand() {
    document.title = BRAND;

    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.content = "MIRAGE — See beyond the market";
    }

    const appName = document.querySelector('meta[name="application-name"]');
    if (appName) appName.content = BRAND;

    const brand = document.querySelector(".brand");
    if (brand) brand.setAttribute("aria-label", "MIRAGE — на главную");

    const mark = document.querySelector(".brand-mark");
    if (mark) mark.innerHTML = logo;

    const copy = document.querySelector(".brand-copy");
    if (copy) {
      copy.innerHTML = `<b>${BRAND}</b><small>${TAGLINE}</small>`;
    }

    const heading = document.querySelector("#dashboard .page-intro h1");
    if (heading) heading.textContent = BRAND;

    document.querySelectorAll(".hero-watermark,.placeholder-mark").forEach(el => {
      el.textContent = "M";
    });

    document.querySelectorAll("[data-brand-name]").forEach(el => {
      el.textContent = BRAND;
    });
  }

  function buildNavigation() {
    const nav = document.querySelector(".bottom-nav");
    if (!nav) return;

    nav.innerHTML = tabs.map(([page, label]) => `
      <button type="button"
        class="nav-item ${page === "dashboard" ? "active" : ""}"
        data-page="${page}"
        aria-label="${label}">
        <span>${icons[page]}</span>
        <small>${label}</small>
      </button>
    `).join("");

    nav.setAttribute("aria-label", "Основная навигация");
  }

  function navigate(page) {
    const target = document.getElementById(page);
    if (!target || !target.classList.contains("page")) return;

    document.querySelectorAll(".page").forEach(section => {
      section.classList.toggle("active", section === target);
    });

    document.querySelectorAll(".bottom-nav [data-page]").forEach(button => {
      const active = button.dataset.page === page;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    // Обновляем логотип после старых визуальных обработчиков.
    setTimeout(applyBrand, 80);
  }

  function start() {
    installStyles();
    applyBrand();
    buildNavigation();

    document.addEventListener("click", event => {
      const control = event.target.closest("[data-page]");
      if (!control) return;

      const page = control.dataset.page;
      if (!document.getElementById(page)) return;

      event.preventDefault();
      navigate(page);
    });

    const initial = document.querySelector(".page.active")?.id || "dashboard";
    navigate(initial);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.MIRAGE = {
    name: BRAND,
    tagline: TAGLINE,
    navigate
  };
})();
