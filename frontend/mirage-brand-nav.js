
(() => {
  "use strict";

  if (window.__MIRAGE_BRAND_NAV_V3__) return;
  window.__MIRAGE_BRAND_NAV_V3__ = true;

  const BRAND = "MIRAGE";
  const TAGLINE = "SEE BEYOND THE MARKET";
  const LOGO = "/mirage-avatar-512.png";
  const SWITCH_MS = 190;

  const tabs = [
    ["dashboard", "Обзор", "home"],
    ["markets", "Рынки", "markets"],
    ["signals", "Сигналы", "signals"],
    ["strategies", "Стратегии", "strategies"],
    ["portfolio", "Портфель", "portfolio"]
  ];

  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/></svg>',
    markets: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h17M7 15l4-4 3 2 6-7M16 6h4v4"/></svg>',
    signals: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h3l3-8 4 10 3-7h5M17 5h4v4"/></svg>',
    strategies: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7.5 12 12l8-4.5L12 3ZM4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5"/></svg>',
    portfolio: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>'
  };

  let switchToken = 0;
  let switching = false;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  function installStyles() {
    if ($("#mirage-brand-nav-styles-v3")) return;

    const style = document.createElement("style");
    style.id = "mirage-brand-nav-styles-v3";

    style.textContent = `
      /* BRAND */

      .brand-mark {
        width:40px!important;
        height:40px!important;
        padding:0!important;
        overflow:hidden!important;
        border-radius:13px!important;
        border:1px solid rgba(54,235,183,.42)!important;
        background:#030807!important;
        box-shadow:
          0 0 22px rgba(0,220,160,.12),
          inset 0 1px 0 rgba(255,255,255,.18)!important;
      }

      .brand-mark img {
        display:block!important;
        width:100%!important;
        height:100%!important;
        object-fit:cover!important;
        border-radius:inherit!important;
      }

      .brand-copy b {
        color:#f4f8f6!important;
        letter-spacing:2.4px!important;
        font-size:12px!important;
      }

      .brand-copy small {
        color:#7eaaa0!important;
        letter-spacing:1.25px!important;
        font-size:7px!important;
      }

      /* BOTTOM NAVIGATION */

      .bottom-nav {
        display:grid!important;
        grid-template-columns:repeat(5,minmax(0,1fr))!important;
        grid-auto-flow:row!important;
        gap:3px!important;
        width:calc(100% - 24px)!important;
        max-width:560px!important;
        left:50%!important;
        right:auto!important;
        transform:translateX(-50%)!important;
        justify-content:stretch!important;
        align-items:stretch!important;
        box-sizing:border-box!important;
        padding:7px!important;
      }

      .bottom-nav>.nav-item {
        display:flex!important;
        flex-direction:column!important;
        align-items:center!important;
        justify-content:center!important;
        gap:5px!important;
        min-width:0!important;
        width:100%!important;
        max-width:none!important;
        margin:0!important;
        padding:7px 1px 6px!important;
        box-sizing:border-box!important;
        white-space:nowrap!important;
        -webkit-tap-highlight-color:transparent!important;
      }

      .bottom-nav>.nav-item>span {
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
      }

      .bottom-nav>.nav-item svg {
        width:19px!important;
        height:19px!important;
        fill:none!important;
        stroke:currentColor!important;
        stroke-width:1.7!important;
        stroke-linecap:round!important;
        stroke-linejoin:round!important;
      }

      .bottom-nav>.nav-item>small {
        font-size:9px!important;
        letter-spacing:-.15px!important;
      }

      .bottom-nav>.nav-item.active {
        color:#38e5a6!important;
      }

      .bottom-nav>.nav-item.active svg {
        filter:drop-shadow(0 0 5px rgba(56,229,166,.35));
      }

      /* SINGLE NAVIGATION ANIMATION CONTROLLER */

      main {
        opacity:1!important;
        transition:opacity 190ms ease!important;
        will-change:opacity;
      }

      main.mirage-nav-dim {
        opacity:.72!important;
      }

      /*
       * Disable every competing page animation.
       * No absolute positioning, blur, transforms or scaling.
       */

      main .page,
      main .page.active,
      main .page.mirage-leaving {
        animation:none!important;
        transition:none!important;
        transform:none!important;
        filter:none!important;
        will-change:auto!important;
        backface-visibility:visible!important;
      }

      main .page.active {
        display:block!important;
        opacity:1!important;
        position:relative!important;
        pointer-events:auto!important;
      }

      main .page:not(.active) {
        pointer-events:none!important;
      }

      @media(max-width:370px) {
        .bottom-nav>.nav-item>small {
          font-size:8px!important;
        }

        .bottom-nav {
          gap:1px!important;
          padding:5px!important;
        }
      }

      @media(prefers-reduced-motion:reduce) {
        main {
          transition:none!important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function applyBrand() {
    document.title = BRAND;

    const description = $('meta[name="description"]');
    if (description) {
      description.content = "MIRAGE — See beyond the market";
    }

    const appName = $('meta[name="application-name"]');
    if (appName) appName.content = BRAND;

    const theme = $('meta[name="theme-color"]');
    if (theme) theme.content = "#030807";

    const brand = $(".brand");
    if (brand) {
      brand.setAttribute("aria-label", "MIRAGE — на главную");
    }

    const mark = $(".brand-mark");
    if (mark) {
      mark.innerHTML =
        `<img src="${LOGO}" alt="MIRAGE" draggable="false">`;
    }

    const copy = $(".brand-copy");
    if (copy) {
      copy.innerHTML =
        `<b>${BRAND}</b><small>${TAGLINE}</small>`;
    }

    const heading = $("#dashboard .page-intro h1");
    if (heading) heading.textContent = BRAND;

    const eyebrow = $("#dashboard .page-intro .eyebrow");
    if (eyebrow) eyebrow.textContent = TAGLINE;

    document
      .querySelectorAll(".hero-watermark,.placeholder-mark")
      .forEach(el => {
        el.textContent = "M";
      });
  }

  function activePageId() {
    return $("main .page.active")?.id || "dashboard";
  }

  function buildNav() {
    const nav = $(".bottom-nav");
    if (!nav) return;

    const activePage = activePageId();

    nav.innerHTML = tabs.map(([page, label, icon]) => {
      const active = page === activePage;

      return `
        <button
          type="button"
          class="nav-item${active ? " active" : ""}"
          data-page="${page}"
          aria-label="${label}"
          aria-current="${active ? "page" : "false"}">
          <span>${icons[icon]}</span>
          <small>${label}</small>
        </button>
      `;
    }).join("");

    nav.setAttribute("aria-label", "Основная навигация");
  }

  function syncNavigation(pageId) {
    document
      .querySelectorAll(".bottom-nav [data-page]")
      .forEach(button => {
        const active = button.dataset.page === pageId;

        button.classList.toggle("active", active);
        button.setAttribute(
          "aria-current",
          active ? "page" : "false"
        );
      });
  }

  function setActivePage(pageId) {
    const target = document.getElementById(pageId);
    if (!target || !target.classList.contains("page")) return false;

    const pages = [
      ...document.querySelectorAll("main .page")
    ];

    if (!pages.includes(target)) return false;

    pages.forEach(page => {
      const active = page === target;

      page.classList.remove("mirage-leaving");
      page.classList.toggle("active", active);
      page.setAttribute("aria-hidden", active ? "false" : "true");
    });

    syncNavigation(pageId);

    return true;
  }

  function navigate(pageId) {
    const target = document.getElementById(pageId);
    const main = $("main");

    if (
      !main ||
      !target ||
      !target.classList.contains("page")
    ) {
      return false;
    }

    if (activePageId() === pageId) {
      syncNavigation(pageId);
      return true;
    }

    const token = ++switchToken;

    switching = true;
    syncNavigation(pageId);

    /*
     * Dim the content slightly.
     * Keep the document layout intact.
     */

    main.classList.add("mirage-nav-dim");

    window.setTimeout(() => {
      if (token !== switchToken) return;

      setActivePage(pageId);

      /*
       * Restore brightness on the next paint.
       * No forced layout reads or page repositioning.
       */

      requestAnimationFrame(() => {
        if (token !== switchToken) return;

        main.classList.remove("mirage-nav-dim");
        switching = false;

        window.dispatchEvent(
          new CustomEvent("mirage:pagechange", {
            detail: { page: pageId }
          })
        );
      });
    }, SWITCH_MS / 2);

    try {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto"
      });
    } catch (_) {
      window.scrollTo(0, 0);
    }

    try {
      window.Telegram?.WebApp?.HapticFeedback
        ?.selectionChanged?.();
    } catch (_) {}

    return true;
  }

  function bindNavigation() {
    document.addEventListener("click", event => {
      const button = event.target?.closest
        ? event.target.closest("[data-page]")
        : null;

      if (!button) return;

      const pageId = button.dataset.page;

      if (!pageId) return;

      const target = document.getElementById(pageId);

      if (!target || !target.classList.contains("page")) {
        return;
      }

      event.preventDefault();

      /*
       * Do not stop propagation.
       * app.js must still receive the click and load page data.
       */

      navigate(pageId);
    }, true);
  }

  function start() {
    installStyles();
    applyBrand();
    buildNav();
    bindNavigation();

    document.querySelectorAll("main .page").forEach(page => {
      page.setAttribute(
        "aria-hidden",
        page.classList.contains("active") ? "false" : "true"
      );
    });

    /*
     * Keep navigation synchronized if another script
     * changes the active page.
     */

    document.addEventListener("mirage:pagechange", event => {
      const page = event.detail?.page;
      if (page) syncNavigation(page);
    });

    window.MIRAGE = {
      name: BRAND,
      tagline: TAGLINE,
      navigate
    };

    console.info("MIRAGE navigation V3 initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }
})();
            
