
(() => {
  "use strict";

  if (window.__MIRAGE_BRAND_NAV_V4__) return;
  window.__MIRAGE_BRAND_NAV_V4__ = true;

  const BRAND = "MIRAGE";
  const TAGLINE = "SEE BEYOND THE MARKET";
  const LOGO = "/mirage-avatar-512.png";

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
  let pendingFrame = 0;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  function installStyles() {
    if ($("#mirage-brand-nav-styles-v4")) return;

    const style = document.createElement("style");
    style.id = "mirage-brand-nav-styles-v4";

    style.textContent = `
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
        animation:none!important;
      }

      .bottom-nav>.nav-item>small {
        font-size:9px!important;
        letter-spacing:-.15px!important;
      }

      .bottom-nav>.nav-item.active {
        color:#38e5a6!important;
      }

      .bottom-nav>.nav-item.active svg {
        filter:none!important;
      }

      /* V4: one lightweight page transition controller */

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

      main .page:not(.active) {
        display:none!important;
        pointer-events:none!important;
      }

      main .page.active {
        display:block!important;
        position:relative!important;
        opacity:1!important;
        pointer-events:auto!important;
        animation:mirage-page-enter-v4 150ms ease-out both!important;
      }

      @keyframes mirage-page-enter-v4 {
        from { opacity:.82; }
        to { opacity:1; }
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
        main .page.active {
          animation:none!important;
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

    if (!target || !target.classList.contains("page")) {
      return false;
    }

    const pages = document.querySelectorAll("main .page");

    if (!Array.from(pages).includes(target)) {
      return false;
    }

    pages.forEach(page => {
      const active = page === target;

      page.classList.remove("mirage-leaving");
      page.classList.toggle("active", active);
      page.setAttribute(
        "aria-hidden",
        active ? "false" : "true"
      );
    });

    syncNavigation(pageId);

    return true;
  }

  function cancelPendingNavigation() {
    switchToken++;

    if (pendingFrame) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
    }
  }

  function navigate(pageId) {
    const target = document.getElementById(pageId);

    if (
      !target ||
      !target.classList.contains("page") ||
      !target.closest("main")
    ) {
      return false;
    }

    const current = activePageId();

    /* Clicking the current tab cancels an unfinished transition. */
    if (pageId === current) {
      cancelPendingNavigation();
      syncNavigation(current);
      return true;
    }

    cancelPendingNavigation();

    const token = switchToken;

    syncNavigation(pageId);

    pendingFrame = requestAnimationFrame(() => {
      if (token !== switchToken) return;

      pendingFrame = 0;

      const changed = setActivePage(pageId);

      if (!changed) {
        syncNavigation(activePageId());
        return;
      }

      window.dispatchEvent(
        new CustomEvent("mirage:pagechange", {
          detail: { page: pageId }
        })
      );
    });

    if (window.scrollY > 0) {
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
       * app.js still receives the click.
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

    window.addEventListener("mirage:pagechange", event => {
      const page = event.detail?.page;
      if (page) syncNavigation(page);
    });

    window.MIRAGE = {
      name: BRAND,
      tagline: TAGLINE,
      navigate
    };

    console.info("MIRAGE navigation V4 initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, {
      once: true
    });
  } else {
    start();
  }
})();
