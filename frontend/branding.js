(() => {
  "use strict";

  const BRAND = "QORIX";
  const TAGLINE = "ELITE QUANT INTELLIGENCE";
  const LOGO = "/qorix-avatar-512.png";

  function applyBrand() {
    document.title = BRAND;

    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute("content", `${BRAND} — ${TAGLINE}`);
    }

    const applicationName = document.querySelector('meta[name="application-name"]');
    if (applicationName) {
      applicationName.setAttribute("content", BRAND);
    }

    const brandButton = document.querySelector(".brand");
    if (brandButton) {
      brandButton.setAttribute("aria-label", `${BRAND} — на главную`);
    }

    const mark = document.querySelector(".brand-mark");
    if (mark) {
      mark.innerHTML = `<img src="${LOGO}" alt="" draggable="false">`;
      mark.setAttribute("aria-label", BRAND);
    }

    const copy = document.querySelector(".brand-copy");
    if (copy) {
      copy.innerHTML = `
        <b>${BRAND}</b>
        <small>${TAGLINE}</small>
      `;
    }

    const dashboardHeading = document.querySelector(
      "#dashboard .page-intro h1"
    );
    if (dashboardHeading) {
      dashboardHeading.textContent = BRAND;
    }

    document.querySelectorAll(".hero-watermark").forEach((node) => {
      node.textContent = "QX";
    });

    document.querySelectorAll(".placeholder-mark").forEach((node) => {
      node.textContent = "QX";
    });

    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = BRAND;
    });
  }

  function installStyles() {
    if (document.querySelector("#qorix-brand-styles")) return;

    const style = document.createElement("style");
    style.id = "qorix-brand-styles";

    style.textContent = `
      .brand-mark {
        overflow: hidden !important;
        padding: 0 !important;
        background: #050609 !important;
        border: 1px solid rgba(220, 240, 255, .28) !important;
      }

      .brand-mark img {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        border-radius: inherit !important;
      }

      .brand-copy {
        min-width: 0 !important;
      }

      .brand-copy b {
        color: #f4f5f8 !important;
        font-size: 13px !important;
        font-weight: 800 !important;
        letter-spacing: 2px !important;
        line-height: 1.2 !important;
      }

      .brand-copy small {
        color: #9299a5 !important;
        font-size: 8px !important;
        letter-spacing: 1.35px !important;
        white-space: nowrap !important;
      }

      #dashboard .page-intro h1 {
        letter-spacing: -1.1px !important;
      }
    `;

    document.head.appendChild(style);
  }

  function start() {
    installStyles();
    applyBrand();

    // Some older visual scripts may repaint the logo during initialization.
    // Reapply only when the brand elements themselves are changed.
    const observer = new MutationObserver(() => {
      const mark = document.querySelector(".brand-mark");
      const image = mark?.querySelector("img");

      if (mark && !image) {
        applyBrand();
      }
    });

    const mark = document.querySelector(".brand-mark");
    if (mark) {
      observer.observe(mark, {
        childList: true,
        subtree: true
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.QORIX = {
    name: BRAND,
    tagline: TAGLINE
  };
})();
