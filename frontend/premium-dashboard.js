(() => {
 "use strict";
 if (window.__TI_PREMIUM_DASHBOARD__) return;
 window.__TI_PREMIUM_DASHBOARD__ = true;
 const $ = (s,root=document) => root.querySelector(s);
 const money = value => Number(value||0).toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});
 const safe = value => String(value??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const headers = () => {
  const result={Accept:"application/json"};
  const init=window.Telegram?.WebApp?.initData||"";
  if(init) result["X-Telegram-Init-Data"]=init;
  return result;
 };
 function build(){
  const dash=$("#dashboard"),hero=$(".hero-card",dash);
  if(!dash||!hero||$("#premium-kpis")) return;
  const intro=$(".page-intro",dash);
  if(intro){
   const eyebrow=$(".eyebrow",intro);if(eyebrow)eyebrow.remove();
   const heading=$("h1",intro);if(heading)heading.textContent="Trading Intelligence PRO";
   const sub=$(".subtle",intro);if(sub)sub.remove();
   const pill=$(".live-pill",intro);if(pill)pill.innerHTML="<i></i> Live";
  }
  hero.insertAdjacentHTML("afterend",`
   <div id="premium-kpis">
    <article class="premium-kpi"><span class="kpi-icon">▣</span><span class="kpi-label">Баланс</span><strong id="premium-balance">—</strong><small>Доступно</small></article>
    <article class="premium-kpi"><span class="kpi-icon">▥</span><span class="kpi-label">P&amp;L (24ч)</span><strong id="premium-pnl24">—</strong><small id="premium-pnl24-sub">За последние 24 часа</small></article>
    <article class="premium-kpi"><span class="kpi-icon">♛</span><span class="kpi-label">Win Rate</span><strong id="premium-winrate">—</strong><small id="premium-winrate-sub">По закрытым сделкам</small></article>
   </div>
   <section id="premium-equity"><div class="premium-equity-head"><b>↗ График капитала</b><span>ИСТОРИЯ PAPER TRADING</span></div><div id="premium-equity-chart"></div></section>
   <section id="premium-positions"><div class="premium-section-head"><div class="premium-section-title"><i>▱</i>Открытые позиции</div><button class="premium-link" data-page="portfolio">Все позиции →</button></div><div id="premium-position-list"><div class="premium-empty">Загружаем позиции…</div></div></section>
   <section id="premium-activity"><div class="premium-section-head"><div class="premium-section-title"><i>ϟ</i>Последние сделки</div><button class="premium-link" data-page="portfolio">Вся история →</button></div><div id="premium-activity-list"><div class="premium-empty">Загружаем историю…</div></div></section>
  `);
  const nav=$(".bottom-nav");
  if(nav){
   const labels={dashboard:"Главная",signals:"Сигналы",portfolio:"Портфель",markets:"Аналитика"};
   nav.querySelectorAll(".nav-item").forEach(button=>{
    if(button.dataset.page==="strategies") button.remove();
    else if(button.dataset.page==="markets"){const label=$("small",button);if(label)label.textContent=labels.markets;}
    else {const label=$("small",button);if(label&&labels[button.dataset.page])label.textContent=labels[button.dataset.page];}
   });
   const market=nav.querySelector('[data-page="markets"]');
   if(market){const icon=$("span",market);if(icon)icon.textContent="◔";}
  }
  // Hide the older dashboard summary sections; their real data remains available on other tabs.
 }
 function drawEquity(trades,initial,equity){
  const host=$("#premium-equity-chart");if(!host)return;
  const ordered=[...trades].filter(t=>t.closed_at).sort((a,b)=>new Date(a.closed_at)-new Date(b.closed_at));
  let values=[Number(initial)||10000];
  ordered.forEach(t=>values.push(values[values.length-1]+(Number(t.net_pnl)||0)));
  if(values.length===1)values.push(Number(equity)||values[0]);
  const low=Math.min(...values,Number(equity)||values[0]),high=Math.max(...values,Number(equity)||values[0]);
  const min=low-(high-low||1)*.12,max=high+(high-low||1)*.12,range=max-min||1;
  const width=640,height=190,left=42,right=12,top=12,bottom=25;
  const points=values.map((v,i)=>`${left+i*(width-left-right)/Math.max(1,values.length-1)},${top+(max-v)/range*(height-top-bottom)}`);
  const last=points[points.length-1].split(",");
  const path=points.map((p,i)=>(i?"L":"M")+p).join(" ");
  const area=`${path} L ${last[0]},${height-bottom} L ${left},${height-bottom} Z`;
  const ticks=[0,.5,1].map(t=>{const y=top+t*(height-top-bottom),v=max-t*range;return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#ffffff12"/><text x="0" y="${y+4}" fill="#87918b" font-size="11">${(v/1000).toFixed(1)}k</text>`}).join("");
  host.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График изменения капитала"><defs><linearGradient id="ti-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#39e6a1" stop-opacity=".42"/><stop offset="100%" stop-color="#39e6a1" stop-opacity="0"/></linearGradient><filter id="ti-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${ticks}<path d="${area}" fill="url(#ti-area)"/><path d="${path}" fill="none" stroke="#39e6a1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#ti-glow)"/><circle cx="${last[0]}" cy="${last[1]}" r="5" fill="#39e6a1" stroke="#eafff5" stroke-width="2"/><text x="${left}" y="${height-3}" fill="#929c97" font-size="11">Начало</text><text x="${width-right}" y="${height-3}" fill="#929c97" font-size="11" text-anchor="end">Сейчас</text></svg>`;
 }
 async function refresh(){
  try{
   const [portfolioResponse,historyResponse]=await Promise.all([
    fetch("/api/portfolio",{headers:headers(),cache:"no-store"}),
    fetch("/api/history?limit=200",{headers:headers(),cache:"no-store"})
   ]);
   if(!portfolioResponse.ok||!historyResponse.ok)throw new Error("API unavailable");
   const portfolio=await portfolioResponse.json(),history=await historyResponse.json();
   const trades=history.trades||[],closed=trades.filter(t=>t.closed_at);
   const initial=Number(portfolio.initial_capital)||10000,balance=Number(portfolio.balance)||0,equity=Number(portfolio.equity)||balance;
   const totalPnl=equity-initial,pct=initial?totalPnl/initial*100:0;
   const heroBalance=$("#dashboard-balance"),heroPnl=$("#dashboard-pnl");
   if(heroBalance)heroBalance.textContent=money(equity);
   if(heroPnl)heroPnl.innerHTML=`<span class="${totalPnl>=0?"positive":"negative"}">${totalPnl>=0?"▲ +":"▼ "}${pct.toFixed(2)}% &nbsp; (${totalPnl>=0?"+":""}${money(totalPnl)})</span>`;
   const available=$("#premium-balance");if(available)available.textContent=money(balance);
   const wins=closed.filter(t=>Number(t.net_pnl)>0).length,rate=closed.length?wins/closed.length*100:null;
   const winrate=$("#premium-winrate");if(winrate)winrate.textContent=rate===null?"—":rate.toFixed(1)+"%";
   const wrsub=$("#premium-winrate-sub");if(wrsub)wrsub.textContent=`${closed.length} закрытых сделок`;
   const cutoff=Date.now()-86400000,day=closed.filter(t=>new Date(t.closed_at).getTime()>=cutoff);
   const dayPnl=day.reduce((sum,t)=>sum+(Number(t.net_pnl)||0),0);
   const pnl24=$("#premium-pnl24");if(pnl24){pnl24.textContent=(dayPnl>=0?"+":"")+money(dayPnl);pnl24.className=dayPnl>=0?"green":"red";}
   const daySub=$("#premium-pnl24-sub");if(daySub)daySub.textContent=`${day.length} закрытых сделок за 24ч`;
   drawEquity(closed,initial,equity);
   const positions=$("#premium-position-list");
   if(positions){
    const list=portfolio.positions||[];
    positions.innerHTML=list.length?list.slice(0,4).map(p=>{
     const up=Number(p.unrealized_pnl)>=0,coin=p.symbol.startsWith("BTC")?"₿":p.symbol.startsWith("ETH")?"◆":p.symbol.startsWith("SOL")?"◎":"◈";
     return `<div class="premium-position"><div class="premium-coin">${coin}</div><div class="premium-position-main"><b>${safe(p.symbol.replace("USDT",""))}/USDT</b><small>${safe(p.direction==="BUY"?"Long":"Short")} · ${safe(p.account)}</small></div><div class="premium-position-price"><b>${money(p.current_price)}</b><small>Вход: ${money(p.entry_price)}</small></div><div class="premium-pnl ${up?"":"loss"}">${up?"+":""}${money(p.unrealized_pnl)}</div></div>`;
    }).join(""):'<div class="premium-empty">Открытых позиций пока нет</div>';
   }
   const activity=$("#premium-activity-list");
   if(activity){
    const recent=closed.slice(0,3);
    activity.innerHTML=recent.length?recent.map(t=>{
     const up=Number(t.net_pnl)>=0;
     return `<div class="premium-activity-row"><div><b>${safe(t.symbol)} · ${safe(t.direction)}</b><small>${safe(t.strategy||"Paper Trading")} · ${safe(t.exit_reason||"Закрыта")}</small></div><strong class="${up?"positive":"negative"}">${up?"+":""}${money(t.net_pnl)}</strong></div>`;
    }).join(""):'<div class="premium-empty">Закрытых сделок пока нет</div>';
   }
  }catch(error){
   const host=$("#premium-position-list");if(host)host.innerHTML='<div class="premium-empty">Данные портфеля временно недоступны</div>';
  }
 }
 function start(){build();refresh();setInterval(refresh,60000);}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
 document.addEventListener("click",event=>{
  if(event.target.closest('[data-page="dashboard"]'))setTimeout(()=>{build();refresh();},120);
 });
})();