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
