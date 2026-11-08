(() => {
  "use strict";
  if (window.__TI_DASHBOARD_POLISH__) return;
  window.__TI_DASHBOARD_POLISH__ = true;

  const css = `
    .ti-kpi-grid {
      display:grid!important;
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:11px!important;
      margin:16px 0 13px!important;
    }
    .ti-kpi {
      display:flex!important;
      flex-direction:column!important;
      justify-content:space-between!important;
      min-width:0!important;
      min-height:112px!important;
      padding:16px 14px!important;
      border-radius:19px!important;
      background:
        radial-gradient(circle at 92% 0%,rgba(255,255,255,.13),transparent 38%),
        linear-gradient(145deg,rgba(35,43,40,.97),rgba(8,12,11,.98))!important;
      border:1px solid rgba(230,244,237,.16)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14),
                 inset 0 -1px 0 rgba(0,0,0,.75),
                 0 14px 30px rgba(0,0,0,.38)!important;
      backdrop-filter:blur(18px) saturate(140%)!important;
      -webkit-backdrop-filter:blur(18px) saturate(140%)!important;
      position:relative!important;
      overflow:hidden!important;
    }
    .ti-kpi:after {
      content:""!important;
      position:absolute!important;
      width:90px!important;height:90px!important;
      right:-34px!important;top:-38px!important;
      border-radius:50%!important;
      background:radial-gradient(circle,rgba(255,255,255,.12),transparent 70%)!important;
      pointer-events:none!important;
    }
    .ti-kpi span {
      color:#aab5af!important;font-size:9px!important;
      font-weight:800!important;letter-spacing:1.25px!important;
    }
    .ti-kpi strong {
      display:block!important;margin-top:13px!important;
      color:#f5f8f6!important;font-size:clamp(22px,6vw,29px)!important;
      line-height:1.08!important;font-weight:800!important;
      letter-spacing:-.8px!important;white-space:nowrap!important;
    }
    .ti-kpi strong.green {color:#35e59b!important}
    .ti-kpi strong.red {color:#ff5968!important}
    .ti-equity {
      display:block!important;min-width:0!important;
      margin:0 0 22px!important;padding:18px 15px 13px!important;
      border-radius:21px!important;
      background:
        radial-gradient(ellipse at 88% 0%,rgba(255,255,255,.10),transparent 42%),
        linear-gradient(145deg,rgba(29,36,33,.97),rgba(7,10,9,.98))!important;
      border:1px solid rgba(230,244,237,.15)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.13),
                 0 17px 38px rgba(0,0,0,.4)!important;
      overflow:hidden!important;
    }
    .ti-equity-head {
      display:flex!important;align-items:center!important;
      justify-content:space-between!important;gap:10px!important;
      margin-bottom:12px!important;
    }
    .ti-equity-head b {font-size:15px!important;color:#f2f7f4!important}
    .ti-equity-head small {
      color:#8e9b94!important;font-size:7px!important;
      letter-spacing:.8px!important;text-align:right!important;
    }
    #ti-equity-chart {width:100%!important;min-height:165px!important}
    #ti-equity-chart svg {
      display:block!important;width:100%!important;height:175px!important;
      overflow:visible!important;
    }
    #ti-equity-chart .curve {
      fill:none!important;stroke:#35e59b!important;stroke-width:3!important;
      stroke-linecap:round!important;stroke-linejoin:round!important;
      filter:drop-shadow(0 0 6px rgba(53,229,155,.55))!important;
    }
    #ti-equity-chart .area {fill:url(#tiArea)!important}
    #ti-equity-chart .gridline {
      fill:none!important;stroke:rgba(255,255,255,.10)!important;
      stroke-width:1!important;stroke-dasharray:4 6!important;
    }
    #ti-equity-chart .empty-message {
      min-height:145px!important;display:grid!important;
      place-items:center!important;color:#9ba69f!important;
      border:0!important;background:transparent!important;
    }
    .coin-icon,.coin-avatar {
      width:42px!important;height:42px!important;flex:0 0 42px!important;
      border-radius:50%!important;object-fit:contain!important;
      background:radial-gradient(circle at 30% 25%,#3b4540,#101513 72%)!important;
      border:1px solid rgba(255,255,255,.17)!important;
      box-shadow:inset 0 1px 3px rgba(255,255,255,.18),
                 0 5px 13px rgba(0,0,0,.45)!important;
    }
    .coin-icon {display:grid!important;place-items:center!important;color:transparent!important;font-size:0!important}
    .coin-line>div:first-child {display:flex!important;align-items:center!important;gap:9px!important;min-width:0!important}
    .coin-line .coin-name {font-size:12px!important;font-weight:800!important}
    .coin-line .coin-sub {font-size:9px!important}
    @media(max-width:380px) {
      .ti-kpi {padding:14px 11px!important;min-height:105px!important}
      .ti-kpi strong {font-size:21px!important}
      .ti-equity {padding:15px 12px 11px!important}
    }
  `;
  const style=document.createElement("style");
  style.id="ti-dashboard-polish-style";
  style.textContent=css;
  document.head.appendChild(style);

  const slugs={BTC:"btc",ETH:"eth",BNB:"bnb",SOL:"sol",XRP:"xrp",ADA:"ada",DOGE:"doge",AVAX:"avax"};
  const logo=(symbol)=> {
    const code=String(symbol||"").replace("USDT","").toUpperCase();
    const slug=slugs[code];
    return slug ? "https://assets.coincap.io/assets/icons/"+slug+"@2x.png" : "";
  };

  function addLogos(root=document) {
    root.querySelectorAll(".coin-icon").forEach(el=>{
      if(el.querySelector("img")) return;
      const src=logo(el.dataset.coin||el.textContent.trim());
      if(!src) return;
      const img=document.createElement("img");
      img.className="coin-avatar";
      img.src=src;img.alt=el.dataset.coin||"Crypto";img.loading="lazy";
      img.onerror=()=>{img.remove();el.textContent=(el.dataset.coin||"").slice(0,1)};
      el.textContent="";el.appendChild(img);
    });

    root.querySelectorAll(".mini-market .coin-line>div:first-child").forEach(group=>{
      if(group.querySelector(".coin-avatar")) return;
      const name=group.querySelector(".coin-name");
      if(!name) return;
      const src=logo(name.textContent.trim());
      if(!src) return;
      const img=document.createElement("img");
      img.className="coin-avatar";img.src=src;img.alt=name.textContent.trim();img.loading="lazy";
      img.onerror=()=>img.remove();
      group.insertBefore(img,group.firstChild);
    });
  }

  function run(){addLogos(document)}
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",run,{once:true});
  else run();

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType===1) addLogos(node);
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener("click",e=>{
    if(e.target.closest("[data-page]")) setTimeout(run,100);
  });
})();