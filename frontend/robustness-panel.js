/* MIRAGE 4.0 — Command Center, Signal Archive, Trade Journal and 5-tab repair.
   Additive presentation layer. Existing app.js and trading logic remain untouched. */
(() => {
  "use strict";
  if (window.__MIRAGE4_PANELS__) return;
  window.__MIRAGE4_PANELS__ = true;

  const $ = (s, root=document) => root.querySelector(s);
  const esc = value => String(value ?? "—").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const money = value => Number(value || 0).toLocaleString("en-US", {
    style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2
  });
  const pct = value => value == null ? "—" : `${Number(value).toFixed(2)}%`;
  const headers = () => ({
    Accept:"application/json",
    "X-Telegram-Init-Data":window.Telegram?.WebApp?.initData || ""
  });
  async function get(url) {
    const response = await fetch(url,{headers:headers(),cache:"no-store"});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }
  function injectStyle() {
    if ($("#mirage4-style")) return;
    const style=document.createElement("style");
    style.id="mirage4-style";
    style.textContent=`
      .bottom-nav{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:3px!important}
      .bottom-nav>.nav-item{min-width:0!important;padding-left:2px!important;padding-right:2px!important}
      .bottom-nav>.nav-item small{font-size:9px!important;letter-spacing:-.1px}
      .m4-panel{margin:16px 0;padding:17px;border:1px solid rgba(130,190,164,.14);border-radius:20px;background:linear-gradient(145deg,rgba(15,28,23,.92),rgba(7,13,12,.96));box-shadow:0 12px 32px rgba(0,0,0,.16);color:var(--text,#eef7f1)}
      .m4-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:15px}
      .m4-kicker{font-size:9px;letter-spacing:2px;color:#69cda2;font-weight:800}
      .m4-head h3{font:800 17px Manrope,sans-serif;margin:4px 0}
      .m4-muted{font-size:11px;color:rgba(220,235,227,.55);line-height:1.5}
      .m4-score{display:flex;align-items:center;gap:15px;padding:12px 0 16px}
      .m4-score-ring{width:76px;height:76px;flex:0 0 76px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#48dda1 var(--score),rgba(255,255,255,.08) 0);position:relative}
      .m4-score-ring:before{content:"";position:absolute;inset:6px;border-radius:50%;background:#0b1511}
      .m4-score-ring b{position:relative;font:800 21px Manrope}
      .m4-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .m4-metric{padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025);min-width:0}
      .m4-metric span{display:block;font-size:10px;color:rgba(220,235,227,.55);margin-bottom:7px}
      .m4-metric b{font:700 15px Manrope;overflow-wrap:anywhere}
      .m4-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.06);font-size:11px}
      .m4-status{display:inline-flex;align-items:center;gap:6px;font-size:10px;text-transform:uppercase;letter-spacing:1px}
      .m4-status:before{content:"";width:6px;height:6px;border-radius:50%;background:#4bdb9b;box-shadow:0 0 10px #4bdb9b}
      .m4-status.bad:before{background:#ff6875;box-shadow:0 0 10px #ff6875}
      .m4-table-wrap{overflow-x:auto}
      .m4-table{width:100%;border-collapse:collapse;font-size:10px;min-width:540px}
      body[data-mirage-mode="spectre"] .m4-table{min-width:760px}
      .m4-table th{text-align:left;color:rgba(220,235,227,.48);font-weight:600;padding:9px 7px}
      .m4-table td{padding:10px 7px;border-top:1px solid rgba(255,255,255,.06);white-space:nowrap}
      .m4-positive{color:#59dfa5}.m4-negative{color:#ff7883}
      .m4-controls{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}
      .m4-controls input,.m4-controls select{min-width:0;flex:1;background:#101b16;color:#e8f4ed;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px;font-size:11px}
      .m4-btn{background:rgba(71,207,147,.12);border:1px solid rgba(71,207,147,.24);color:#8ce7bb;border-radius:10px;padding:9px 12px;font-size:11px}
      .m4-btn:disabled{opacity:.4}
      .m4-pages{display:flex;align-items:center;justify-content:space-between;margin-top:12px}
      .m4-detail{display:none}
      body[data-mirage-mode="spectre"] .m4-detail{display:table-cell}
      body[data-mirage-mode="stealth"] .m4-spectre-only{display:none!important}
      body[data-mirage-mode="spectre"] .m4-panel{border-color:rgba(176,145,255,.2);background:linear-gradient(145deg,rgba(22,15,37,.94),rgba(8,8,17,.98))}
      body[data-mirage-mode="spectre"] .m4-kicker{color:#b69aff}
      body[data-mirage-mode="spectre"] .m4-score-ring{background:conic-gradient(#b69aff var(--score),rgba(255,255,255,.08) 0)}
      @media(min-width:640px){.m4-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }
  function repairNavigation() {
    const nav=$(".bottom-nav");
    if(!nav || nav.dataset.mirage4Fixed==="1") return;
    const tabs=[
      ["dashboard","Обзор",'<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/></svg>'],
      ["markets","Рынки",'<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h17M7 15l4-4 3 2 6-7"/></svg>'],
      ["signals","Сигналы",'<svg viewBox="0 0 24 24"><path d="M3 17h3l3-8 4 10 3-7h5"/></svg>'],
      ["strategies","Стратегии",'<svg viewBox="0 0 24 24"><path d="m12 3-8 5 8 5 8-5-8-5ZM4 13l8 5 8-5"/></svg>'],
      ["portfolio","Портфель",'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5h8v2"/></svg>']
    ];
    nav.innerHTML=tabs.map(([page,label,icon])=>
      `<button type="button" class="nav-item ${page==="dashboard"?"active":""}" data-page="${page}" aria-label="${label}"><span>${icon}</span><small>${label}</small></button>`
    ).join("");
    nav.dataset.mirage4Fixed="1";
    nav.setAttribute("aria-label","Основная навигация");
  }
  function panel(id, kicker, title, subtitle) {
    const node=document.createElement("section");
    node.className="m4-panel";
    node.id=id;
    node.innerHTML=`<div class="m4-head"><div><div class="m4-kicker">${kicker}</div><h3>${title}</h3><div class="m4-muted">${subtitle}</div></div></div>`;
    return node;
  }
  function installPanels() {
    const dashboard=$("#dashboard"), signals=$("#signals"), portfolio=$("#portfolio");
    if(dashboard && !$("#mirage4-command")) {
      const p=panel("mirage4-command","MIRAGE INTELLIGENCE · 4.0","Command Center","Сводное состояние системы и Paper Trading");
      p.insertAdjacentHTML("beforeend",`
        <div class="m4-score"><div class="m4-score-ring" id="m4-score-ring" style="--score:0%"><b id="m4-score">—</b></div><div><b id="m4-score-label">Собираем показатели…</b><div class="m4-muted" id="m4-score-note">Это операционная оценка полноты и состояния данных, не вероятность прибыльной сделки.</div></div></div>
        <div class="m4-grid" id="m4-command-grid"><div class="m4-metric"><span>Загрузка</span><b>—</b></div></div>
        <div class="m4-row"><span>Состояние системы</span><b class="m4-status" id="m4-health-status">Проверка</b></div>
        <div id="m4-health-list"></div>
        <div class="m4-spectre-only m4-muted" id="m4-score-factors"></div>
        <button class="m4-btn" id="m4-refresh">Обновить диагностику</button>`);
      const anchor=$("#premium-equity",dashboard)||$(".hero-card",dashboard);
      if(anchor) anchor.insertAdjacentElement("afterend",p); else dashboard.appendChild(p);
    }
    if(signals && !$("#mirage4-signal-archive")) {
      const p=panel("mirage4-signal-archive","SIGNAL INTELLIGENCE","Архив сигналов","История, фильтры, причины и технические показатели");
      p.insertAdjacentHTML("beforeend",`
        <div class="m4-controls"><input id="m4-signal-symbol" placeholder="Пара, например BTCUSDT"><select id="m4-signal-status"><option value="">Все статусы</option><option>new</option><option>sent</option><option>filtered</option><option>eligible</option><option>paper_opened</option><option>paper_closed</option><option>paper_skipped</option></select><select id="m4-signal-direction"><option value="">Все направления</option><option>BUY</option><option>SELL</option></select><select id="m4-signal-timeframe"><option value="">Все TF</option><option>15m</option><option>1h</option><option>4h</option><option>1d</option></select><button class="m4-btn" id="m4-signal-filter">Применить</button></div>
        <div id="m4-signals-output" class="m4-muted">Загружаем архив…</div>
        <div class="m4-pages"><button class="m4-btn" id="m4-signal-prev">Назад</button><span class="m4-muted" id="m4-signal-page">—</span><button class="m4-btn" id="m4-signal-next">Далее</button></div>`);
      const anchor=$("#analysis-result",signals);
      if(anchor) anchor.insertAdjacentElement("afterend",p); else signals.appendChild(p);
    }
    if(portfolio && !$("#mirage4-journal")) {
      const p=panel("mirage4-journal","TRADE JOURNAL","Журнал сделок","Полная детализация исполнений, комиссий и финансового результата");
      p.insertAdjacentHTML("beforeend",`
        <div class="m4-controls"><input id="m4-journal-symbol" placeholder="Пара"><select id="m4-journal-direction"><option value="">Все направления</option><option>BUY</option><option>SELL</option></select><select id="m4-journal-strategy"><option value="">Все стратегии</option><option value="scalping">Scalping</option><option value="intraday">Intraday</option><option value="swing">Swing</option><option value="position">Position</option></select><select id="m4-journal-result"><option value="">Все результаты</option><option value="win">Прибыльные</option><option value="loss">Убыточные</option></select><button class="m4-btn" id="m4-journal-filter">Фильтр</button></div>
        <div class="m4-grid" id="m4-journal-stats"></div>
        <div id="m4-journal-output" class="m4-muted">Загружаем журнал…</div>
        <div class="m4-pages"><button class="m4-btn" id="m4-journal-prev">Назад</button><span class="m4-muted" id="m4-journal-page">—</span><button class="m4-btn" id="m4-journal-next">Далее</button></div>`);
      const anchor=$("#history-list",portfolio);
      if(anchor) anchor.insertAdjacentElement("afterend",p); else portfolio.appendChild(p);
    }
  }

  let signalPage=1, journalPage=1;
  async function loadHealth() {
    const status=$("#m4-health-status"), list=$("#m4-health-list");
    if(!status||!list)return;
    try {
      const data=await get("/api/mirage/health");
      status.textContent=data.status.toUpperCase();
      status.classList.toggle("bad",data.status!=="ok");
      list.innerHTML=Object.entries(data.checks||{}).map(([name,item])=>
        `<div class="m4-row"><span>${esc(({database:"База данных",market_data:"Рыночные данные",scanner:"Сканер",telegram_bot:"Telegram-бот"})[name]||name)}</span><b class="m4-status ${["error","not_running"].includes(item.status)?"bad":""}">${esc(item.status)}</b></div>`
      ).join("")+`<div class="m4-muted">Время работы процесса: ${Math.floor((data.uptime_seconds||0)/60)} мин · Проверено ${new Date(data.checked_at).toLocaleTimeString("ru-RU")}</div>`;
    } catch(e) {
      status.textContent="ОШИБКА"; status.classList.add("bad");
      list.textContent=`Не удалось проверить систему: ${e.message}`;
    }
  }
  async function loadCommand() {
    const grid=$("#m4-command-grid");
    if(!grid)return;
    grid.innerHTML='<div class="m4-muted">Обновляем показатели…</div>';
    try {
      const data=await get("/api/mirage/command-center");
      const p=data.portfolio||{}, t=data.trading||{};
      $("#m4-score").textContent=data.score;
      $("#m4-score-ring").style.setProperty("--score",`${data.score}%`);
      $("#m4-score-label").textContent=data.score_label;
      grid.innerHTML=[
        ["Equity",money(p.equity)],["Общий P&L",money((p.equity||0)-(p.initial_capital||0))],
        ["Открытые позиции",p.open_positions],["Закрытые сделки",t.closed_trades],
        ["Win Rate",pct(t.win_rate_pct)],["Profit Factor",t.profit_factor??"—"],
        ["Текущая просадка",pct(p.current_drawdown_pct)],["Макс. DD по сделкам",pct(p.max_closed_drawdown_pct)],["Сигналов в архиве",t.signals_total]
      ].map(([a,b])=>`<div class="m4-metric ${["Profit Factor","Макс. DD по сделкам"].includes(a)?"m4-spectre-only":""}"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("");
      $("#m4-score-factors").innerHTML=(data.score_factors||[]).map(x=>
        `<div class="m4-row"><span>${esc(x.label)}</span><b>${x.points>0?"+":""}${x.points} баллов</b></div>`
      ).join("");
    } catch(e) {
      grid.innerHTML=`<div class="m4-muted">Command Center недоступен: ${esc(e.message)}</div>`;
    }
    await loadHealth();
  }
  async function loadSignals() {
    const host=$("#m4-signals-output"); if(!host)return;
    host.textContent="Загружаем сигналы…";
    const symbol=$("#m4-signal-symbol").value.trim();
    const status=$("#m4-signal-status").value;
    const direction=$("#m4-signal-direction").value;
    const timeframe=$("#m4-signal-timeframe").value;
    const params=new URLSearchParams({page:String(signalPage),limit:"20"});
    if(symbol)params.set("symbol",symbol);
    if(status)params.set("status",status);
    if(direction)params.set("direction",direction);
    if(timeframe)params.set("timeframe",timeframe);
    try {
      const data=await get(`/api/mirage/signals?${params}`);
      $("#m4-signal-page").textContent=`Страница ${data.page} · всего ${data.total}`;
      $("#m4-signal-prev").disabled=data.page<=1;
      $("#m4-signal-next").disabled=data.page>=data.pages;
      if(!data.signals.length){host.textContent="Сигналов по выбранным фильтрам нет.";return;}
      host.innerHTML=`<div class="m4-table-wrap"><table class="m4-table"><thead><tr><th>Актив / время</th><th>Направление</th><th>Score</th><th>Статус</th><th class="m4-detail">Вход / SL / TP</th></tr></thead><tbody>${data.signals.map(s=>
        `<tr><td><b>${esc(s.symbol)}</b><br><small>${esc(s.timeframe)} · ${s.created_at?new Date(s.created_at).toLocaleString("ru-RU"):"—"}</small></td><td class="${s.direction==="BUY"?"m4-positive":"m4-negative"}">${esc(s.direction)} · ${esc(s.grade||"—")}</td><td>${s.score==null?"—":Number(s.score).toFixed(1)}</td><td>${esc(s.status)}</td><td class="m4-detail">${money(s.entry_price)} / ${money(s.stop_loss)} / ${money(s.take_profit)}</td></tr><tr class="m4-spectre-only"><td colspan="5"><span class="m4-muted">Основание: ${esc(s.reasoning||"Не сохранено")} · Индикаторы: ${esc(JSON.stringify(s.indicators||{}))}</span></td></tr>`
      ).join("")}</tbody></table></div>`;
    } catch(e){host.textContent=`Ошибка загрузки архива: ${e.message}`;}
  }
  async function loadJournal() {
    const host=$("#m4-journal-output"); if(!host)return;
    host.textContent="Загружаем журнал…";
    const symbol=$("#m4-journal-symbol").value.trim();
    const direction=$("#m4-journal-direction").value;
    const strategy=$("#m4-journal-strategy").value;
    const result=$("#m4-journal-result").value;
    const params=new URLSearchParams({page:String(journalPage),limit:"25"});
    if(symbol)params.set("symbol",symbol);
    if(direction)params.set("direction",direction);
    if(strategy)params.set("strategy",strategy);
    if(result)params.set("result",result);
    try {
      const data=await get(`/api/mirage/journal?${params}`);
      const s=data.summary||{};
      $("#m4-journal-stats").innerHTML=[
        ["Сделок",s.count],["Win Rate",pct(s.win_rate_pct)],["Net P&L",money(s.net_pnl)],["Комиссии",money(s.fees)]
      ].map(([a,b])=>`<div class="m4-metric ${a==="Комиссии"?"m4-spectre-only":""}"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("");
      $("#m4-journal-page").textContent=`Страница ${data.page} · всего ${data.total}`;
      $("#m4-journal-prev").disabled=data.page<=1;
      $("#m4-journal-next").disabled=data.page>=data.pages;
      if(!data.trades.length){host.textContent="Сделок по выбранным фильтрам нет.";return;}
      host.innerHTML=`<div class="m4-table-wrap"><table class="m4-table"><thead><tr><th>Сделка</th><th>Net P&L</th><th class="m4-detail">Вход / выход</th><th class="m4-detail">Количество</th><th class="m4-detail">Gross / комиссии</th><th>Причина</th></tr></thead><tbody>${data.trades.map(t=>
        `<tr><td><b>${esc(t.symbol)}</b><br><small>${esc(t.direction)} · ${esc(t.strategy||"—")} · ${t.closed_at?new Date(t.closed_at).toLocaleString("ru-RU"):"—"}</small></td><td class="${Number(t.net_pnl)>=0?"m4-positive":"m4-negative"}">${money(t.net_pnl)}</td><td class="m4-detail">${money(t.entry_price)} / ${money(t.exit_price)}</td><td class="m4-detail">${Number(t.quantity||0).toLocaleString("en-US",{maximumFractionDigits:8})}</td><td class="m4-detail">${money(t.gross_pnl)} / ${money(t.fees)}</td><td>${esc(t.exit_reason||"—")}</td></tr>`
      ).join("")}</tbody></table></div>`;
    } catch(e){host.textContent=`Ошибка загрузки журнала: ${e.message}`;}
  }
  function bind() {
    $("#m4-refresh")?.addEventListener("click",loadCommand);
    $("#m4-signal-filter")?.addEventListener("click",()=>{signalPage=1;loadSignals();});
    $("#m4-signal-timeframe")?.addEventListener("change",()=>{signalPage=1;loadSignals();});
    $("#m4-signal-prev")?.addEventListener("click",()=>{signalPage=Math.max(1,signalPage-1);loadSignals();});
    $("#m4-signal-next")?.addEventListener("click",()=>{signalPage++;loadSignals();});
    $("#m4-journal-filter")?.addEventListener("click",()=>{journalPage=1;loadJournal();});
    $("#m4-journal-strategy")?.addEventListener("change",()=>{journalPage=1;loadJournal();});
    $("#m4-journal-prev")?.addEventListener("click",()=>{journalPage=Math.max(1,journalPage-1);loadJournal();});
    $("#m4-journal-next")?.addEventListener("click",()=>{journalPage++;loadJournal();});
    document.addEventListener("click",event=>{
      const tab=event.target.closest("[data-page]");
      if(!tab)return;
      if(tab.dataset.page==="dashboard")loadCommand();
      if(tab.dataset.page==="signals")loadSignals();
      if(tab.dataset.page==="portfolio")loadJournal();
    });
    document.addEventListener("mirage:modechange",()=>{loadSignals();loadJournal();});
  }
  function start() {
    injectStyle();
    repairNavigation();
    installPanels();
    bind();
    loadCommand();
    loadSignals();
    loadJournal();
    const modeObserver=new MutationObserver(()=>{
      const mode=document.body.dataset.mirageMode;
      if(mode)document.documentElement.dataset.mirageMode=mode;
    });
    modeObserver.observe(document.body,{attributes:true,attributeFilter:["data-mirage-mode"]});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();

/* MIRAGE 2.6 — Robustness Engine. Read-only research panel. */
(() => {
  "use strict";
  if (window.__MIRAGE_ROBUSTNESS_PANEL__) return;
  window.__MIRAGE_ROBUSTNESS_PANEL__ = true;
  const host = document.getElementById("strategy-list");
  if (!host) return;
  const panel = document.createElement("section");
  panel.className = "mi-panel";
  panel.style.marginTop = "14px";
  panel.innerHTML = `
    <div class="mi-head"><div class="mi-brand"><div class="mi-emblem">⬡</div><div>
      <div class="mi-kicker">MIRAGE INTELLIGENCE · 2.6</div><h3>Robustness Engine</h3>
      <div class="mi-sub">Стресс-тесты и чувствительность параметров</div></div></div>
      <span class="mi-paper">● READ ONLY</span></div>
    <div class="mi-controls" style="margin-top:16px">
      <select id="mr-symbol" aria-label="Актив"><option>BTCUSDT</option><option>ETHUSDT</option><option>BNBUSDT</option><option>SOLUSDT</option><option>XRPUSDT</option></select>
      <select id="mr-interval" aria-label="Таймфрейм"><option value="1d">1D · дневной</option><option value="4h">4H · четырёхчасовой</option><option value="1h">1H · часовой</option></select>
    </div>
    <div class="mi-actions"><button class="mi-primary" id="mr-run">⬡ Проверить устойчивость · 1 200 свечей</button></div>
    <div id="mr-status" class="mi-status"><div class="mi-status-top"><span class="mi-spinner"></span><span class="mi-status-title">Проводим стресс-тесты</span></div><div class="mi-status-line">Проверяем три последовательных участка…</div><div class="mi-progress"></div></div>
    <div id="mr-result" class="mi-result">Проверка устойчивости не запускается автоматически.</div>
    <div id="mr-output" class="mi-results"></div>
    <div class="mi-foot">Повышенные комиссии ×1,5 и проскальзывание ×2. Результаты не изменяют Paper Trading.</div>`;
  host.insertAdjacentElement("afterend", panel);
  const $ = id => panel.querySelector(`#${id}`);
  const esc = v => String(v ?? "—").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const pct = v => `${Number(v ?? 0).toFixed(2)}%`;
  $("mr-run").addEventListener("click", async () => {
    const button = $("mr-run"), status = $("mr-status"), result = $("mr-result"), output = $("mr-output");
    button.disabled = true; status.classList.add("active"); output.innerHTML = "";
    result.textContent = "Загружаем исторические данные и рассчитываем стресс-сценарии…";
    try {
      const symbol = $("mr-symbol").value, interval = $("mr-interval").value;
      const url = `/api/intelligence/robustness/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&limit=1200`;
      const response = await fetch(url, {headers:{Accept:"application/json","X-Telegram-Init-Data":window.Telegram?.WebApp?.initData || ""},cache:"no-store"});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
      if (data.status !== "ok") { result.textContent = `Недостаточно данных: ${data.candles || 0} свечей.`; return; }
      result.textContent = `${data.symbol} · ${data.interval} · ${data.candles} свечей\nСтресс-комиссия: ${data.stress_assumptions.fee_per_side_pct}% на сторону · проскальзывание: ${data.stress_assumptions.slippage_per_side_pct}% на сторону\n${data.warning}`;
      const rows = (data.families || []).map(x => `<tr><td><b class="mi-rank">#${x.rank}</b> ${esc(x.name)}</td><td>${pct(x.median_validation_return_pct)}</td><td>${pct(x.median_stress_return_pct)}</td><td>${x.positive_folds}/3</td><td>${x.stress_positive_folds}/3</td><td>${x.validation_trades}</td><td>${esc(x.status)}</td></tr>`).join("");
      const details = (data.families || []).map(x => `<div><b>${esc(x.name)}</b><div>${(x.folds || []).map(f => `F${f.fold}: base ${pct(f.validation_return_pct)} · stress ${pct(f.stress_return_pct)} · вариантов в плюс ${f.parameter_variants.filter(v=>v.positive).length}/${f.parameter_variants.length}`).join("<br>")}</div></div>`).join("");
      output.innerHTML = `<div class="mi-result-head"><b>Результаты проверки устойчивости</b><span>4 семейства стратегий</span></div><div class="mi-table-wrap"><table class="mi-table"><thead><tr><th>Стратегия</th><th>Медиана base</th><th>Медиана stress</th><th>Base+</th><th>Stress+</th><th>Сделки</th><th>Статус</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mi-folds">${details}</div><div class="mi-warning">Даже статус «robust candidate» не означает подтверждённую прибыльность и не является разрешением на реальные сделки.</div>`;
    } catch (error) { result.textContent = `Проверка не завершена: ${error.message}`; }
    finally { status.classList.remove("active"); button.disabled = false; }
  });
})();
