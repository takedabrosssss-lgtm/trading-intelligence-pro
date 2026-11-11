/* MIRAGE 4.2 — Signal Intelligence. Read-only analytics; no order execution. */
(() => {
  "use strict";
  if (window.__MIRAGE_SIGNAL_INTELLIGENCE_42__) return;
  window.__MIRAGE_SIGNAL_INTELLIGENCE_42__ = true;

  const page = document.getElementById("signals");
  const anchor = document.getElementById("analysis-result");
  if (!page || !anchor) return;

  const style = document.createElement("style");
  style.textContent = `
    .m4-panel.m42-signal-panel{margin:18px 0 26px;padding:15px;border:1px solid rgba(91,221,160,.2);border-radius:19px;background:linear-gradient(145deg,#101b17,#080e0c 72%);color:#e9f5ed;box-shadow:0 14px 38px #0003}
    .m42-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:13px}
    .m42-kicker{font-size:8px;letter-spacing:1.8px;color:#6fe1a8;font-weight:800}
    .m42-title{font:800 16px Manrope,sans-serif;margin-top:4px}
    .m42-sub{font-size:9px;color:#8ea99a;margin-top:4px;line-height:1.45}
    .m42-refresh{border:1px solid #326348;background:#10271c;color:#a5f0c5;border-radius:10px;padding:9px 11px;font-size:10px;font-weight:700;white-space:nowrap}
    .m42-refresh:disabled{opacity:.5}
    .m42-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
    .m42-stat{padding:10px;border:1px solid #ffffff10;border-radius:12px;background:#ffffff06;min-width:0}
    .m42-stat small{display:block;color:#8ca899;font-size:8px;line-height:1.3}
    .m42-stat b{display:block;margin-top:6px;font:800 15px Manrope,sans-serif;overflow-wrap:anywhere}
    .m42-section{margin-top:16px}
    .m42-section-title{font-size:10px;font-weight:800;letter-spacing:.5px;color:#b9d8c6;margin-bottom:8px}
    .m42-table-wrap{overflow-x:auto;border:1px solid #ffffff12;border-radius:12px}
    .m42-table{border-collapse:collapse;width:100%;min-width:530px;font-size:9px}
    .m42-table th,.m42-table td{padding:9px 7px;text-align:right;border-bottom:1px solid #ffffff0d;white-space:nowrap}
    .m42-table th{color:#86a493;background:#ffffff07;font-weight:700}
    .m42-table td{color:#d9e8df}.m42-table th:first-child,.m42-table td:first-child{text-align:left}
    .m42-table tr:last-child td{border-bottom:0}
    .m42-good{color:#69e4a5!important}.m42-bad{color:#ff858b!important}.m42-muted{color:#8ca899!important}
    .m42-risk-list{display:grid;gap:7px}
    .m42-risk{display:grid;grid-template-columns:1fr auto;gap:5px 10px;padding:10px;border:1px solid #ffffff10;border-radius:11px;background:#ffffff05}
    .m42-risk b{font-size:10px}.m42-risk small{font-size:8px;color:#8ca899}.m42-risk strong{font-size:10px;text-align:right}
    .m42-bar{grid-column:1/-1;height:4px;background:#ffffff12;border-radius:5px;overflow:hidden}.m42-bar i{display:block;height:100%;background:linear-gradient(90deg,#2b986a,#76e6ae);border-radius:5px}
    .m42-note{margin-top:12px;padding:10px;border-left:2px solid #c49b54;background:#8c67260f;color:#bcae8e;font-size:8px;line-height:1.55}
    .m42-loading{padding:16px;text-align:center;color:#8ca899;font-size:10px}
    @media(max-width:390px){.m42-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.m42-head{align-items:flex-start}.m42-title{font-size:14px}}
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.id = "m4-signals-output";
  panel.className = "m4-panel m42-signal-panel";
  panel.innerHTML = `
    <div class="m42-head">
      <div><div class="m42-kicker">MIRAGE 4.2 · SIGNAL INTELLIGENCE</div><div class="m42-title">Качество и результат сигналов</div><div class="m42-sub">Отдельно: движение цены после сигнала и фактические результаты Paper Trading</div></div>
      <button class="m42-refresh" type="button" id="m42-refresh">↻ Обновить</button>
    </div>
    <div id="m42-content"><div class="m42-loading">Загружаем аналитику сигналов…</div></div>
  `;
  anchor.insertAdjacentElement("afterend", panel);

  const $ = id => panel.querySelector(`#${id}`);
  const esc = value => String(value ?? "—").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const n = (value, digits=2) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(digits);
  const money = value => value == null ? "—" : `${Number(value)>=0?"+":""}$${n(value)}`;
  const statusLabel = value => ({take_profit:"TP достигнут",stop_loss:"SL достигнут",ambiguous_stop_first:"SL/TP в одной свече · учтён SL",open:"В работе",expired:"Горизонт завершён",no_recent_candles:"Нет свечей после сигнала",unavailable:"Нет данных"}[value] || value || "—");

  function render(data) {
    const t = data.tracking || {};
    const p = data.paper_performance || {};
    const resolved = Number(t.path_resolved || 0);
    const rows = (data.signals || []).map(s => {
      const path = s.path || {};
      const outcome = path.outcome;
      const outcomeClass = outcome === "take_profit" ? "m42-good" : ["stop_loss","ambiguous_stop_first"].includes(outcome) ? "m42-bad" : "m42-muted";
      return `<tr>
        <td><b>${esc(s.symbol)}</b><br><span class="m42-muted">${esc(s.timeframe)} · ${esc(s.direction)} · ${esc(s.grade)}</span></td>
        <td class="${outcomeClass}">${esc(statusLabel(outcome))}</td>
        <td class="m42-good">${n(path.mfe_pct)}%</td>
        <td class="m42-bad">${n(path.mae_pct)}%</td>
        <td>${n(s.reward_risk,1)}R</td>
        <td>${s.paper_trade ? `<span class="${Number(s.paper_trade.net_pnl)>=0?"m42-good":"m42-bad"}">${money(s.paper_trade.net_pnl)}</span>` : "—"}</td>
      </tr>`;
    }).join("");

    const risks = (data.risk_accounts || []).map(a => {
      const pct = Number(a.reserved_risk_pct || 0);
      const width = Math.max(0, Math.min(100, pct / Number(a.max_total_risk_pct || 4) * 100));
      return `<div class="m42-risk"><div><b>${esc(a.name)}</b><br><small>${a.open_positions} поз. · экспозиция ${n(a.exposure_pct)}%</small></div><strong>${n(pct)}% риска</strong><div class="m42-bar"><i style="width:${width}%"></i></div></div>`;
    }).join("");

    $("m42-content").innerHTML = `
      <div class="m42-grid">
        <div class="m42-stat"><small>Сигналов в выборке</small><b>${n(t.signals_sampled,0)}</b></div>
        <div class="m42-stat"><small>Разрешённых исходов пути</small><b>${n(resolved,0)}</b></div>
        <div class="m42-stat"><small>Path win rate</small><b>${t.path_win_rate_pct == null ? "—" : `${n(t.path_win_rate_pct)}%`}</b></div>
        <div class="m42-stat"><small>Paper-сделок в выборке</small><b>${n(p.closed_trades,0)}</b></div>
        <div class="m42-stat"><small>Paper win rate</small><b>${p.win_rate_pct == null ? "—" : `${n(p.win_rate_pct)}%`}</b></div>
        <div class="m42-stat"><small>Paper P&amp;L выборки</small><b class="${Number(p.net_pnl)>=0?"m42-good":"m42-bad"}">${money(p.net_pnl)}</b></div>
      </div>
      <div class="m42-section"><div class="m42-section-title">ПОСЛЕДНИЕ СИГНАЛЫ · MFE / MAE</div>
        ${rows ? `<div class="m42-table-wrap"><table class="m42-table"><thead><tr><th>Актив</th><th>Путь цены</th><th>MFE</th><th>MAE</th><th>R/R</th><th>Paper P&amp;L</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="m42-loading">Сигналов пока нет</div>`}
      </div>
      <div class="m42-section"><div class="m42-section-title">RISK INTELLIGENCE · ОТКРЫТЫЕ СЧЕТА</div>
        <div class="m42-risk-list">${risks || `<div class="m42-loading">Нет активных счетов</div>`}</div>
      </div>
      <div class="m42-note">${esc(data.disclaimer || "Результаты не гарантируют будущую доходность.")} Path win rate рассчитывается только по сигналам, у которых цена достигла SL или TP в пределах контрольного горизонта. Открытые и истёкшие сигналы не включаются в win rate.</div>
    `;
  }

  async function load() {
    const button = $("m42-refresh");
    button.disabled = true;
    button.textContent = "Загрузка…";
    try {
      const headers = {Accept:"application/json", "X-Telegram-Init-Data":window.Telegram?.WebApp?.initData || ""};
      const response = await fetch("/api/mirage/signal-intelligence", {headers, cache:"no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      render(await response.json());
    } catch (error) {
      $("m42-content").innerHTML = `<div class="m42-loading">Не удалось загрузить Signal Intelligence: ${esc(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = "↻ Обновить";
    }
  }

  $("m42-refresh").addEventListener("click", load);
  load();
})();
