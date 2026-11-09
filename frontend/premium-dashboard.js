(() => {
 "use strict";
 if (window.__TI_REFERENCE_DASHBOARD__) return;
 window.__TI_REFERENCE_DASHBOARD__ = true;
 const $ = (s,root=document) => root.querySelector(s);
 const money = v => Number(v||0).toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});
 const safe = v => String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const coin = s => String(s||"").replace(/USDT|USD|\/.*/g,"").toUpperCase();
 const logos = {BTC:"btc",ETH:"eth",BNB:"bnb",SOL:"sol",XRP:"xrp",ADA:"ada",DOGE:"doge",AVAX:"avax",LINK:"link",LTC:"ltc"};
 const logoUrl = s => logos[coin(s)] ? `https://assets.coincap.io/assets/icons/${logos[coin(s)]}@2x.png` : "";
 const headers = () => {
  const h={Accept:"application/json"},d=window.Telegram?.WebApp?.initData||"";
  if(d)h["X-Telegram-Init-Data"]=d;return h;
 };
 let currentRange="1D",lastPortfolio=null,lastTrades=[];
 function build(){
  const dash=$("#dashboard"),hero=$(".hero-card",dash);if(!dash||!hero||$("#premium-kpis"))return;
  const intro=$(".page-intro",dash);
  if(intro){const h=$("h1",intro);if(h)h.textContent="";if(h)h.textContent="Trading Intelligence PRO";const sub=$(".subtle",intro);if(sub)sub.remove();const pill=$(".live-pill",intro);if(pill)pill.innerHTML="<i></i> Live";}
  const over=$(".overline",hero);if(over)over.textContent="Общий капитал";
  hero.insertAdjacentHTML("afterend",`
   <div id="premium-kpis">
    <article class="premium-kpi"><span class="kpi-icon">▣</span><span class="kpi-label">Баланс</span><strong id="premium-balance">—</strong><small>Доступно</small></article>
    <article class="premium-kpi"><span class="kpi-icon">▥</span><span class="kpi-label">P&amp;L (24ч)</span><strong id="premium-pnl24">—</strong><small id="premium-pnl24-sub">За последние 24 часа</small></article>
    <article class="premium-kpi"><span class="kpi-icon">🏆</span><span class="kpi-label">Win Rate</span><strong id="premium-winrate">—</strong><small id="premium-winrate-sub">По закрытым сделкам</small></article>
   </div>
   <section id="premium-equity"><div class="premium-equity-head"><b>↗ График капитала</b><div class="premium-chart-tools"><button class="active" data-equity-range="1D">1Д</button><button data-equity-range="1H">1Н</button><button data-equity-range="1M">1М</button><button data-equity-range="ALL">ВСЕ</button></div></div><div id="premium-equity-chart"></div></section>
   <section id="premium-positions"><div class="premium-section-head"><div class="premium-section-title"><i>◈</i>Открытые позиции</div><button class="premium-link" data-page="portfolio">Все позиции →</button></div><div id="premium-position-list"><div class="premium-empty">Загружаем позиции…</div></div></section>
   <section id="premium-activity"><div class="premium-section-head"><div class="premium-section-title"><i>ϟ</i>Последние сделки</div><button class="premium-link" data-page="portfolio">Вся история →</button></div><div id="premium-activity-list"><div class="premium-empty">Загружаем историю…</div></div></section>
  `);
  const nav=$(".bottom-nav");
  if(nav){
   const wanted=[["dashboard","Главная","⌂"],["signals","Сигналы","▥"],["portfolio","Портфель","◔"],["markets","Аналитика","▦"]];
   nav.innerHTML=wanted.map(([page,label,icon])=>`<button class="nav-item ${page==="dashboard"?"active":""}" data-page="${page}"><span>${icon}</span><small>${label}</small></button>`).join("");
  }
 }
 function chartData(trades,initial,equity){
  const now=Date.now(),ranges={"1D":86400000,"1H":7*86400000,"1M":30*86400000,"ALL":Infinity};
  const span=ranges[currentRange]||86400000,filtered=trades.filter(t=>t.closed_at&&now-new Date(t.closed_at).getTime()<=span).sort((a,b)=>new Date(a.closed_at)-new Date(b.closed_at));
  let start=Number(initial)||10000;
  if(currentRange!=="ALL"&&filtered.length){const before=trades.filter(t=>t.closed_at&&new Date(t.closed_at).getTime()<now-span);start+=before.reduce((a,t)=>a+(Number(t.net_pnl)||0),0);}
  const pts=[{v:start,t:now-span}];let value=start;
  filtered.forEach(t=>{value+=Number(t.net_pnl)||0;pts.push({v:value,t:new Date(t.closed_at).getTime()});});
  if(pts.length===1||Math.abs(pts[pts.length-1].v-equity)>.01)pts.push({v:Number(equity)||value,t:now});
  return pts;
 }
 function drawEquity(trades,initial,equity){
  const host=$("#premium-equity-chart");if(!host)return;
  const pts=chartData(trades,initial,equity),w=640,h=205,l=42,r=12,t=13,b=28;
  const vals=pts.map(p=>p.v),lo=Math.min(...vals),hi=Math.max(...vals),pad=(hi-lo||Math.max(1,hi*.01))*.17,min=lo-pad,max=hi+pad,range=max-min||1;
  const x=i=>l+i*(w-l-r)/Math.max(1,pts.length-1),y=v=>t+(max-v)/range*(h-t-b);
  const path=pts.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area=`${path} L ${x(pts.length-1)},${h-b} L ${l},${h-b} Z`,last=pts[pts.length-1];
  const grid=[0,.5,1].map(q=>{const yy=t+q*(h-t-b),v=max-q*range;return `<line x1="${l}" y1="${yy}" x2="${w-r}" y2="${yy}" stroke="#ffffff12"/><text x="0" y="${yy+4}" fill="#a0a2b2" font-size="11">${(v/1000).toFixed(1)}k</text>`}).join("");
  const label=currentRange==="1D"?["00:00","06:00","12:00","18:00","24:00"]:currentRange==="1H"?["7д","5д","3д","1д","Сейчас"]:currentRange==="1M"?["30д","20д","10д","5д","Сейчас"]:["Старт","История","","","Сейчас"];
  const labs=label.map((v,i)=>`<text x="${l+i*(w-l-r)/4}" y="${h-4}" fill="#a0a2b2" font-size="11" text-anchor="${i===0?"start":i===4?"end":"middle"}">${v}</text>`).join("");
  host.innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="История капитала"><defs><linearGradient id="ti-equity-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#28e39b" stop-opacity=".42"/><stop offset="100%" stop-color="#28e39b" stop-opacity="0"/></linearGradient><filter id="ti-equity-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${grid}<path d="${area}" fill="url(#ti-equity-fill)"/><path d="${path}" fill="none" stroke="#28e39b" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#ti-equity-glow)"/>${pts.slice(1,-1).map((p,i)=>`<circle cx="${x(i+1)}" cy="${y(p.v)}" r="2.6" fill="#28e39b"/>`).join("")}<circle cx="${x(pts.length-1)}" cy="${y(last.v)}" r="6" fill="#28e39b" stroke="#eafff5" stroke-width="2"/>${labs}</svg>`;
 }
 function renderPositions(list){
  const host=$("#premium-position-list");if(!host)return;
  host.innerHTML=list.length?list.slice(0,4).map(p=>{
   const up=Number(p.unrealized_pnl)>=0,c=coin(p.symbol),src=logoUrl(c);
   return `<div class="premium-position"><div class="premium-coin">${src?`<img src="${src}" alt="${safe(c)}" loading="lazy">`:`<b>${safe(c.slice(0,1))}</b>`}</div><div class="premium-position-main"><b>${safe(c)}/USDT</b><small>${safe(p.direction==="BUY"?"Long":"Short")} · ${safe(p.leverage?`${p.leverage}x`:p.account||"Paper")}</small></div><div class="premium-position-price"><b>${money(p.current_price)}</b><small>Вход: ${money(p.entry_price)}</small></div><div class="premium-pnl ${up?"":"loss"}">${up?"+":""}${money(p.unrealized_pnl)}<small>${up?"+":""}${Number(p.unrealized_pnl_pct||0).toFixed(2)}%</small></div></div>`;
  }).join(""):'<div class="premium-empty">Открытых позиций пока нет</div>';
 }
 function renderActivity(trades){
  const host=$("#premium-activity-list");if(!host)return;
  const recent=trades.filter(t=>t.closed_at).slice(0,3);
  host.innerHTML=recent.length?recent.map(t=>{
   const up=Number(t.net_pnl)>=0,buy=t.direction==="BUY",sym=coin(t.symbol);
   return `<div class="premium-activity-row"><i class="premium-activity-bar ${up?"":"loss"}"></i><span class="premium-activity-badge ${buy?"":"loss"}">${buy?"A":"S"}</span><div class="premium-activity-copy"><b>${safe(sym)}USDT</b><small>${buy?"Long":"Short"} · ${safe(t.strategy||"Paper Trading")}</small></div><div class="premium-activity-result"><strong class="${up?"":"loss"}">${up?"+":""}${money(t.net_pnl)}</strong><small>${safe(t.exit_reason||"Закрыта")}</small></div></div>`;
  }).join(""):'<div class="premium-empty">История сделок пока пуста</div>';
 }
 async function refresh(){
  try{
   const [pr,hr]=await Promise.all([fetch("/api/portfolio",{headers:headers(),cache:"no-store"}),fetch("/api/history?limit=200",{headers:headers(),cache:"no-store"})]);
   if(!pr.ok||!hr.ok)throw new Error("API unavailable");
   const portfolio=await pr.json(),history=await hr.json(),trades=(history.trades||[]).filter(t=>t.closed_at).sort((a,b)=>new Date(b.closed_at)-new Date(a.closed_at));
   lastPortfolio=portfolio;lastTrades=trades;
   const initial=Number(portfolio.initial_capital)||10000,balance=Number(portfolio.balance)||0,equity=Number(portfolio.equity)||balance;
   const pnl=equity-initial,pct=initial?pnl/initial*100:0;
   $("#dashboard-balance").textContent=money(equity);
   $("#dashboard-pnl").innerHTML=`<span>${pnl>=0?"▲ +":"▼ "}${pct.toFixed(2)}% &nbsp; (${pnl>=0?"+":""}${money(pnl)})</span>`;
   $("#premium-balance").textContent=money(balance);
   const wins=trades.filter(t=>Number(t.net_pnl)>0).length,rate=trades.length?wins/trades.length*100:null;
   $("#premium-winrate").textContent=rate===null?"—":rate.toFixed(1)+"%";
   $("#premium-winrate-sub").textContent=`${trades.length} закрытых сделок`;
   const cutoff=Date.now()-86400000,day=trades.filter(t=>new Date(t.closed_at).getTime()>=cutoff),dayPnl=day.reduce((s,t)=>s+(Number(t.net_pnl)||0),0);
   const pnl24=$("#premium-pnl24");pnl24.textContent=(dayPnl>=0?"+":"")+money(dayPnl);pnl24.className=dayPnl>=0?"green":"red";
   $("#premium-pnl24-sub").textContent=`${day.length} закрытых сделок за 24ч`;
   drawEquity(trades,initial,equity);renderPositions(portfolio.positions||[]);renderActivity(trades);
  }catch(e){
   const host=$("#premium-position-list");if(host)host.innerHTML='<div class="premium-empty">Данные портфеля временно недоступны</div>';
  }
 }
 document.addEventListener("click",e=>{
  const range=e.target.closest("[data-equity-range]");
  if(range){currentRange=range.dataset.equityRange;document.querySelectorAll("[data-equity-range]").forEach(b=>b.classList.toggle("active",b===range));if(lastPortfolio)drawEquity(lastTrades,Number(lastPortfolio.initial_capital)||10000,Number(lastPortfolio.equity)||0);}
  const page=e.target.closest('[data-page="dashboard"]');if(page)setTimeout(()=>{build();refresh();},100);
 });
 function start(){build();refresh();setInterval(refresh,60000);}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();