
/* Trading Intelligence PRO — V3: time-scaled equity history + five-tab navigation */
(() => {
 "use strict";
 if (window.__TI_REFERENCE_DASHBOARD_V3__) return;
 window.__TI_REFERENCE_DASHBOARD_V3__ = true;

 const $ = (s, r=document) => r.querySelector(s);
 const money = v => Number(v || 0).toLocaleString("en-US", {
  style:"currency", currency:"USD", minimumFractionDigits:2, maximumFractionDigits:2
 });
 const safe = v => String(v ?? "").replace(/[&<>"]/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"
 }[c]));
 const coin = s => String(s || "").replace(/USDT|USD|\/.*/g, "").toUpperCase();

 const logoIds = {
  BTC:"bitcoin", ETH:"ethereum", BNB:"binancecoin", SOL:"solana",
  XRP:"ripple", ADA:"cardano", DOGE:"dogecoin", AVAX:"avalanche-2",
  LINK:"chainlink", LTC:"litecoin"
 };

 const logoUrl = s => logoIds[coin(s)]
  ? `https://assets.coincap.io/assets/icons/${coin(s).toLowerCase()}@2x.png`
  : "";

 const icons = {
  home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/></svg>',

  signal:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h3l3-8 4 10 3-7h5"/><path d="M17 5h4v4"/></svg>',

  portfolio:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v13H3z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>',

  analytics:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M16 6h4v4"/></svg>'
 };

 const headers = () => {
  const h = {Accept:"application/json"};
  const initData = window.Telegram?.WebApp?.initData || "";

  if (initData) {
   h["X-Telegram-Init-Data"] = initData;
  }

  return h;
 };

 let range = "1D";
 let portfolio = null;
 let trades = [];

 function injectNavFix() {
  if ($("#ti-v3-nav-fix")) return;

  const style = document.createElement("style");
  style.id = "ti-v3-nav-fix";

  style.textContent = `
   .bottom-nav{
    display:grid!important;
    grid-template-columns:repeat(5,minmax(0,1fr))!important;
    grid-auto-flow:row!important;
    align-items:stretch!important;
    justify-items:stretch!important;
    justify-content:stretch!important;
    gap:4px!important;
    width:calc(100% - 24px)!important;
    max-width:710px!important;
    left:50%!important;
    right:auto!important;
    transform:translateX(-50%)!important;
    box-sizing:border-box!important;
    padding:6px!important;
   }

   .bottom-nav>.nav-item{
    display:flex!important;
    flex:initial!important;
    float:none!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    margin:0!important;
    justify-self:stretch!important;
    align-self:stretch!important;
    box-sizing:border-box!important;
   }

   .bottom-nav>.nav-item>span{
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
   }

   .bottom-nav>.nav-item>small{
    display:block!important;
    white-space:nowrap!important;
    text-align:center!important;
   }

   #premium-equity-chart{
    width:100%!important;
    min-width:0!important;
   }

   #premium-equity-chart svg{
    display:block!important;
    width:100%!important;
    height:auto!important;
    overflow:visible!important;
   }

   @media(max-width:380px){
    .bottom-nav{
     gap:2px!important;
     padding:5px!important;
    }

    .bottom-nav>.nav-item>small{
     font-size:9px!important;
    }
   }
  `;

  document.head.appendChild(style);
 }

 function ensureHeroArt(hero) {
  if ($("#ti-hero-art", hero)) return;

  hero.insertAdjacentHTML("beforeend", `
   <div id="ti-hero-art" aria-hidden="true">
    <svg viewBox="0 0 300 190">
     <defs>
      <linearGradient id="ti-arrow-gradient" x1="0" y1="1" x2="1" y2="0">
       <stop offset="0" stop-color="#087b5b"/>
       <stop offset=".52" stop-color="#2be7a5"/>
       <stop offset="1" stop-color="#a2ffdc"/>
      </linearGradient>

      <linearGradient id="ti-wave-gradient" x1="0" y1="0" x2="1" y2="0">
       <stop stop-color="#0d755b" stop-opacity="0"/>
       <stop offset=".55" stop-color="#36e9ad" stop-opacity=".8"/>
       <stop offset="1" stop-color="#a0ffdc" stop-opacity=".1"/>
      </linearGradient>

      <filter id="ti-arrow-blur">
       <feGaussianBlur stdDeviation="7"/>
      </filter>
     </defs>

     <path
      d="M9 158 C58 151 78 110 120 117 S188 94 252 28"
      fill="none"
      stroke="#22e5a2"
      stroke-width="23"
      opacity=".28"
      filter="url(#ti-arrow-blur)"
     />

     <path
      d="M4 163 C52 156 75 119 116 124 S183 99 251 34"
      fill="none"
      stroke="url(#ti-wave-gradient)"
      stroke-width="7"
      stroke-linecap="round"
     />

     <path
      d="M44 161 C87 150 102 133 136 135 S193 110 241 58"
      fill="none"
      stroke="#52f2bb"
      stroke-width="3"
      opacity=".42"
     />

     <path
      d="M203 31 263 4 255 67"
      fill="none"
      stroke="url(#ti-arrow-gradient)"
      stroke-width="25"
      stroke-linecap="round"
      stroke-linejoin="round"
     />

     <path
      d="M203 31 263 4 255 67"
      fill="none"
      stroke="#b7ffe4"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity=".42"
     />
    </svg>
   </div>
  `);
 }

 /* MIRAGE FIX: five main navigation tabs */
 function buildNav() {
  const nav = $(".bottom-nav");
  if (!nav) return;

  const tabs = [
   ["dashboard","Обзор","home"],
   ["markets","Рынки","analytics"],
   ["signals","Сигналы","signal"],
   ["strategies","Стратегии","analytics"],
   ["portfolio","Портфель","portfolio"]
  ];

  const activePage = $(".page.active")?.id || "dashboard";

  nav.innerHTML = tabs.map(([page,label,ic]) =>
   `<button
     type="button"
     class="nav-item ${page===activePage?"active":""}"
     data-page="${page}"
     aria-label="${label}">
      <span>${icons[ic]}</span>
      <small>${label}</small>
    </button>`
  ).join("");

  nav.setAttribute("aria-label","Основная навигация");
 }

 function buildDashboard() {
  const dash = $("#dashboard");
  const hero = $(".hero-card", dash);

  if (!dash || !hero) return;

  const intro = $(".page-intro", dash);
  const heading = $("h1", intro);

  if (heading) {
   heading.textContent = "Trading Intelligence PRO";
  }

  const live = $(".live-pill", intro);

  if (live) {
   live.innerHTML = "<i></i> Live";
  }

  const overline = $(".overline", hero);

  if (overline) {
   overline.textContent = "Общий капитал";
  }

  ensureHeroArt(hero);

  if (!$("#premium-kpis")) {
   hero.insertAdjacentHTML("afterend", `
    <div id="premium-kpis">

     <article class="premium-kpi">
      <span class="kpi-icon">▣</span>
      <span class="kpi-label">Баланс</span>
      <strong id="premium-balance">—</strong>
      <small>Доступно</small>
     </article>

     <article class="premium-kpi">
      <span class="kpi-icon">▥</span>
      <span class="kpi-label">P&amp;L (24ч)</span>
      <strong id="premium-pnl24">—</strong>
      <small id="premium-pnl24-sub">За последние 24 часа</small>
     </article>

     <article class="premium-kpi">
      <span class="kpi-icon">🏆</span>
      <span class="kpi-label">Win Rate</span>
      <strong id="premium-winrate">—</strong>
      <small id="premium-winrate-sub">По закрытым сделкам</small>
     </article>

    </div>

    <section id="premium-equity">
     <div class="premium-equity-head">
      <b>↗ График капитала</b>

      <div class="premium-chart-tools">
       <button class="active" data-equity-range="1D">1Д</button>
       <button data-equity-range="1H">1Н</button>
       <button data-equity-range="1M">1М</button>
       <button data-equity-range="ALL">ВСЕ</button>
      </div>
     </div>

     <div id="premium-equity-chart"></div>
    </section>

    <section id="premium-positions">
     <div class="premium-section-head">
      <div class="premium-section-title">
       <i>◈</i>Открытые позиции
      </div>
      <button class="premium-link" data-page="portfolio">
       Все позиции →
      </button>
     </div>

     <div id="premium-position-list">
      <div class="premium-empty">Загружаем позиции…</div>
     </div>
    </section>

    <section id="premium-activity">
     <div class="premium-section-head">
      <div class="premium-section-title">
       <i>ϟ</i>Последние сделки
      </div>
      <button class="premium-link" data-page="portfolio">
       Вся история →
      </button>
     </div>

     <div id="premium-activity-list">
      <div class="premium-empty">Загружаем историю…</div>
     </div>
    </section>
   `);
  }

  buildNav();
 }

 function timestamp(trade) {
  const value =
   trade.closed_at ||
   trade.created_at ||
   trade.timestamp;

  const result = value
   ? new Date(value).getTime()
   : NaN;

  return Number.isFinite(result) ? result : 0;
 }

 const PERIODS = {
  "1D":86400000,
  "1H":7*86400000,
  "1M":30*86400000
 };

 function equityPoints(initial, currentEquity) {
  const now = Date.now();

  const ordered = trades
   .filter(t => timestamp(t) > 0 && timestamp(t) <= now)
   .slice()
   .sort((a,b) => timestamp(a)-timestamp(b));

  const firstTrade = ordered.length
   ? timestamp(ordered[0])
   : now;

  const start = range === "ALL"
   ? firstTrade
   : now - PERIODS[range];

  const earlier = ordered.filter(t => timestamp(t) < start);
  const visible = ordered.filter(t => timestamp(t) >= start);

  const opening = (Number(initial) || 10000) +
   earlier.reduce(
    (sum,t) => sum + (Number(t.net_pnl) || 0),
    0
   );

  const points = [{
   ts:start,
   value:opening
  }];

  let value = opening;

  visible.forEach(t => {
   value += Number(t.net_pnl) || 0;

   points.push({
    ts:timestamp(t),
    value
   });
  });

  // Current equity includes live mark-to-market PnL.
  // Historical closed trades do not.

  const latest = Number(currentEquity);

  if (Number.isFinite(latest)) {
   if (
    Math.abs(points[points.length-1].value-latest) > 0.005 ||
    points.length === 1
   ) {
    points.push({
     ts:now,
     value:latest
    });
   } else {
    points[points.length-1].ts = now;
   }
  }

  return points;
 }

 function drawChart(initial, currentEquity) {
  const host = $("#premium-equity-chart");
  if (!host) return;

  const points = equityPoints(initial, currentEquity);

  const width=640;
  const height=225;
  const left=48;
  const right=10;
  const top=15;
  const bottom=34;

  const now=Date.now();

  const start=range==="ALL"
   ? points[0].ts
   : now-PERIODS[range];

  const end=now;

  const values=points.map(p=>p.value);

  const low=Math.min(...values);
  const high=Math.max(...values);

  const pad=(high-low || Math.max(1,Math.abs(high)*0.008))*0.18;

  const min=low-pad;
  const max=high+pad;
  const ySpan=max-min || 1;

  const x=ts =>
   left+
   Math.max(0,Math.min(1,(ts-start)/Math.max(1,end-start)))*
   (width-left-right);

  const y=v =>
   top+(max-v)/ySpan*(height-top-bottom);

  const path=points.map((p,i)=>
   `${i?"L":"M"}${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)}`
  ).join(" ");

  const area=
   `${path} L${x(points[points.length-1].ts).toFixed(1)},${height-bottom}`+
   ` L${x(points[0].ts).toFixed(1)},${height-bottom}Z`;

  const grid=[0,.5,1].map(q=>{
   const yy=top+q*(height-top-bottom);
   const v=max-q*ySpan;

   return `
    <line
     x1="${left}"
     y1="${yy}"
     x2="${width-right}"
     y2="${yy}"
     stroke="#ffffff12"
    />

    <text
     x="0"
     y="${yy+4}"
     fill="#a1a4b5"
     font-size="11">
     ${(v/1000).toFixed(1)}k
    </text>
   `;
  }).join("");

  const labelAt=ts=>{
   const d=new Date(ts);

   return range==="1D"
    ? d.toLocaleTimeString("ru-RU",{
       hour:"2-digit",
       minute:"2-digit"
      })
    : d.toLocaleDateString("ru-RU",{
       day:"2-digit",
       month:"2-digit"
      });
  };

  const labels=Array.from({length:5},(_,i)=>{
   const ts=start+(end-start)*i/4;
   const xx=left+(width-left-right)*i/4;

   const label=range==="ALL"
    ? (i===0?"Начало":i===4?"Сейчас":labelAt(ts))
    : labelAt(ts);

   return `
    <text
     x="${xx}"
     y="${height-5}"
     fill="#a1a4b5"
     font-size="11"
     text-anchor="${i===0?"start":i===4?"end":"middle"}">
     ${label}
    </text>
   `;
  }).join("");

  const dots=points.slice(1,-1).map(p=>
   `<circle
     cx="${x(p.ts)}"
     cy="${y(p.value)}"
     r="2.5"
     fill="#35e6a5"
    />`
  ).join("");

  host.innerHTML=`
   <svg
    viewBox="0 0 ${width} ${height}"
    role="img"
    aria-label="График капитала за выбранный период">

    <defs>
     <linearGradient
      id="ti-fill-v3"
      x1="0"
      x2="0"
      y1="0"
      y2="1">
      <stop
       offset="0%"
       stop-color="#35e6a5"
       stop-opacity=".42"
      />
      <stop
       offset="100%"
       stop-color="#35e6a5"
       stop-opacity="0"
      />
     </linearGradient>

     <filter id="ti-glow-v3">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge>
       <feMergeNode in="b"/>
       <feMergeNode in="SourceGraphic"/>
      </feMerge>
     </filter>
    </defs>

    ${grid}

    <path
     d="${area}"
     fill="url(#ti-fill-v3)"
    />

    <path
     d="${path}"
     fill="none"
     stroke="#35e6a5"
     stroke-width="2.8"
     stroke-linecap="round"
     stroke-linejoin="round"
     filter="url(#ti-glow-v3)"
    />

    ${dots}

    <circle
     cx="${x(points[points.length-1].ts)}"
     cy="${y(points[points.length-1].value)}"
     r="6"
     fill="#35e6a5"
     stroke="#eafff5"
     stroke-width="2"
    />

    ${labels}
   </svg>
  `;
 }

 function renderPositions(list) {
  const host=$("#premium-position-list");
  if(!host)return;

  host.innerHTML=list.length
   ? list.slice(0,4).map(p=>{
      const up=Number(p.unrealized_pnl)>=0;
      const c=coin(p.symbol);
      const src=logoUrl(c);

      return `
       <div class="premium-position">

        <div class="premium-coin">
         ${
          src
           ? `<img src="${src}" alt="${safe(c)}" loading="lazy">`
           : `<b>${safe(c.slice(0,1))}</b>`
         }
        </div>

        <div class="premium-position-main">
         <b>${safe(c)}/USDT</b>
         <small>
          ${safe(p.direction==="BUY"?"Long":"Short")}
          ·
          ${safe(p.account||p.strategy||"Paper")}
         </small>
        </div>

        <div class="premium-position-price">
         <b>${money(p.current_price)}</b>
         <small>Вход: ${money(p.entry_price)}</small>
        </div>

        <div class="premium-pnl ${up?"":"loss"}">
         ${up?"+":""}${money(p.unrealized_pnl)}
         <small>
          ${up?"+":""}${Number(p.unrealized_pnl_pct||0).toFixed(2)}%
         </small>
        </div>

       </div>
      `;
     }).join("")
   : '<div class="premium-empty">Открытых позиций пока нет</div>';
 }

 function renderActivity(rows) {
  const host=$("#premium-activity-list");
  if(!host)return;

  const recent=rows
   .filter(t=>t.closed_at)
   .slice(0,3);

  host.innerHTML=recent.length
   ? recent.map(t=>{
      const up=Number(t.net_pnl)>=0;
      const buy=t.direction==="BUY";
      const sym=coin(t.symbol);

      return `
       <div class="premium-activity-row">

        <i class="premium-activity-bar ${buy?"":"loss"}"></i>

        <span class="premium-activity-badge ${buy?"":"loss"}">
         ${buy?"A":"S"}
        </span>

        <div class="premium-activity-copy">
         <b>${safe(sym)}USDT</b>
         <small>
          ${buy?"Long":"Short"}
          ·
          ${safe(t.strategy||"Paper Trading")}
         </small>
        </div>

        <div class="premium-activity-result">
         <strong class="${up?"":"loss"}">
          ${up?"+":""}${money(t.net_pnl)}
         </strong>
         <small>${safe(t.exit_reason||"Закрыта")}</small>
        </div>

       </div>
      `;
     }).join("")
   : '<div class="premium-empty">История сделок пока пуста</div>';
 }

 async function refresh() {
  try {
   const [
    portfolioResponse,
    historyResponse
   ]=await Promise.all([
    fetch("/api/portfolio",{
     headers:headers(),
     cache:"no-store"
    }),

    fetch("/api/history?limit=200",{
     headers:headers(),
     cache:"no-store"
    })
   ]);

   if(!portfolioResponse.ok || !historyResponse.ok) {
    throw new Error("API unavailable");
   }

   const p=await portfolioResponse.json();
   const history=await historyResponse.json();

   portfolio=p;

   trades=(history.trades||[])
    .filter(t=>t.closed_at)
    .sort((a,b)=>timestamp(b)-timestamp(a));

   const initial=Number(p.initial_capital)||10000;
   const balance=Number(p.balance)||0;
   const equity=Number(p.equity)||balance;

   const pnl=equity-initial;
   const pct=initial?pnl/initial*100:0;

   const heroBalance=$("#dashboard-balance");
   const heroPnl=$("#dashboard-pnl");

   if(heroBalance) {
    heroBalance.textContent=money(equity);
   }

   if(heroPnl) {
    heroPnl.innerHTML=
     `${pnl>=0?"▲ +":"▼ "}${pct.toFixed(2)}% &nbsp; `+
     `(${pnl>=0?"+":""}${money(pnl)})`;
   }

   const balanceNode=$("#premium-balance");

   if(balanceNode) {
    balanceNode.textContent=money(balance);
   }

   const wins=trades.filter(
    t=>Number(t.net_pnl)>0
   ).length;

   const winrate=$("#premium-winrate");

   if(winrate) {
    winrate.textContent=trades.length
     ? (wins/trades.length*100).toFixed(1)+"%"
     : "—";
   }

   const winrateSub=$("#premium-winrate-sub");

   if(winrateSub) {
    winrateSub.textContent=
     `${trades.length} закрытых сделок`;
   }

   const cutoff=Date.now()-86400000;

   const day=trades.filter(
    t=>timestamp(t)>=cutoff
   );

   const dayPnl=day.reduce(
    (sum,t)=>sum+(Number(t.net_pnl)||0),
    0
   );

   const pnl24=$("#premium-pnl24");

   if(pnl24) {
    pnl24.textContent=
     (dayPnl>=0?"+":"")+money(dayPnl);

    pnl24.className=dayPnl>=0?"green":"red";
   }

   const pnl24Sub=$("#premium-pnl24-sub");

   if(pnl24Sub) {
    pnl24Sub.textContent=
     `${day.length} закрытых сделок за 24ч`;
   }

   drawChart(initial,equity);

   renderPositions(p.positions||[]);
   renderActivity(trades);

  } catch(error) {
   const host=$("#premium-position-list");

   if(host) {
    host.innerHTML=
     '<div class="premium-empty">Данные портфеля временно недоступны</div>';
   }
  }
 }

 document.addEventListener("click",event=>{
  const button=event.target.closest("[data-equity-range]");
  if(!button)return;

  range=button.dataset.equityRange;

  document.querySelectorAll("[data-equity-range]")
   .forEach(node=>{
    node.classList.toggle("active",node===button);
   });

  if(portfolio) {
   drawChart(
    Number(portfolio.initial_capital)||10000,
    Number(portfolio.equity)||
     Number(portfolio.balance)||0
   );
  }
 });

 function start() {
  injectNavFix();
  buildDashboard();
  refresh();

  setInterval(refresh,60000);
 }

 if(document.readyState==="loading") {
  document.addEventListener(
   "DOMContentLoaded",
   start,
   {once:true}
  );
 } else {
  start();
 }

})();
 
