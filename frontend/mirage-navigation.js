
/* MIRAGE 4.1 — Navigation Overhaul
   Fast section navigation and global function search.
   UI-only, non-invasive. */
(() => {
  "use strict";

  if (window.__MIRAGE_NAV_41__) return;
  window.__MIRAGE_NAV_41__ = true;

  const PAGES = {
    dashboard: "Обзор",
    markets: "Рынки",
    signals: "Сигналы",
    strategies: "Стратегии",
    portfolio: "Портфель"
  };

  const MAP = {
    dashboard: [
      ["Капитал и баланс", ".hero-card"],
      ["Рынок сейчас", "#dashboard-markets"],
      ["Состояние системы", ".status-grid"],
      ["Command Center", "#mirage4-command"],
      ["System Health", "#m4-health-list"]
    ],

    markets: [
      ["Список рынков", "#markets-list"],
      ["График цены", ".chart-panel"]
    ],

    signals: [
      ["Параметры анализа", ".signal-selector"],
      ["Результат анализа", "#analysis-result"],
      ["Архив сигналов", "#mirage4-signal-archive"],
      ["Фильтры архива", "#m4-signal-filter"],
      ["Signal Intelligence", "#m4-signals-output"]
    ],

    strategies: [
      ["Счета стратегий", "#strategy-list"],
      ["Research Studio", ".mi-panel"],
      ["Анализ рынка", "#mi-analyze"],
      ["Backtest", "#mi-backtest"],
      ["Сравнение стратегий", "#mi-compare"],
      ["Walk-forward", "#mi-research"],
      ["Cross-Asset Research", "#mi-universe"],
      ["Глубокое исследование", "#mi-deep"],
      ["Robustness Engine", "#mr-run"]
    ],

    portfolio: [
      ["Общий баланс", ".portfolio-total"],
      ["Статистика портфеля", "#portfolio-stats"],
      ["Открытые позиции", "#positions-list"],
      ["Счета стратегий", "#portfolio-accounts"],
      ["Последние сделки", "#history-list"],
      ["Trade Journal", "#mirage4-journal"],
      ["Фильтр журнала", "#m4-journal-filter"],
      ["История сделок", "#m4-journal-output"]
    ]
  };

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  let counter = 0;
  let pending = false;

  function currentPage() {
    return $(".page.active")?.id || "dashboard";
  }

  function anchorFor(element) {
    if (!element.id) {
      element.id = `mirage41-anchor-${++counter}`;
    }
    return element.id;
  }

  function textFor(element, fallback) {
    const heading = $("h1,h2,h3,h4", element);
    const value = (heading?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    return value && value.length < 80
      ? value
      : fallback;
  }

  function find(page, selector) {
    const root = document.getElementById(page);
    if (!root) return null;

    const node = $(selector, root);

    if (!node || node.closest(".mirage41-nav")) {
      return null;
    }

    return node;
  }

  function entriesFor(page) {
    const found = [];
    const seen = new Set();

    for (const [label, selector] of MAP[page] || []) {
      const element = find(page, selector);

      if (!element || seen.has(element)) continue;

      seen.add(element);

      found.push({
        page,
        label,
        title: textFor(element, label),
        id: anchorFor(element)
      });
    }

    const root = document.getElementById(page);

    if (root) {
      const extraSelectors =
        ".section-title,.m4-panel,.mi-panel,.chart-panel";

      for (const element of $$(extraSelectors, root)) {
        if (seen.has(element)) continue;
        if (element.closest(".mirage41-nav")) continue;

        const label = textFor(element, "");

        if (!label) continue;

        seen.add(element);

        found.push({
          page,
          label: label.slice(0, 38),
          title: label,
          id: anchorFor(element)
        });
      }
    }

    return found;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function open(entry) {
    if (!entry) return;

    if (currentPage() !== entry.page) {
      $(`[data-page="${entry.page}"]`)?.click();
    }

    window.setTimeout(() => {
      const target = document.getElementById(entry.id);

      if (!target) return;

      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      target.classList.remove("mirage41-focus");
      void target.offsetWidth;
      target.classList.add("mirage41-focus");

      window.setTimeout(() => {
        target.classList.remove("mirage41-focus");
      }, 1400);
    }, 120);
  }

  function drawTabs() {
    const host = $("#mirage41-links");
    if (!host) return;

    const page = currentPage();
    const safePage = PAGES[page] ? page : "dashboard";
    const items = entriesFor(safePage);

    $("#mirage41-page-name").textContent =
      (PAGES[safePage] || "Обзор").toUpperCase();

    host.innerHTML = items.length
      ? items.map((item, index) => `
        <button
          type="button"
          class="mirage41-link"
          data-nav-entry="${index}">
          <span class="mirage41-link-index">
            ${String(index + 1).padStart(2, "0")}
          </span>
          <span>${esc(item.label)}</span>
          <i aria-hidden="true">↗</i>
        </button>
      `).join("")
      : `<span class="mirage41-empty">
           Разделы загружаются…
         </span>`;

    $$("[data-nav-entry]", host).forEach(button => {
      button.addEventListener("click", () => {
        open(items[Number(button.dataset.navEntry)]);
      });
    });
  }

  function drawSearch(query) {
    const results = $("#mirage41-results");
    const links = $("#mirage41-links");

    if (!results || !links) return;

    const q = query.trim().toLocaleLowerCase("ru");

    if (!q) {
      results.hidden = true;
      links.hidden = false;
      return;
    }

    const all = Object.keys(PAGES).flatMap(entriesFor);

    const matches = all.filter(item => {
      const text = [
        item.label,
        item.title,
        PAGES[item.page]
      ].join(" ").toLocaleLowerCase("ru");

      return text.includes(q);
    }).slice(0, 14);

    results.hidden = false;
    links.hidden = true;

    results.innerHTML = matches.length
      ? matches.map((item, index) => `
        <button
          type="button"
          class="mirage41-result"
          data-search-result="${index}">
          <span>
            <b>${esc(item.label)}</b>
            <small>${esc(PAGES[item.page])}</small>
          </span>
          <i aria-hidden="true">↗</i>
        </button>
      `).join("")
      : `<div class="mirage41-no-results">
           Ничего не найдено. Попробуй другое название.
         </div>`;

    $$("[data-search-result]", results).forEach(button => {
      button.addEventListener("click", () => {
        const item = matches[
          Number(button.dataset.searchResult)
        ];

        $("#mirage41-search").value = "";
        drawSearch("");
        open(item);
      });
    });
  }

  function schedule() {
    if (pending) return;

    pending = true;

    requestAnimationFrame(() => {
      pending = false;
      drawTabs();
    });
  }

  function mount() {
    const topbar = $(".topbar");

    if (!topbar || $(".mirage41-nav")) return;

    const bar = document.createElement("section");

    bar.className = "mirage41-nav";
    bar.setAttribute(
      "aria-label",
      "Быстрая навигация"
    );

    bar.innerHTML = `
      <div class="mirage41-nav-head">
        <div class="mirage41-nav-title">
          <span class="mirage41-dot"></span>
          <b>QUICK FIND</b>
          <small id="mirage41-page-name">ОБЗОР</small>
        </div>

        <label class="mirage41-search-wrap">
          <span aria-hidden="true">⌕</span>

          <input
            id="mirage41-search"
            type="search"
            autocomplete="off"
            placeholder="Найти функцию или раздел…"
            aria-label="Найти функцию или раздел">

          <kbd aria-hidden="true">↵</kbd>
        </label>
      </div>

      <div
        class="mirage41-links"
        id="mirage41-links">
      </div>

      <div
        class="mirage41-results"
        id="mirage41-results"
        hidden>
      </div>
    `;

    topbar.insertAdjacentElement("afterend", bar);

    const input = $("#mirage41-search");

    input.addEventListener("input", () => {
      drawSearch(input.value);
    });

    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        $("#mirage41-results button")?.click();
      }

      if (event.key === "Escape") {
        input.value = "";
        drawSearch("");
        input.blur();
      }
    });

    document.addEventListener("click", event => {
      const page = event.target
        .closest("[data-page]")?.dataset.page;

      if (PAGES[page]) {
        window.setTimeout(schedule, 80);
      }
    });

    document.addEventListener(
      "mirage:modechange",
      schedule
    );

    const main = $("main");

    if (main) {
      const observer = new MutationObserver(schedule);

      observer.observe(main, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "id"]
      });
    }

    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      mount,
      { once: true }
    );
  } else {
    mount();
  }
})();
 
