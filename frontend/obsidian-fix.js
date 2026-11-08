(() => {
  "use strict";
  if (window.__TI_OBSIDIAN_FIX_V1__) return;
  window.__TI_OBSIDIAN_FIX_V1__ = true;

  const css = `
    :root { --ti-font: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    html, body {
      width:100%; max-width:100%; overflow-x:clip!important;
      font-family:var(--ti-font)!important;
      -webkit-text-size-adjust:100%; text-size-adjust:100%;
    }
    body,button,input,select,textarea { font-family:var(--ti-font)!important; }
    .app-shell {
      width:100%!important; max-width:1120px!important;
      min-width:0!important; margin-inline:auto!important;
      overflow-x:clip!important;
    }
    main,.page,.page-intro,.hero-card,.market-row,
    .strategy-card,.position-card,.history-row {
      min-width:0!important; max-width:100%!important;
    }
    h1,h2,h3,p,small,b,strong,span,label { overflow-wrap:anywhere; }
    h1 { font-size:clamp(23px,6vw,32px)!important; line-height:1.16!important; }
    h2 { line-height:1.25!important; }
    .hero-balance {
      font-size:clamp(29px,8vw,46px)!important;
      line-height:1.08!important; letter-spacing:-1.2px!important;
      overflow-wrap:normal!important; word-break:keep-all!important;
    }
    .brand-copy { min-width:0!important; }
    .brand-copy b {
      font-size:clamp(8px,2.5vw,10px)!important;
      letter-spacing:.65px!important; white-space:nowrap!important;
    }
    .brand-copy small { letter-spacing:1.5px!important; }

    .bottom-nav {
      position:fixed!important; left:50%!important; right:auto!important;
      bottom:max(10px,env(safe-area-inset-bottom))!important;
      transform:translateX(-50%)!important;
      width:calc(100% - 24px)!important; max-width:560px!important;
      min-width:0!important; box-sizing:border-box!important;
      display:grid!important; grid-template-columns:repeat(5,minmax(0,1fr))!important;
      align-items:stretch!important; justify-content:stretch!important;
      gap:4px!important; padding:7px!important; margin:0!important;
      direction:ltr!important; z-index:1000!important;
    }
    .bottom-nav .nav-item {
      width:100%!important; min-width:0!important; max-width:100%!important;
      margin:0!important; padding:7px 1px 6px!important;
      display:flex!important; flex:initial!important; flex-direction:column!important;
      align-items:center!important; justify-content:center!important;
      gap:5px!important; text-align:center!important;
      white-space:nowrap!important; box-sizing:border-box!important;
    }
    .bottom-nav .nav-item span {
      width:27px!important; height:27px!important; flex:0 0 27px!important;
      display:grid!important; place-items:center!important; overflow:visible!important;
    }
    .bottom-nav .nav-item span svg {
      display:block!important; width:25px!important; height:25px!important;
      stroke:currentColor!important; stroke-width:2.15!important;
      stroke-linecap:round!important; stroke-linejoin:round!important; fill:none!important;
    }
    .bottom-nav .nav-item small {
      display:block!important; max-width:100%!important;
      font-size:clamp(7px,2.1vw,9px)!important; line-height:1.1!important;
      letter-spacing:0!important; white-space:nowrap!important;
      overflow:hidden!important; text-overflow:clip!important;
    }
    .brand-mark {
      display:grid!important; place-items:center!important;
      flex:0 0 43px!important; width:43px!important; height:43px!important;
      padding:0!important; overflow:hidden!important; letter-spacing:0!important;
    }
    .brand-mark svg {
      width:30px!important; height:30px!important; display:block!important;
      filter:drop-shadow(0 1px 5px rgba(255,255,255,.22));
    }
    .brand-mark i { display:none!important; }

    @media(max-width:380px) {
      .topbar { padding-inline:12px!important; }
      .brand { gap:8px!important; }
      .brand-mark { flex-basis:39px!important; width:39px!important; height:39px!important; }
      .brand-copy b { font-size:8px!important; }
      .bottom-nav { width:calc(100% - 16px)!important; gap:2px!important; padding:6px 4px!important; }
      .bottom-nav .nav-item { padding-inline:0!important; }
    }
  `;

  const style = document.createElement("style");
  style.id = "ti-obsidian-fix-v1";
  style.textContent = css;
  document.head.appendChild(style);

  const navIcons = {
    dashboard: '<svg viewBox="0 0 24 24"><path d="M3.5 10.5 12 3.8l8.5 6.7v9a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6.5h-5V21H5a1.5 1.5 0 0 1-1.5-1.5z"/></svg>',
    markets: '<svg viewBox="0 0 24 24"><path d="M4 19.5V5M4 19.5h16"/><path d="m7 15 4-4 3 2 5-7"/><path d="M15.5 6H19v3.5"/></svg>',
    signals: '<svg viewBox="0 0 24 24"><path d="M3 12h3.5l2.5-7 4.5 14 2.5-7H21"/></svg>',
    strategies: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M9 8v8m6-8v8M4 10h16"/></svg>',
    portfolio: '<svg viewBox="0 0 24 24"><rect x="3" y="6.5" width="18" height="14" rx="2.5"/><path d="M8 6.5V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8v1.7M3 11h18m-7 3h2"/></svg>'
  };

  function applyFixes() {
    document.querySelectorAll(".nav-item").forEach(btn => {
      const icon = btn.querySelector("span");
      if (icon && navIcons[btn.dataset.page]) icon.innerHTML = navIcons[btn.dataset.page];
    });

    const mark = document.querySelector(".brand-mark");
    if (mark) {
      mark.innerHTML = '<svg viewBox="0 0 40 40"><defs><linearGradient id="tiMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".48" stop-color="#bfc9c4"/><stop offset="1" stop-color="#68736e"/></linearGradient></defs><path d="M7 9h26v5H23v18h-6V14H7z" fill="url(#tiMetal)"/><path d="M27 19h6v13h-6z" fill="url(#tiMetal)" opacity=".92"/></svg>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyFixes, {once:true});
  } else {
    applyFixes();
  }

  document.addEventListener("click", event => {
    if (event.target.closest("[data-page]")) setTimeout(applyFixes,60);
  });
})();
