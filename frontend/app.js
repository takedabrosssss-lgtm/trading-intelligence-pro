
"use strict";

/*
 * Trading Intelligence PRO 2.0
 * Frontend controller
 */

(() => {
  const tg = window.Telegram?.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();

    try {
      tg.setHeaderColor("#090909");
      tg.setBackgroundColor("#090909");
    } catch (_) {
      // Older Telegram clients may not support these methods.
    }
  }

  const navItems = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");
  const notificationArea = document.getElementById("notifications");

  function notify(message) {
    if (!notificationArea) return;

    notificationArea.textContent = message;
    notificationArea.classList.add("visible");

    window.setTimeout(() => {
      notificationArea.classList.remove("visible");
    }, 3000);
  }

  function openPage(pageName) {
    const target = document.getElementById(pageName);

    if (!target) return;

    pages.forEach((page) => {
      page.classList.toggle("active", page.id === pageName);
    });

    navItems.forEach((item) => {
      const active = item.dataset.page === pageName;
      item.classList.toggle("active", active);

      if (active) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      openPage(item.dataset.page);
    });
  });

  // Navigation from elements with data-open-page.
  document.querySelectorAll("[data-open-page]").forEach((element) => {
    element.addEventListener("click", () => {
      openPage(element.dataset.openPage);
    });
  });

  // Buttons that are not connected to backend functionality yet
  // must not pretend that an operation has been completed.
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", () => {
      const action = element.dataset.action;

      if (action === "refresh") {
        notify("Подключение рыночных данных будет добавлено на следующем этапе.");
      } else {
        notify("Эта функция пока находится в разработке.");
      }
    });
  });

  // Safe initial state.
  const initialPage = document.querySelector(".page.active")
    ? document.querySelector(".page.active").id
    : "dashboard";

  openPage(initialPage);

  // Expose a small controller for later modules.
  window.TradingIntelligence = {
    openPage,
    notify,
    telegram: tg || null
  };

  console.info("Trading Intelligence PRO interface initialized.");
})();
