(() => {
  "use strict";
  if (window.__TI_OBSIDIAN__) return;
  window.__TI_OBSIDIAN__ = true;

  const style = document.createElement("style");
  style.textContent = `
  :root{--obs-bg:#050607;--obs-panel:#111416;--obs-line:rgba(255,255,255,.09);--obs-muted:#858d91;--obs-green:#39e39a;--obs-red:#ff626d}
  body{background:radial-gradient(ellipse at 18% 4%,rgba(105,118,119,.13),transparent 33%),radial-gradient(ellipse at 90% 30%,rgba(83,91,92,.10),transparent 30%),#050607!important;color:#f3f5f4}
  body:before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(circle at 12% 17%,rgba(255,255,255,.055),transparent 12%),radial-gradient(circle at 88% 12%,rgba(255,255,255,.04),transparent 13%),radial-gradient(circle at 92% 75%,rgba(255,255,255,.035),transparent 15%);filter:blur(12px)}
  .topbar,.bottom-nav{background:rgba(6,8,9,.94)!important;border-color:rgba(255,255,255,.10)!important;backdrop-filter:blur(24px) saturate(145%)!important}
  .brand-mark{background:linear-gradient(145deg,#343a3b,#080a0b)!important;border:1px solid rgba(255,255,255,.24)!important;box-shadow:inset 0 1px 1px #ffffff45,0 8px 25px #000!important}
  .brand-mark span{color:#f5f7f6!important}.brand-mark i{background:linear-gradient(90deg,#fff,#7c8584)!important}
  .hero-card,.portfolio-total,.strategy-summary,.strategy-card,.status-card,.mini-market,.chart-panel,.analysis-card,.analysis-placeholder,.position-card,.stat-box,.account-row,.history-row,.risk-note{
    background:linear-gradient(145deg,rgba(31,36,37,.96),rgba(10,13,14,.98))!important;border:1px solid rgba(255,255,255,.105)!important;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.10),inset 0 -1px 0 rgba(0,0,0,.65),0 14px 34px rgba(0,0,0,.28)!important;backdrop-filter:blur(16px)}
  .hero-card{position:relative;overflow:hidden;border-radius:23px!important;background:radial-gradient(ellipse at 88% 5%,rgba(255,255,255,.13),transparent 34%),linear-gradient(135deg,#202526,#0b0e0f 68%)!important}
  .hero-card:after{content:"";position:absolute;right:-48px;top:-80px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle at 32% 28%,#ffffff36, #858e8b18 28%,#080a0b00 68%);box-shadow:inset -12px -18px 35px #0009;pointer-events:none}
  .hero-balance{color:#f7f9f8!important;text-shadow:0 2px 22px #fff2}
  .hero-pnl,.positive,.nav-item.active{color:var(--obs-green)!important}.negative{color:var(--obs-red)!important}
  .eyebrow,.overline{color:#9ca5a3!important;letter-spacing:1.6px}
  h1,h2,h3,.strategy-balance,.portfolio-total b{color:#f3f6f5!important}
  .paper-tag,.live-pill{border-color:#ffffff25!important;background:#ffffff0b!important;color:#c6cecb!important}
  .status-dot.good,.connection i,.live-pill i{background:var(--obs-green)!important;box-shadow:0 0 12px #39e39a88!important}
  .nav-item{padding:9px 2px!important;border-radius:13px;transition:all .22s ease}
  .nav-item span{font-size:23px!important}.nav-item small{font-size:9px!important;font-weight:700;letter-spacing:.2px}
  .nav-item.active{background:linear-gradient(145deg,#ffffff18,#ffffff05)!important;box-shadow:inset 0 1px #ffffff24,0 5px 18px #0008}
  .nav-item.active span{filter:drop-shadow(0 0 8px #39e39a55)!important}
  .market-row{border-color:#ffffff0d!important;background:linear-gradient(110deg,#171c1d,#0d1011)!important;border-radius:14px!important;margin-bottom:7px}
  .market-row.selected{border-color:#39e39a66!important;background:linear-gradient(110deg,#1c2925,#111716)!important}
  .coin-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;font-size:0!important;background:#202627!important;border:1px solid #ffffff19!important}
  .coin-icon:after{content:"";width:29px;height:29px;background-size:contain;background-position:center;background-repeat:no-repeat}
  .coin-icon[data-coin="BTC"]:after{background-image:url('https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=040')}
  .coin-icon[data-coin="ETH"]:after{background-image:url('https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=040')}
  .coin-icon[data-coin="BNB"]:after{background-image:url('https://cryptologos.cc/logos/bnb-bnb-logo.svg?v=040')}
  .coin-icon[data-coin="SOL"]:after{background-image:url('https://cryptologos.cc/logos/solana-sol-logo.svg?v=040')}
  .coin-icon[data-coin="XRP"]:after{background-image:url('https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=040')}
  .coin-icon[data-coin="ADA"]:after{background-image:url('https://cryptologos.cc/logos/cardano-ada-logo.svg?v=040')}
  .ti-kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:13px 0 23px}
  .ti-kpi{min-width:0;padding:15px;border:1px solid #ffffff12;border-radius:16px;background:linear-gradient(145deg,#1b2021,#0c1011);box-shadow:inset 0 1px #ffffff12,0 10px 22px #0005}
  .ti-kpi span{display:block;color:#929b99;font-size:10px;letter-spacing:.6px}
  .ti-kpi strong{display:block;margin-top:8px;font:800 20px Manrope,sans-serif;color:#f5f7f6}
  .ti-kpi strong.green{color:var(--obs-green)}.ti-kpi strong.red{color:var(--obs-red)}
  .ti-equity{padding:16px 14px 10px;margin:0 0 23px;border:1px solid #ffffff12;border-radius:19px;background:linear-gradient(145deg,#171c1d,#0a0d0e);box-shadow:inset 0 1px #ffffff12,0 12px 28px #0005}
  .ti-equity-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}
  .ti-equity-head b{font:700 13px Manrope,sans-serif}.ti-equity-head small{color:#89928f;font-size:9px}
  .ti-equity svg{display:block;width:100%;height:120px;overflow:visible}
  .ti-equity .gridline{stroke:#ffffff12;stroke-width:1;stroke-dasharray:3 5}
  .ti-equity .curve{fill:none;stroke:#39e39a;stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 5px #39e39a66)}
  .ti-equity .area{fill:url(#tiArea)}
  @media(max-width:380px){.ti-kpi strong{font-size:17px}.ti-kpi{padding:12px}.nav-item span{font-size:21px!important}}
  `;
  document.head.appendChild(style);

  const $ = (s, root=document) => root.querySelector(s);
  const money = v => Number(v||0).toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});
  const esc = v => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function addDashboardBlocks(){
    const hero=$(".hero-card");
    if(!hero || $("#ti-kpi-grid")) return;
    hero.insertAdjacentHTML("afterend",`
      <div class="ti-kpi-grid" id="ti-kpi-grid">
        <div class="ti-kpi"><span>WIN RATE</span><strong id="ti-winrate">—</strong></div>
        <div class="ti-kpi"><span>P&amp;L · 24 ЧАСА</span><strong id="ti-pnl24">—</strong></div>
      </div>
      <section class="ti-equity"><div class="ti-equity-head"><b>Динамика капитала</b><small>ПО ЗАКРЫТЫМ СДЕЛКАМ</small></div><div id="ti-equity-chart"><div class="loading-state">Загружаем историю сделок…</div></div></section>`);
  }
  function drawCurve(trades, initial, equity){
    const host=$("#ti-equity-chart"); if(!host) return;
    const ordered=[...trades].filter(t=>t.closed_at && Number.isFinite(Number(t.net_pnl))).sort((a,b)=>new Date(a.closed_at)-new Date(b.closed_at));
    if(!ordered.length){host.innerHTML='<div class="empty-message">График появится после первых закрытых сделок</div>';return;}
    let value=Number(initial)||10000; const values=[value];
    ordered.forEach(t=>{value+=Number(t.net_pnl)||0;values.push(value)});
    // Latest equity is shown as a final point; the path itself is derived only from recorded trades.
    const last=Number(equity); if(Number.isFinite(last) && Math.abs(last-values[values.length-1])>0.01) values.push(last);
    const w=600,h=120,pad=8,min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,1);
    const pts=values.map((v,i)=>[pad+i*(w-2*pad)/Math.max(values.length-1,1),h-pad-(v-min)/range*(h-2*pad)]);
    const path=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
    const area=path+` L ${pts[pts.length-1][0]} ${h} L ${pts[0][0]} ${h} Z`;
    host.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Динамика капитала по закрытым сделкам"><defs><linearGradient id="tiArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#39e39a" stop-opacity=".25"/><stop offset="1" stop-color="#39e39a" stop-opacity="0"/></linearGradient></defs><path class="gridline" d="M0 30H600 M0 60H600 M0 90H600"/><path class="area" d="${area}"/><path class="curve" d="${path}"/></svg>`;
  }
  async function refreshStats(){
    try{
      const headers={Accept:"application/json"};
      const init=window.Telegram?.WebApp?.initData||"";
      if(init) headers["X-Telegram-Init-Data"]=init;
      const [pRes,hRes]=await Promise.all([fetch("/api/portfolio",{headers,cache:"no-store"}),fetch("/api/history?limit=200",{headers,cache:"no-store"})]);
      if(!pRes.ok||!hRes.ok) throw new Error("stats unavailable");
      const portfolio=await pRes.json(), history=await hRes.json(), trades=history.trades||[];
      const closed=trades.filter(t=>t.closed_at);
      const wins=closed.filter(t=>Number(t.net_pnl)>0).length;
      const rate=closed.length?wins/closed.length*100:null;
      const cutoff=Date.now()-24*60*60*1000;
      const pnl24=closed.filter(t=>new Date(t.closed_at).getTime()>=cutoff).reduce((sum,t)=>sum+(Number(t.net_pnl)||0),0);
      const wr=$("#ti-winrate"),pn=$("#ti-pnl24");
      if(wr) wr.textContent=rate===null?"—":rate.toFixed(1)+"%";
      if(pn){pn.textContent=(pnl24>=0?"+":"")+money(pnl24);pn.className=pnl24>=0?"green":"red";}
      drawCurve(closed,portfolio.initial_capital,portfolio.equity);
    }catch(e){const host=$("#ti-equity-chart");if(host)host.innerHTML='<div class="empty-message">Статистика временно недоступна</div>';}
  }
  function decorateCoins(){
    document.querySelectorAll(".coin-icon").forEach(el=>{const coin=el.textContent.trim().toUpperCase();el.dataset.coin=coin;});
  }
  function run(){
    addDashboardBlocks();decorateCoins();refreshStats();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run();
  document.addEventListener("click",e=>{if(e.target.closest('[data-page="dashboard"]'))setTimeout(run,100)});
  setInterval(()=>{if(document.visibilityState==="visible")refreshStats()},60000);
})();