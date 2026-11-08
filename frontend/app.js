(() => {
  "use strict";
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || "";
  const API = "/api";
  const symbols = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT"];
  const names = {BTCUSDT:"Bitcoin",ETHUSDT:"Ethereum",BNBUSDT:"BNB",SOLUSDT:"Solana",XRPUSDT:"XRP",ADAUSDT:"Cardano"};
  const state = {portfolio:null,prices:{},selectedSymbol:"BTCUSDT",interval:"1h",chart:null,candleSeries:null,toastTimer:null};
  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => [...r.querySelectorAll(s)];

  if (tg) { tg.ready(); tg.expand(); tg.setHeaderColor("#08090b"); tg.setBackgroundColor("#08090b"); }

  function money(v) {
    const n=Number(v); if(!Number.isFinite(n)) return "—";
    return n.toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function compact(v) {
    const n=Number(v); if(!Number.isFinite(n)) return "—";
    return n.toLocaleString("en-US",{maximumFractionDigits:2});
  }
  function safe(v) { return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function toast(message) {
    const el=$("#toast"); if(!el) return;
    el.textContent=message; el.classList.add("show");
    clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.remove("show"),3200);
  }
  async function api(path) {
    const headers={Accept:"application/json"};
    if(initData) headers["X-Telegram-Init-Data"]=initData;
    const response=await fetch(API+path,{headers,cache:"no-store"});
    if(!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  }
  function navigate(page) {
    const target=$("#"+page); if(!target) return;
    $$(".page").forEach(p=>p.classList.toggle("active",p===target));
    $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    if(page==="markets") { renderMarkets(); loadChart(state.selectedSymbol,state.interval); }
    if(page==="portfolio") { loadPortfolio(); loadHistory(); }
    if(page==="strategies") loadPortfolio();
  }
  function changeConnection(ok) {
    const label=$("#connection-label"),dot=$("#market-status-dot");
    if(label) label.textContent=ok?"BINANCE ONLINE":"DATA UNAVAILABLE";
    if(dot) dot.classList.toggle("good",ok);
  }
  function renderMarketPreview() {
    const items=Object.values(state.prices);
    const html=items.map(item=>{
      const change=Number(item.priceChangePercent)||0,up=change>=0;
      return `<div class="mini-market"><div class="coin-line"><div><div class="coin-name">${safe(item.symbol.replace("USDT",""))}</div><div class="coin-sub">${safe(names[item.symbol]||"Crypto")}</div></div><span class="coin-change ${up?"positive":"negative"}">${up?"+":""}${compact(change)}%</span></div><div class="coin-price">${money(item.lastPrice)}</div></div>`;
    }).join("");
    $("#dashboard-markets").innerHTML=html||'<div class="empty-message">Котировки пока недоступны</div>';
  }
  function renderMarkets() {
    const html=symbols.map(symbol=>{
      const item=state.prices[symbol];
      if(!item) return "";
      const change=Number(item.priceChangePercent)||0,up=change>=0;
      return `<button class="market-row ${state.selectedSymbol===symbol?"selected":""}" data-symbol="${symbol}"><span class="market-asset"><span class="coin-icon">${symbol.slice(0,3)}</span><span><b>${symbol.replace("USDT","")} / USDT</b><small>${safe(names[symbol]||"Crypto")}</small></span></span><span class="market-quote"><b>${money(item.lastPrice)}</b><small class="${up?"positive":"negative"}">${up?"+":""}${compact(change)}%</small></span></button>`;
    }).join("");
    $("#markets-list").innerHTML=html||'<div class="empty-message">Рыночные данные пока недоступны</div>';
  }
  async function loadMarkets() {
    const results=await Promise.allSettled(symbols.map(s=>api(`/market/price/${s}`)));
    let success=0;
    results.forEach((r,i)=>{if(r.status==="fulfilled"){state.prices[symbols[i]]=r.value;success++;}});
    changeConnection(success>0); renderMarketPreview(); renderMarkets();
    return success;
  }
  function renderPortfolio(data) {
    state.portfolio=data;
    const balance=Number(data.balance)||0,initial=Number(data.initial_capital)||0,equity=Number(data.equity)||0,pnl=Number(data.total_pnl)||0;
    const pnlText=`${pnl>=0?"+":""}${money(pnl)}`;
    $("#dashboard-balance").textContent=money(balance);
    $("#dashboard-pnl").innerHTML=`${pnlText} <small>общий P&amp;L</small>`;
    $("#dashboard-initial").textContent=money(initial);
    $("#dashboard-equity").textContent=money(equity);
    $("#dashboard-accounts").textContent=String((data.accounts||[]).length);
    $("#portfolio-balance").textContent=money(balance);
    $("#portfolio-pnl").textContent=pnlText;
    $("#portfolio-pnl").className=pnl>=0?"positive":"negative";
    $("#portfolio-stats").innerHTML=[
      ["Начальный капитал",money(initial)],["Equity",money(equity)],["Общий P&L",pnlText],["Счетов",String((data.accounts||[]).length)]
    ].map(([label,value])=>`<div class="stat-box"><span>${label}</span><b>${value}</b></div>`).join("");
    const accounts=data.accounts||[];
    const cards=accounts.map((a,i)=>`<article class="strategy-card"><div class="strategy-card-head"><h3>${safe(a.name)}</h3><span class="strategy-symbol">${["⌁","◷","◇","▤"][i%4]}</span></div><div class="strategy-balance">${money(a.balance)}</div><small>${safe(a.strategy)} · ${Number(a.open_positions)||0} открытых позиций</small></article>`).join("");
    $("#strategy-list").innerHTML=cards||'<div class="empty-message">Счета стратегий не найдены</div>';
    $("#portfolio-accounts").innerHTML=accounts.map(a=>`<div class="account-row"><div><b>${safe(a.name)}</b><small>${safe(a.strategy)} · ${Number(a.open_positions)||0} позиций</small></div><strong>${money(a.balance)}</strong></div>`).join("")||'<div class="empty-message">Нет счетов</div>';
  }
  async function loadPortfolio() {
    try { const data=await api("/portfolio"); renderPortfolio(data); }
    catch(e){toast("Не удалось загрузить портфель: "+e.message);}
  }
  async function loadHistory() {
    try {
      const data=await api("/history?limit=20"),trades=data.trades||[];
      $("#history-list").innerHTML=trades.length?trades.map(t=>{
        const pnl=Number(t.net_pnl)||0;
        return `<div class="history-row"><div><b>${safe(t.symbol)}</b><small>${safe(t.direction)} · ${safe(t.strategy||"—")} · ${safe(t.exit_reason||"—")}</small></div><strong class="${pnl>=0?"positive":"negative"}">${pnl>=0?"+":""}${money(pnl)}</strong></div>`;
      }).join(""):'<div class="empty-message">Закрытых сделок пока нет</div>';
    } catch(e){$("#history-list").innerHTML='<div class="empty-message">История временно недоступна</div>';}
  }
  async function loadChart(symbol,interval) {
    state.selectedSymbol=symbol; state.interval=interval;
    $("#chart-title").textContent=`${symbol.replace("USDT","")} / USDT`;
    $$(".market-row").forEach(row=>row.classList.toggle("selected",row.dataset.symbol===symbol));
    $("#price-chart").innerHTML="";
    if(!window.LightweightCharts){$("#price-chart").innerHTML='<div class="empty-message">Библиотека графика недоступна</div>';return;}
    try {
      const candles=await api(`/market/klines/${symbol}?interval=${interval}&limit=120`);
      if(!Array.isArray(candles)||!candles.length) throw new Error("Нет свечей");
      const host=$("#price-chart"); host.innerHTML="";
      if(state.chart){state.chart.remove();state.chart=null;}
      const chart=LightweightCharts.createChart(host,{
        width:host.clientWidth,height:host.clientHeight,
        layout:{background:{type:"solid",color:"#101216"},textColor:"#858b96",fontFamily:"DM Sans"},
        grid:{vertLines:{color:"#1d2229"},horzLines:{color:"#1d2229"}},
        rightPriceScale:{borderColor:"#252930"},
        timeScale:{borderColor:"#252930",timeVisible:true,secondsVisible:false},
        crosshair:{mode:0}
      });
      const series=chart.addCandlestickSeries({
        upColor:"#32c98b",downColor:"#ed6b70",borderUpColor:"#32c98b",borderDownColor:"#ed6b70",wickUpColor:"#32c98b",wickDownColor:"#ed6b70"
      });
      series.setData(candles.map(c=>({time:Math.floor(Number(c.timestamp)/1000),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})));
      chart.timeScale().fitContent(); state.chart=chart; state.candleSeries=series;
      if(window.ResizeObserver){const observer=new ResizeObserver(()=>chart.applyOptions({width:host.clientWidth}));observer.observe(host);}
      $("#chart-updated").textContent="Обновлено "+new Date().toLocaleTimeString("ru-RU");
    } catch(e){$("#price-chart").innerHTML='<div class="empty-message">Не удалось загрузить свечи. Попробуйте позже.</div>';}
  }
  function renderAnalysis(result,symbol,interval) {
    const direction=result.direction||"NEUTRAL",score=Number(result.score)||0,grade=result.grade||"—";
    const dirClass=direction==="BUY"?"positive":direction==="SELL"?"negative":"";
    const indicators=result.indicators||{},reasons=Array.isArray(result.reasoning)?result.reasoning:[];
    const rsi=indicators.rsi==null?"—":compact(indicators.rsi);
    $("#analysis-result").className="analysis-card";
    $("#analysis-result").innerHTML=`
      <div class="analysis-top"><span class="eyebrow">${safe(symbol)} · ${safe(interval)}</span><span class="paper-tag">GRADE ${safe(grade)}</span></div>
      <div class="analysis-direction ${dirClass}">${safe(direction)}</div>
      <div class="score-line"><b>Confluence ${compact(score)}/100</b><div class="score-track"><i style="width:${Math.max(0,Math.min(100,score))}%"></i></div></div>
      <div class="analysis-metrics">
        <div><span>Цена анализа</span><b>${money(result.entry_price)}</b></div>
        <div><span>RSI (14)</span><b>${rsi}</b></div>
        <div><span>EMA 20</span><b>${money(indicators.ema20)}</b></div>
      </div>
      <div class="section-title"><div><span class="eyebrow">ANALYSIS FACTORS</span><h2>Факторы оценки</h2></div></div>
      ${reasons.length?`<ul class="reason-list">${reasons.map(r=>`<li>${safe(r)}</li>`).join("")}</ul>`:'<p class="subtle">Дополнительные факторы не предоставлены.</p>'}
      <p class="disclaimer">Confluence score — оценка совпадения индикаторов, не вероятность успешной сделки. Уровни Stop Loss и Take Profit этим endpoint не рассчитываются.</p>`;
  }
  async function runAnalysis() {
    const symbol=$("#signal-symbol").value,interval=$("#signal-interval").value,button=$("#run-analysis");
    button.disabled=true;button.textContent="Анализируем…";
    $("#analysis-result").className="analysis-placeholder";
    $("#analysis-result").innerHTML='<b>Получаем свечи и рассчитываем индикаторы…</b><p>Это может занять несколько секунд.</p>';
    try { const result=await api(`/analysis/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`);renderAnalysis(result,symbol,interval); }
    catch(e){$("#analysis-result").className="analysis-placeholder";$("#analysis-result").textContent="Анализ временно недоступен: "+e.message;}
    finally{button.disabled=false;button.innerHTML='Запустить анализ <span>→</span>';}
  }
  async function initialize() {
    if(!initData){$("#connection-label").textContent="ОТКРОЙТЕ В TELEGRAM";toast("Откройте Mini App через Telegram для авторизации.");return;}
    await Promise.allSettled([loadPortfolio(),loadMarkets()]);
  }
  document.addEventListener("click",event=>{
    const nav=event.target.closest("[data-page]");
    if(nav){navigate(nav.dataset.page);return;}
    const market=event.target.closest("[data-symbol]");
    if(market){loadChart(market.dataset.symbol,state.interval);return;}
    const interval=event.target.closest("[data-interval]");
    if(interval){$$("[data-interval]").forEach(b=>b.classList.toggle("active",b===interval));loadChart(state.selectedSymbol,interval.dataset.interval);}
  });
  $("#run-analysis").addEventListener("click",runAnalysis);
  $("#refresh-btn").addEventListener("click",async()=>{await initialize();if($("#markets").classList.contains("active"))await loadChart(state.selectedSymbol,state.interval);toast("Данные обновлены");});
  window.TradingIntelligence={openPage:navigate,refresh:initialize,telegram:tg};
  initialize();
})();