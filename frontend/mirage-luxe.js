/* MIRAGE UI RESTORE — repair the real brand/avatar without removing the app's styles.
   This script intentionally leaves every existing stylesheet and app module intact. */
(() => {
  "use strict";
  if (window.__MIRAGE_UI_REPAIR__) return;
  window.__MIRAGE_UI_REPAIR__ = true;

  const AVATAR = "/mirage-avatar-512.png";
  const CSS_ID = "mirage-ui-repair-css";
  const $ = (selector, root = document) => root.querySelector(selector);

  function installRepairStyles() {
    if ($("#" + CSS_ID)) return;
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = "mirage-ui-repair.css?v=20261113-main1";
    document.head.appendChild(link);
  }

  function setImage(host, src, alt) {
    if (!host) return;
    let img = $("img", host);
    if (!img) {
      img = document.createElement("img");
      host.replaceChildren(img);
    } else {
      // Remove the decorative SVG that was previously layered over the real brand image.
      host.querySelectorAll(".mirage-brand-sigil,.mr-brand-svg").forEach(node => node.remove());
      [...host.children].forEach(node => {
        if (node !== img) node.remove();
      });
    }

    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    img.alt = alt;
    img.draggable = false;
    img.loading = "eager";
    img.decoding = "async";
  }

  function repairBrandAvatar() {
    const mark = $(".brand-mark");
    if (!mark) return;
    setImage(mark, AVATAR, "MIRAGE");
    mark.setAttribute("aria-label", "MIRAGE");
    mark.dataset.uiRepair = "1";
  }

  function repairProfileAvatar() {
    const host = $("#profile-avatar");
    if (!host) return;

    const user = window.Telegram?.WebApp?.initDataUnsafe?.user || {};
    const photo = typeof user.photo_url === "string" && user.photo_url.trim()
      ? user.photo_url.trim()
      : AVATAR;

    setImage(host, photo, "Аватар профиля");
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", "Аватар профиля");
    host.dataset.uiAvatarSrc = photo;

    const img = $("img", host);
    if (img && photo !== AVATAR && img.dataset.fallbackBound !== "1") {
      img.dataset.fallbackBound = "1";
      img.addEventListener("error", () => {
        setImage(host, AVATAR, "Аватар MIRAGE");
        host.dataset.uiAvatarSrc = AVATAR;
      }, { once: true });
    }
  }

  function repairProtocolPhantomTitle() {
    const heading = $("#mirage-phantom-card h2");
    if (!heading) return;
    if (heading.textContent.trim() !== "PROTOCOL PHANTOM") {
      heading.textContent = "PROTOCOL PHANTOM";
    }
  }

  function repair() {
    repairBrandAvatar();
    repairProfileAvatar();
    repairProtocolPhantomTitle();
  }

  function start() {
    installRepairStyles();
    repair();

    // Profile and platform cards are created by existing modules after DOM ready.
    const observer = new MutationObserver(() => repair());
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("mirage:pagechange", () => {
      requestAnimationFrame(repair);
    });

    // Re-apply Telegram's photo / fallback when the profile screen is opened.
    window.addEventListener("pageshow", repair);
    console.info("MIRAGE UI RESTORE: legacy styles retained; real avatar enabled.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
