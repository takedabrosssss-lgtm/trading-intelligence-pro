/* ============================================================
   MIRAGE 2.9 — DUAL VISUAL WORLDS
   STEALTH: emerald / atmospheric / calm command center
   SPECTRE: violet / quantum / analytical terminal
   Presentation only. Existing navigation, API, Paper Trading,
   database state and application event handlers are preserved.
   ============================================================ */

(() => {
  "use strict";

  const VERSION = "2.9";
  const STORAGE_KEY = "mirage-mode-v1";
  const VALID = ["stealth", "spectre"];
  if (window.__MIRAGE_DUAL_INTERFACE_V29__) return;
  window.__MIRAGE_DUAL_INTERFACE_V29__ = true;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  let mode = "stealth";
  let switching = false;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (VALID.includes(saved)) mode = saved;
  } catch (_) {}

  const css = `
  :root {
    --m-bg:#030a07; --m-panel:#071710; --m-panel2:#0b2118;
    --m-line:rgba(74,235,174,.23); --m-accent:#36f0ad;
    --m-accent2:#a2ffda; --m-glow:rgba(29,241,165,.22);
    --m-text:#f0fff8; --m-muted:#83a99a; --m-nav:#06140e;
    --m-radius:22px;
  }
  html,body { min-height:100%; background:var(--m-bg)!important; color:var(--m-text)!important; }
  body {
    background:
      radial-gradient(ellipse at 78% 0%,var(--m-glow),transparent 37%),
      radial-gradient(ellipse at 4% 72%,rgba(8,75,49,.17),transparent 36%),
      #030a07!important;
    transition:background .65s ease,color .45s ease;
  }
  body[data-mirage-mode="spectre"] {
    --m-bg:#05020d; --m-panel:#0c0719; --m-panel2:#130b25;
    --m-line:rgba(166,91,255,.31); --m-accent:#a855ff;
    --m-accent2:#d8b4ff; --m-glow:rgba(125,45,255,.25);
    --m-text:#f8f2ff; --m-muted:#a99abb; --m-nav:#090514;
    --m-radius:17px;
    background:
      radial-gradient(ellipse at 78% 0%,rgba(119,43,255,.24),transparent 40%),
      radial-gradient(ellipse at 5% 70%,rgba(65,21,125,.20),transparent 36%),
      #05020d!important;
  }
  .app-shell { max-width:1000px!important; overflow-x:clip!important; padding-bottom:118px!important; }
  .topbar {
    position:sticky!important; top:0!important; z-index:120!important;
    display:flex!important; align-items:center!important; justify-content:space-between!important;
    gap:12px!important; min-height:72px!important; height:auto!important;
    padding:12px 18px!important; background:rgba(3,10,7,.91)!important;
    border-bottom:1px solid var(--m-line)!important; backdrop-filter:blur(22px)!important;
    -webkit-backdrop-filter:blur(22px)!important; transition:background .5s,border-color .5s;
  }
  body[data-mirage-mode="spectre"] .topbar { background:rgba(6,3,15,.93)!important; }
  .brand { min-width:0!important; gap:11px!important; background:transparent!important; border:0!important; }
  .brand-mark { width:43px!important;height:43px!important;flex:0 0 43px!important;border-radius:14px!important;
    overflow:hidden!important;border:1px solid var(--m-line)!important;box-shadow:0 0 24px var(--m-glow)!important; }
  .brand-mark img { width:100%!important;height:100%!important;object-fit:cover!important; }
  .brand-copy { display:flex!important;flex-direction:column!important;gap:4px!important;min-width:0!important; }
  .brand-copy b { color:var(--m-text)!important;font-size:14px!important;font-weight:900!important;letter-spacing:2.8px!important; }
  .brand-copy small { color:var(--m-muted)!important;font-size:7px!important;letter-spacing:1.5px!important;white-space:nowrap!important; }
  .mirage-brand-line { display:inline-flex!important;align-items:center!important;gap:10px!important; }
  .mirage-system-led { width:9px!important;height:9px!important;flex:0 0 9px!important;border-radius:50%!important;
    background:#8a9690!important;box-shadow:0 0 0 3px rgba(130,150,140,.1)!important;transition:all .25s; }
  .mirage-system-led.online { background:#20f6a1!important;box-shadow:0 0 8px #20f6a1,0 0 20px rgba(32,246,161,.6)!important; }
  .mirage-system-led.offline { background:#ff526f!important;box-shadow:0 0 8px #ff526f,0 0 20px rgba(255,82,111,.5)!important; }
  .topbar .connection { display:none!important; }
  .live-pill,.live-badge,.live-indicator { display:none!important; }
  #refresh-btn { flex:0 0 42px!important;width:42px!important;height:42px!important;border-radius:14px!important;
    color:var(--m-accent2)!important;background:var(--m-panel2)!important;border:1px solid var(--m-line)!important;
    box-shadow:0 0 20px var(--m-glow)!important; }

  .mirage-mode-toolbar { position:relative!important;z-index:110!important;box-sizing:border-box!important;
    width:100%!important;max-width:1000px!important;margin:0 auto 18px!important;padding:12px 18px!important;
    display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;
    background:linear-gradient(100deg,rgba(5,22,14,.96),rgba(7,30,19,.78),rgba(5,22,14,.96))!important;
    border-bottom:1px solid var(--m-line)!important;transition:background .55s,border-color .55s; }
  body[data-mirage-mode="spectre"] .mirage-mode-toolbar {
    background:linear-gradient(100deg,rgba(13,5,28,.98),rgba(30,11,55,.84),rgba(13,5,28,.98))!important; }
  .mirage-mode-caption { display:flex!important;flex-direction:column!important;gap:4px!important;min-width:0!important; }
  .mirage-mode-caption strong { color:var(--m-text)!important;font-size:9px!important;font-weight:900!important;letter-spacing:2px!important; }
  .mirage-mode-caption small { color:var(--m-muted)!important;font-size:9px!important; }
  .mirage-mode-switch { position:relative!important;display:grid!important;grid-template-columns:1fr 1fr!important;
    width:244px!important;min-height:46px!important;flex:0 0 auto!important;padding:4px!important;
    border:1px solid var(--m-line)!important;border-radius:15px!important;background:rgba(0,0,0,.27)!important;overflow:hidden!important; }
  .mirage-mode-option { position:relative!important;z-index:2!important;display:flex!important;align-items:center!important;
    justify-content:center!important;gap:7px!important;height:36px!important;padding:0 6px!important;
    border:0!important;border-radius:11px!important;background:transparent!important;color:var(--m-muted)!important;
    font-size:9px!important;font-weight:900!important;letter-spacing:.8px!important;white-space:nowrap!important;cursor:pointer!important; }
  .mirage-mode-option.active { color:#fff!important; }
  .mirage-mode-option:focus-visible { outline:2px solid var(--m-accent)!important;outline-offset:2px!important; }
  .mirage-mode-highlight { position:absolute!important;z-index:1!important;left:4px!important;top:4px!important;bottom:4px!important;
    width:calc(50% - 4px)!important;border-radius:11px!important;background:linear-gradient(135deg,#16865c,#075137)!important;
    border:1px solid rgba(106,255,194,.52)!important;box-shadow:0 0 22px rgba(28,241,164,.32),inset 0 0 12px rgba(255,255,255,.08)!important;
    transition:transform .55s cubic-bezier(.2,.9,.2,1),background .4s,box-shadow .4s!important; }
  .mirage-mode-switch.is-spectre .mirage-mode-highlight { transform:translateX(100%)!important;
    background:linear-gradient(135deg,#9b35ff,#5314b8)!important;border-color:rgba(216,173,255,.65)!important;
    box-shadow:0 0 25px rgba(163,76,255,.55),inset 0 0 12px rgba(255,255,255,.13)!important; }
      main { padding-top:14px!important; }
  .page { position:relative!important;isolation:isolate!important; }
  .page.active { animation:miragePageIn .48s ease both!important; }
  @keyframes miragePageIn { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
  .page-intro { position:relative!important;border-color:var(--m-line)!important; }
  .page-intro h1 { color:var(--m-text)!important;letter-spacing:-.04em!important; }
  .eyebrow,.page-intro .eyebrow { color:var(--m-accent2)!important;letter-spacing:2px!important; }
  .hero-card,.premium-kpi,#premium-equity,#premium-positions,#premium-activity,.chart-panel,
  .market-row,.mini-market,.strategy-card,.status-card,.portfolio-total,.risk-note,.mi-panel,
  .analysis-card,.analysis-placeholder,.position-card,.account-row,.history-row {
    border-color:var(--m-line)!important;transition:background .5s,border-color .5s,box-shadow .5s,transform .3s!important;
  }
  .hero-card { position:relative!important;isolation:isolate!important;overflow:hidden!important;min-height:220px!important;
    padding:26px!important;border-radius:var(--m-radius)!important;
    background:radial-gradient(ellipse at 85% 8%,var(--m-glow),transparent 45%),linear-gradient(145deg,var(--m-panel2),var(--m-panel))!important;
    border:1px solid var(--m-line)!important;box-shadow:0 18px 55px rgba(0,0,0,.34),0 0 32px var(--m-glow)!important; }
  .hero-card::before { content:"";position:absolute;z-index:-1;inset:0;pointer-events:none;opacity:.9;
    background-repeat:no-repeat;background-position:right center;background-size:auto 115%;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 560 260'%3E%3Cdefs%3E%3CradialGradient id='g'%3E%3Cstop stop-color='%2339f5b0' stop-opacity='.32'/%3E%3Cstop offset='1' stop-color='%23000' stop-opacity='0'/%3E%3C/radialGradient%3E%3ClinearGradient id='l'%3E%3Cstop stop-color='%2300a979' stop-opacity='0'/%3E%3Cstop offset='.6' stop-color='%2348ffbd'/%3E%3Cstop offset='1' stop-color='%23c0ffe5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='410' cy='76' r='155' fill='url(%23g)'/%3E%3Cpath d='M35 220 Q120 205 180 173 T300 150 T420 85 T530 28' fill='none' stroke='url(%23l)' stroke-width='4'/%3E%3Cpath d='M35 235 Q120 220 180 188 T300 165 T420 100 T530 43' fill='none' stroke='%2339f5b0' stroke-opacity='.22' stroke-width='18'/%3E%3Ccircle cx='530' cy='28' r='7' fill='%23c8ffe9'/%3E%3C/svg%3E"); }
  body[data-mirage-mode="spectre"] .hero-card { min-height:245px!important;border-radius:18px!important;
    background:radial-gradient(ellipse at 84% 8%,rgba(158,76,255,.28),transparent 43%),linear-gradient(145deg,#170c2b,#080511)!important;
    box-shadow:0 20px 65px rgba(0,0,0,.5),0 0 36px rgba(150,65,255,.18)!important; }
  body[data-mirage-mode="spectre"] .hero-card::before { opacity:1;background-size:auto 125%;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 560 280'%3E%3Cdefs%3E%3CradialGradient id='p'%3E%3Cstop stop-color='%23a855ff' stop-opacity='.42'/%3E%3Cstop offset='1' stop-color='%23080512' stop-opacity='0'/%3E%3C/radialGradient%3E%3ClinearGradient id='q'%3E%3Cstop stop-color='%235b21b6' stop-opacity='0'/%3E%3Cstop offset='.55' stop-color='%23a855ff'/%3E%3Cstop offset='1' stop-color='%23ead5ff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='395' cy='110' r='158' fill='url(%23p)'/%3E%3Cellipse cx='400' cy='110' rx='170' ry='48' fill='none' stroke='%23a855ff' stroke-opacity='.45' stroke-width='2' transform='rotate(-20 400 110)'/%3E%3Cpath d='M25 230 L105 215 155 195 210 205 270 155 320 170 380 110 430 125 520 40' fill='none' stroke='url(%23q)' stroke-width='3'/%3E%3Cpath d='M25 245 L105 230 155 210 210 220 270 170 320 185 380 125 430 140 520 55' fill='none' stroke='%23a855ff' stroke-opacity='.22' stroke-width='16'/%3E%3Ccircle cx='520' cy='40' r='6' fill='%23f3e8ff'/%3E%3C/svg%3E"); }
  .hero-balance { color:var(--m-text)!important;text-shadow:0 0 28px var(--m-glow)!important; }
  .hero-pnl { color:var(--m-accent2)!important; }
  .premium-kpi { min-width:0!important;border-radius:18px!important;background:linear-gradient(145deg,var(--m-panel2),var(--m-panel))!important;border:1px solid var(--m-line)!important; }
  .premium-kpi strong { color:var(--m-text)!important; }
  #premium-equity,#premium-positions,#premium-activity,.chart-panel,.analysis-card,.analysis-placeholder {
    border-radius:19px!important;background:linear-gradient(145deg,var(--m-panel2),var(--m-panel))!important; }
  .market-row,.strategy-card,.portfolio-total,.risk-note { background:var(--m-panel)!important; }
  .market-row.selected { border-color:var(--m-accent)!important;box-shadow:0 0 20px var(--m-glow)!important; }
  .section-title h2,.premium-section-title { color:var(--m-text)!important; }
  .positive { color:#32e6a1!important; }
  body[data-mirage-mode="spectre"] .positive { color:#c084fc!important; }
  .negative { color:#ff607a!important; }
  .bottom-nav { background:rgba(4,17,11,.94)!important;border:1px solid var(--m-line)!important;
    box-shadow:0 14px 45px rgba(0,0,0,.56),0 0 28px var(--m-glow)!important;backdrop-filter:blur(24px)!important; }
  body[data-mirage-mode="spectre"] .bottom-nav { background:rgba(10,5,20,.96)!important; }
  .bottom-nav>.nav-item { color:var(--m-muted)!important;border-radius:14px!important; }
  .bottom-nav>.nav-item.active { color:var(--m-accent2)!important;background:var(--m-glow)!important;box-shadow:inset 0 0 0 1px var(--m-line),0 0 20px var(--m-glow)!important; }
  .bottom-nav>.nav-item.active small { color:var(--m-text)!important; }
  .bottom-nav svg { width:21px!important;height:21px!important;stroke:currentColor!important; }
  .primary-btn,.mi-primary { background:linear-gradient(110deg,#13865b,#07533a)!important;border:1px solid var(--m-line)!important;color:white!important; }
  body[data-mirage-mode="spectre"] .primary-btn,body[data-mirage-mode="spectre"] .mi-primary {
    background:linear-gradient(110deg,#8738d8,#4c1595)!important;border-color:rgba(202,155,255,.4)!important; }
  .mirage-atmosphere { position:fixed;z-index:-1;pointer-events:none;inset:0;overflow:hidden;opacity:.6; }
  .mirage-orb { position:absolute;width:260px;height:260px;border-radius:50%;right:-120px;top:22%;
    background:radial-gradient(circle at 34% 30%,rgba(129,255,204,.22),rgba(15,94,65,.09) 42%,transparent 70%);
    filter:blur(1px);animation:mirageOrbFloat 13s ease-in-out infinite alternate; }
  .mirage-orb::after { content:"";position:absolute;inset:17%;border:1px solid var(--m-line);border-radius:50%;transform:rotate(-25deg) scaleY(.32); }
  body[data-mirage-mode="spectre"] .mirage-orb { background:radial-gradient(circle at 34% 30%,rgba(206,156,255,.24),rgba(81,35,141,.12) 42%,transparent 70%); }
  @keyframes mirageOrbFloat { from{transform:translate3d(0,-12px,0) scale(.96)}to{transform:translate3d(-24px,20px,0) scale(1.05)} }
  .mirage-illustration { position:relative;overflow:hidden;isolation:isolate; }
  .mirage-illustration::after { content:"";position:absolute;z-index:-1;right:12px;top:50%;width:92px;height:92px;transform:translateY(-50%);
    border:1px solid var(--m-line);border-radius:50%;box-shadow:0 0 30px var(--m-glow),inset 0 0 22px var(--m-glow);opacity:.45; }
  body[data-mirage-mode="spectre"] .mirage-illustration::after { border-radius:28%;transform:translateY(-50%) rotate(45deg); }  body[data-mirage-mode="spectre"] .page.active { gap:17px!important; }
  body[data-mirage-mode="spectre"] .premium-kpi { min-height:112px!important; }
  body[data-mirage-mode="spectre"] #premium-equity,body[data-mirage-mode="spectre"] #premium-activity,
  body[data-mirage-mode="spectre"] #premium-positions { display:block!important;padding:19px!important; }
  body[data-mirage-mode="spectre"] .mi-panel { display:block!important;background:linear-gradient(145deg,#170d2b,#090513)!important; }
  body[data-mirage-mode="spectre"] .mi-table th { color:#d4aaff!important; }
  body[data-mirage-mode="spectre"] .mi-table td { border-color:rgba(180,124,255,.18)!important; }
  body[data-mirage-mode="spectre"] .strategy-card { background:linear-gradient(145deg,#190e2c,#0a0614)!important; }

  /* Hide only truly empty portfolio containers. Keep populated content and IDs intact. */
  #portfolio #positions-list:empty,#portfolio #portfolio-accounts:empty,#portfolio #history-list:empty { display:none!important; }
  #portfolio .positions-list:empty,#portfolio .account-list:empty,#portfolio .history-list:empty { display:none!important; }
  #portfolio .position-card,#portfolio .account-row,#portfolio .history-row { background:var(--m-panel)!important;border:1px solid var(--m-line)!important;border-radius:14px!important;padding:14px!important;margin-bottom:9px!important; }

  #mirage-mode-transition { position:fixed;inset:0;z-index:999999;pointer-events:none;opacity:0;display:grid;place-items:center;
    background:radial-gradient(circle at center,rgba(18,90,62,.22),rgba(1,5,4,.97) 72%);transition:opacity .34s ease; }
  #mirage-mode-transition.active { opacity:1; }
  #mirage-mode-transition .transition-core { position:relative;width:124px;height:124px;display:grid;place-items:center; }
  #mirage-mode-transition .transition-ring { position:absolute;inset:0;border:1px solid var(--m-accent);border-radius:50%;
    box-shadow:0 0 22px var(--m-glow),inset 0 0 22px var(--m-glow);animation:mirageRing .85s ease-in-out infinite; }
  #mirage-mode-transition .transition-ring:nth-child(2) { inset:13px;animation-delay:-.3s; }
  #mirage-mode-transition .transition-ring:nth-child(3) { inset:27px;animation-delay:-.6s; }
  #mirage-mode-transition .transition-word { color:var(--m-accent2);font-weight:900;letter-spacing:4px;font-size:12px;text-shadow:0 0 24px var(--m-glow); }
  body[data-mirage-mode="spectre"] #mirage-mode-transition { background:radial-gradient(circle at center,rgba(119,45,210,.25),rgba(3,1,9,.98) 72%); }
  @keyframes mirageRing { 0%{transform:scale(.82) rotate(0);opacity:.25}50%{transform:scale(1.08) rotate(90deg);opacity:1}100%{transform:scale(.82) rotate(180deg);opacity:.25} }

  @media(max-width:600px) {
    .topbar { padding:10px 12px!important;min-height:64px!important; }
    .brand-mark { width:39px!important;height:39px!important;flex-basis:39px!important; }
    .brand-copy b { font-size:12px!important;letter-spacing:2px!important; }
    .brand-copy small { font-size:6px!important;letter-spacing:1px!important; }
    .mirage-mode-toolbar { padding:10px 12px!important;gap:7px!important; }
    .mirage-mode-caption strong { font-size:7px!important;letter-spacing:1px!important; }
    .mirage-mode-caption small { font-size:8px!important; }
    .mirage-mode-switch { width:190px!important;min-height:42px!important; }
    .mirage-mode-option { height:32px!important;font-size:8px!important; }
    .hero-card { min-height:185px!important;padding:19px!important; }
    body[data-mirage-mode="spectre"] .hero-card { min-height:205px!important; }
    body[data-mirage-mode="spectre"] #premium-kpis { grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important; }
    body[data-mirage-mode="spectre"] .premium-kpi { padding:10px!important;min-height:96px!important; }
    .bottom-nav { max-width:calc(100% - 24px)!important; }
  }
  @media(max-width:370px) {
    .mirage-mode-caption small { display:none!important; }
    .mirage-mode-switch { width:174px!important; }
    .brand-copy small { display:none!important; }
  }
  @media(prefers-reduced-motion:reduce) {
    *,*::before,*::after { animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important; }
  }`;

  function installStyle() {
    let node = $("#mirage-dual-interface-v29-style");
    if (!node) {
      node = document.createElement("style");
      node.id = "mirage-dual-interface-v29-style";
      document.head.appendChild(node);
    }
    node.textContent = css;
  }

  function setupBrand() {
    const brand = $(".brand-copy b");
    if (brand && !$("#mirage-connection-led")) {
      const line = document.createElement("span");
      line.className = "mirage-brand-line";
      const led = document.createElement("span");
      led.id = "mirage-connection-led";
      led.className = "mirage-system-led";
      led.setAttribute("role", "status");
      led.setAttribute("aria-label", "Состояние соединения");
      brand.parentNode.insertBefore(line, brand);
      line.append(brand, led);
    }
    $$(".live-pill,.live-badge,.live-indicator").forEach(el => el.remove());
    updateLed();
  }
     function updateLed() {
    const led = $("#mirage-connection-led");
    if (!led) return;
    const label = ($("#connection-label")?.textContent || "").toLowerCase();
    const dot = $(".connection i");
    const color = dot ? getComputedStyle(dot).backgroundColor : "";
    const offline = /нет связи|ошибка|отключ|offline|error|недоступ/.test(label) ||
      color.includes("255, 82") || color.includes("255, 83");
    const online = /онлайн|online|подключено|connected/.test(label) ||
      color.includes("53, 229, 155") || color.includes("35, 229, 155") ||
      color.includes("32, 230, 161");
    led.classList.toggle("offline", offline);
    led.classList.toggle("online", !offline && online);
  }

  function buildToolbar() {
    const topbar = $(".topbar");
    if (!topbar || $("#mirage-mode-toolbar")) return;
    const toolbar = document.createElement("section");
    toolbar.id = "mirage-mode-toolbar";
    toolbar.className = "mirage-mode-toolbar";
    toolbar.innerHTML = `
      <div class="mirage-mode-caption">
        <strong>INTERFACE PROFILE</strong>
        <small>Choose your mode</small>
      </div>
      <div class="mirage-mode-switch" role="group" aria-label="Interface mode">
        <span class="mirage-mode-highlight" aria-hidden="true"></span>
        <button type="button" class="mirage-mode-option" data-mode="stealth" aria-pressed="false">● STEALTH</button>
        <button type="button" class="mirage-mode-option" data-mode="spectre" aria-pressed="false">◇ SPECTRE</button>
      </div>`;
    topbar.insertAdjacentElement("afterend", toolbar);
    toolbar.addEventListener("click", event => {
      const button = event.target.closest("[data-mode]");
      if (button) changeMode(button.dataset.mode);
    });
    updateToolbar();
  }

  function updateToolbar() {
    const toolbar = $("#mirage-mode-toolbar");
    if (!toolbar) return;
    $(".mirage-mode-switch", toolbar)?.classList.toggle("is-spectre", mode === "spectre");
    $$("[data-mode]", toolbar).forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setupIllustrations() {
    if (!$(".mirage-atmosphere")) {
      const atmosphere = document.createElement("div");
      atmosphere.className = "mirage-atmosphere";
      atmosphere.setAttribute("aria-hidden", "true");
      atmosphere.innerHTML = '<div class="mirage-orb"></div>';
      document.body.prepend(atmosphere);
    }
    const hero = $(".hero-card");
    if (hero) hero.classList.add("mirage-illustration");
  }
  function setupTransition() {
    if ($("#mirage-mode-transition")) return;
    const overlay = document.createElement("div");
    overlay.id = "mirage-mode-transition";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `<div class="transition-core">
      <i class="transition-ring"></i><i class="transition-ring"></i><i class="transition-ring"></i>
      <span class="transition-word">MIRAGE</span></div>`;
    document.body.appendChild(overlay);
  }  function applyMode() {
    document.documentElement.dataset.mirageMode = mode;
    document.body.dataset.mirageMode = mode;
    updateToolbar();
    updateLed();
    window.dispatchEvent(new CustomEvent("mirage:modechange", {detail:{mode}}));
  }

  function changeMode(next) {
    if (!VALID.includes(next) || next === mode || switching) return;
    switching = true;
    const overlay = $("#mirage-mode-transition");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    if (!overlay || reduced) {
      mode = next; applyMode(); switching = false; return;
    }
    overlay.classList.add("active");
    window.setTimeout(() => {
      mode = next;
      applyMode();
      window.setTimeout(() => {
        overlay.classList.remove("active");
        window.setTimeout(() => { switching = false; }, 360);
      }, 260);
    }, 420);
  }

  function initialize() {
    installStyle();
    setupBrand();
    buildToolbar();
    setupIllustrations();
    setupTransition();
    applyMode();

    const label = $("#connection-label");
    if (label && window.MutationObserver) {
      new MutationObserver(updateLed).observe(label, {
        childList:true,subtree:true,characterData:true
      });
    }
    const sourceDot = $(".connection i");
    if (sourceDot && window.MutationObserver) {
      new MutationObserver(updateLed).observe(sourceDot, {
        attributes:true,attributeFilter:["style","class"]
      });
    }
    // Do not replace .bottom-nav or its children.
    // Existing navigation and event listeners remain untouched.
    console.info(`[MIRAGE] ${VERSION} visual worlds initialized: ${mode.toUpperCase()}`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {once:true});
  } else {
    initialize();
  }
})();
