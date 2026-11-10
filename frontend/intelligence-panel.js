
/* MIRAGE 2.5 — Research Studio
   Premium UI, animated progress states, deep historical research.
   Read-only: does not execute orders or modify Paper Trading.
*/
(() => {
  "use strict";

  if (window.__MIRAGE_INTELLIGENCE_PANEL__) return;
  window.__MIRAGE_INTELLIGENCE_PANEL__ = true;

  const style = document.createElement("style");

  style.textContent = `
  .mi-panel {
    --mi-green:#62e5a5;
    --mi-muted:#91a99b;
    position:relative;
    isolation:isolate;
    overflow:hidden;
    margin:20px 0;
    padding:18px;
    border:1px solid rgba(91,221,160,.22);
    border-radius:22px;
    background:
      radial-gradient(ellipse at 0 0,rgba(30,116,77,.20),transparent 48%),
      linear-gradient(145deg,#0b1712,#080e0c 65%,#070b09);
    color:#e8f4ed;
    box-shadow:0 18px 48px rgba(0,0,0,.28);
    animation:miEnter .5s ease both;
  }

  .mi-panel:before {
    content:"";
    position:absolute;
    z-index:-1;
    width:220px;
    height:220px;
    right:-90px;
    top:-120px;
    border-radius:50%;
    background:rgba(49,190,124,.12);
    filter:blur(38px);
    pointer-events:none;
  }

  @keyframes miEnter {
    from {opacity:0;transform:translateY(12px)}
    to {opacity:1;transform:translateY(0)}
  }

  .mi-head {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
  }

  .mi-brand {
    display:flex;
    align-items:center;
    gap:11px;
  }

  .mi-emblem {
    width:40px;
    height:40px;
    display:grid;
    place-items:center;
    border:1px solid rgba(92,226,161,.35);
    border-radius:13px;
    color:#76edb2;
    background:linear-gradient(145deg,#19432e,#0b1911);
    box-shadow:0 0 22px rgba(55,199,129,.12);
    font-size:20px;
  }

  .mi-kicker {
    font-size:9px;
    letter-spacing:2px;
    color:#73dba7;
    font-weight:800;
  }

  .mi-panel h3 {
    margin:3px 0 0;
    font:800 17px Manrope,sans-serif;
    letter-spacing:-.4px;
  }

  .mi-sub {
    color:var(--mi-muted);
    font-size:10px;
    margin-top:4px;
  }

  .mi-paper {
    padding:7px 9px;
    border:1px solid rgba(87,208,149,.2);
    border-radius:30px;
    background:rgba(30,112,73,.13);
    font-size:8px;
    letter-spacing:1px;
    color:#75dfa9;
    white-space:nowrap;
  }

  .mi-grid {
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:8px;
    margin:17px 0;
  }

  .mi-stat {
    min-width:0;
    padding:12px;
    border:1px solid rgba(154,202,174,.09);
    border-radius:14px;
    background:linear-gradient(145deg,#162b20,#0c1812);
    transition:transform .22s,border-color .22s;
  }

  .mi-stat:hover {
    transform:translateY(-2px);
    border-color:rgba(91,221,160,.3);
  }

  .mi-stat small {
    display:block;
    color:#8fa99a;
    font-size:9px;
  }

  .mi-stat b {
    display:block;
    margin-top:7px;
    color:#edf8f1;
    font:800 17px Manrope,sans-serif;
    overflow-wrap:anywhere;
  }

  .mi-green {color:#69e5a8!important}
  .mi-red {color:#ff858b!important}

  .mi-divider {
    height:1px;
    background:linear-gradient(
      90deg,transparent,
      rgba(104,192,145,.22),transparent
    );
    margin:14px 0;
  }

  .mi-controls {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:8px;
  }

  .mi-controls select {
    min-width:0;
    width:100%;
    background:#102019;
    color:#e6f4eb;
    border:1px solid #294d39;
    border-radius:11px;
    padding:11px;
    font:600 11px "DM Sans",sans-serif;
    outline:none;
  }

  .mi-actions {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:8px;
    margin-top:9px;
  }

  .mi-actions button {
    position:relative;
    overflow:hidden;
    min-height:42px;
    padding:10px 8px;
    border:1px solid rgba(105,220,160,.2);
    border-radius:11px;
    background:linear-gradient(145deg,#173c2b,#10271c);
    color:#dff8e9;
    font:700 10px "DM Sans",sans-serif;
    transition:transform .2s,filter .2s;
  }

  .mi-actions button:active {
    transform:scale(.98);
  }

  .mi-actions button:hover {
    filter:brightness(1.18);
  }

  .mi-actions button:disabled {
    opacity:.48;
    filter:saturate(.5);
  }

  .mi-actions .mi-primary {
    grid-column:1/-1;
    background:linear-gradient(105deg,#1b6947,#17452f,#123522);
    box-shadow:0 7px 22px rgba(22,119,74,.16);
    font-size:11px;
  }

  .mi-status {
    display:none;
    margin-top:14px;
    padding:14px;
    border:1px solid rgba(93,216,155,.2);
    border-radius:14px;
    background:rgba(13,39,26,.65);
  }

  .mi-status.active {
    display:block;
    animation:miEnter .25s ease both;
  }

  .mi-status-top {
    display:flex;
    align-items:center;
    gap:10px;
  }

  .mi-spinner {
    width:18px;
    height:18px;
    border:2px solid rgba(108,226,164,.2);
    border-top-color:#6de7aa;
    border-radius:50%;
    animation:miSpin .8s linear infinite;
    flex:none;
  }

  @keyframes miSpin {
    to {transform:rotate(360deg)}
  }

  .mi-status-title {
    font-size:11px;
    font-weight:800;
    color:#dff9e9;
  }

  .mi-status-line {
    margin:8px 0 0 28px;
    color:#91b6a0;
    font-size:9px;
    line-height:1.5;
  }

  .mi-pulse {
    display:inline-block;
    width:6px;
    height:6px;
    margin-right:6px;
    border-radius:50%;
    background:#63e2a1;
    box-shadow:0 0 10px #63e2a1;
    animation:miPulse 1.2s infinite;
  }

  @keyframes miPulse {
    50% {opacity:.35;transform:scale(.75)}
  }

  .mi-progress {
    height:3px;
    margin-top:12px;
    overflow:hidden;
    border-radius:5px;
    background:#193326;
  }

  .mi-progress:after {
    content:"";
    display:block;
    width:35%;
    height:100%;
    border-radius:5px;
    background:linear-gradient(90deg,#258a59,#76efb2);
    animation:miProgress 2s ease-in-out infinite;
  }

  @keyframes miProgress {
    0% {transform:translateX(-110%)}
    100% {transform:translateX(310%)}
  }

  .mi-result {
    margin-top:13px;
    color:#b9cbbf;
    font-size:10px;
    line-height:1.65;
    white-space:pre-wrap;
    overflow-wrap:anywhere;
  }

  .mi-results {
    margin-top:13px;
    animation:miEnter .35s ease both;
  }

  .mi-result-head {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    margin-bottom:9px;
  }

  .mi-result-head b {
    font:800 12px Manrope,sans-serif;
    color:#e9f8ef;
  }

  .mi-result-head span {
    color:#85a391;
    font-size:9px;
  }

  .mi-table-wrap {
    overflow-x:auto;
    border:1px solid rgba(133,194,157,.13);
    border-radius:13px;
    background:rgba(6,14,10,.42);
  }

  .mi-table {
    width:100%;
    min-width:490px;
    border-collapse:collapse;
    font-size:9px;
  }

  .mi-table th,.mi-table td {
    padding:10px 8px;
    border-bottom:1px solid rgba(130,180,145,.10);
    text-align:right;
    white-space:nowrap;
  }

  .mi-table th {
    color:#82a18f;
    background:rgba(23,52,35,.55);
    font-weight:700;
  }

  .mi-table td {color:#d5e6da}
  .mi-table th:first-child,
  .mi-table td:first-child {text-align:left}
  .mi-table tr:last-child td {border-bottom:0}

  .mi-rank {
    color:#71e6aa;
    font-weight:900;
  }

  .mi-positive {color:#65e4a5!important}
  .mi-negative {color:#ff858b!important}

  .mi-folds {
    margin-top:10px;
    padding:12px;
    border:1px solid rgba(133,194,157,.11);
    border-radius:13px;
    background:rgba(12,27,18,.55);
  }

  .mi-folds b {
    color:#e3f5e9;
    font-size:10px;
  }

  .mi-folds div {
    color:#9bb6a4;
    font-size:9px;
    line-height:1.6;
    margin-top:5px;
  }

  .mi-warning {
    margin-top:11px;
    padding:10px 11px;
    border-left:2px solid #c49b54;
    background:rgba(140,103,38,.09);
    color:#bcae8e;
    font-size:9px;
    line-height:1.55;
  }

  .mi-foot {
    margin-top:13px;
    color:#668273;
    font-size:8px;
    line-height:1.5;
  }

  @media(max-width:480px) {
    .mi-panel {padding:14px;border-radius:18px}
    .mi-grid {grid-template-columns:repeat(2,minmax(0,1fr))}
    .mi-stat {padding:10px}
    .mi-stat b {font-size:16px}
    .mi-actions {gap:7px}
    .mi-actions button {font-size:9px;padding:9px 6px}
  }

  @media(prefers-reduced-motion:reduce) {
    .mi-panel,.mi-results,.mi-status.active {animation:none}
    .mi-spinner,.mi-pulse,.mi-progress:after {animation:none}
    .mi-stat,.mi-actions button {transition:none}
  }
  `;

  document.head.appendChild(style);

  const host = document.getElementById("strategy-list");

  if (!host) return;

  const panel = document.createElement("section");
  panel.className = "mi-panel";

  panel.innerHTML = `
    <div class="mi-head">
      <div class="mi-brand">
        <div class="mi-emblem">◈</div>
        <div>
          <div class="mi-kicker">MIRAGE INTELLIGENCE · 2.5</div>
          <h3>Research Studio</h3>
          <div class="mi-sub">
            Глубокое исследование рыночных стратегий
          </div>
        </div>
      </div>
      <span class="mi-paper">● PAPER ONLY</span>
    </div>

    <div class="mi-grid">
      <div class="mi-stat">
        <small>Закрытых сделок</small>
        <b id="mi-trades">—</b>
      </div>
      <div class="mi-stat">
        <small>Win rate</small>
        <b id="mi-win">—</b>
      </div>
      <div class="mi-stat">
        <small>Profit factor</small>
        <b id="mi-pf">—</b>
      </div>
      <div class="mi-stat">
        <small>Открытых позиций</small>
        <b id="mi-open">—</b>
      </div>
      <div class="mi-stat">
        <small>Net P&amp;L выборки</small>
        <b id="mi-pnl">—</b>
      </div>
      <div class="mi-stat">
        <small>Режим системы</small>
        <b class="mi-green" style="font-size:12px">
          Сбор опыта
        </b>
      </div>
    </div>

    <div class="mi-divider"></div>

    <div class="mi-controls">
      <select id="mi-symbol" aria-label="Актив">
        <option>BTCUSDT</option>
        <option>ETHUSDT</option>
        <option>BNBUSDT</option>
        <option>SOLUSDT</option>
        <option>XRPUSDT</option>
      </select>

      <select id="mi-interval" aria-label="Таймфрейм">
        <option value="1d">1D · дневной</option>
        <option value="4h">4H · четырёхчасовой</option>
        <option value="1h">1H · часовой</option>
      </select>
    </div>

    <div class="mi-actions">
      <button id="mi-analyze">◈ Анализ рынка</button>
      <button id="mi-backtest">▥ Backtest</button>
      <button id="mi-compare">⇄ Сравнить стратегии</button>
      <button id="mi-research">⌁ Walk-forward</button>

      <button id="mi-universe" class="mi-primary">
        ✦ Проверить 5 активов · стандарт
      </button>

      <button id="mi-deep" class="mi-primary">
        ◉ Глубокое исследование · 1 200 свечей
      </button>
    </div>

    <div id="mi-status" class="mi-status">
      <div class="mi-status-top">
        <span class="mi-spinner"></span>
        <span class="mi-status-title" id="mi-status-title">
          Подготавливаем исследование
        </span>
      </div>

      <div class="mi-status-line" id="mi-status-line">
        <span class="mi-pulse"></span>
        Ожидаем ответ сервера…
      </div>

      <div class="mi-progress"></div>
    </div>

    <div id="mi-result" class="mi-result">
      Загружаем статистику MIRAGE…
    </div>

    <div id="mi-output" class="mi-results"></div>

    <div class="mi-foot">
      Исследовательский режим. Исторические результаты
      не гарантируют будущую доходность.
      Торговые ордера не размещаются.
    </div>
  `;

  host.insertAdjacentElement("afterend", panel);

  const $ = id => panel.querySelector("#" + id);

  const BUTTONS = [
    "mi-analyze",
    "mi-backtest",
    "mi-compare",
    "mi-research",
    "mi-universe",
    "mi-deep"
  ];

  const headers = () => ({
    Accept: "application/json",
    "X-Telegram-Init-Data":
      window.Telegram?.WebApp?.initData || ""
  });

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  const fmt = value =>
    value == null
      ? "—"
      : typeof value === "number"
        ? value.toFixed(2)
        : String(value);

  const pct = value =>
    value == null ? "—" : `${fmt(value)}%`;

  async function get(path) {
    const response = await fetch(path, {
      headers: headers(),
      cache: "no-store"
    });

    if (!response.ok) {
      let message = "";

      try {
        const data = await response.json();
        message = data.detail || "";
      } catch (_) {}

      throw new Error(message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  let phaseTimer = null;

  function busy(title, lines, activeButtons) {
    clearInterval(phaseTimer);

    $("mi-status").classList.add("active");
    $("mi-status-title").textContent = title;

    let index = 0;

    const update = () => {
      $("mi-status-line").innerHTML =
        `<span class="mi-pulse"></span>${esc(lines[index])}`;
    };

    update();

    phaseTimer = setInterval(() => {
      index = (index + 1) % lines.length;
      update();
    }, 2600);

    BUTTONS.forEach(id => {
      $(id).disabled = true;
    });

    $("mi-output").innerHTML = "";
  }

  function done() {
    clearInterval(phaseTimer);

    $("mi-status").classList.remove("active");

    BUTTONS.forEach(id => {
      $(id).disabled = false;
    });
  }

  function table(headers, rows) {
    return `
      <div class="mi-table-wrap">
        <table class="mi-table">
          <thead>
            <tr>
              ${headers.map(x => `<th>${esc(x)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function loadOverview() {
    get("/api/intelligence/overview")
      .then(data => {
        $("mi-trades").textContent =
          fmt(data.closed_trades_sample);

        $("mi-win").textContent =
          pct(data.win_rate_pct);

        $("mi-pf").textContent =
          fmt(data.profit_factor);

        $("mi-open").textContent =
          fmt(data.open_positions);

        $("mi-pnl").textContent =
          data.net_pnl_sample == null
            ? "—"
            : `$${fmt(data.net_pnl_sample)}`;

        $("mi-result").textContent =
          data.learning_note || "Статистика обновлена.";
      })
      .catch(error => {
        $("mi-result").textContent =
          `Не удалось загрузить статистику: ${error.message}.`;
      });
  }

  async function run(title, lines, path, render) {
    busy(title, lines, BUTTONS);

    $("mi-result").textContent = "";

    try {
      const data = await get(path);
      render(data);
    } catch (error) {
      $("mi-result").textContent =
        `Исследование не завершено: ${error.message}`;
    } finally {
      done();
    }
  }

  function renderUniverse(data, deep) {
    if (data.status !== "ok") {
      $("mi-result").textContent =
        `Недостаточно данных: обработано ${
          data.assets_available ?? 0
        } из ${data.assets_required ?? 5} активов.`;

      return;
    }

    $("mi-result").textContent =
      `${deep ? "DEEP HISTORICAL CROSS-ASSET" : "CROSS-ASSET WALK-FORWARD"} · ${data.interval}\n` +
      `Активы: ${(data.successful_symbols || []).join(", ")}\n` +
      `История: ${data.requested_candles_per_asset || 500} запрошенных свечей на актив.\n` +
      `${data.method || "Независимые проверки каждого актива."}\n` +
      `${data.warning || ""}`;

    const rows = (data.families || []).map(item => `
      <tr>
        <td>
          <span class="mi-rank">#${item.rank}</span>
          ${esc(item.name)}
        </td>
        <td>${item.positive_assets}/${item.assets_tested}</td>
        <td class="${(item.median_oos_return_pct ?? 0) >= 0 ? "mi-positive" : "mi-negative"}">
          ${pct(item.median_oos_return_pct)}
        </td>
        <td>${pct(item.median_max_fold_drawdown_pct)}</td>
        <td>${pct(item.worst_max_fold_drawdown_pct)}</td>
        <td>${item.total_validation_trades}</td>
      </tr>
    `).join("");

    const details = (data.families || []).map(item => `
      <div>
        <b>${esc(item.name)}</b>
        <div>
          ${(item.per_asset || []).map(asset =>
            `${esc(asset.symbol)}: ${pct(asset.oos_return_pct)} · ${asset.trades} сделок`
          ).join("　/　")}
        </div>
      </div>
    `).join("");

    $("mi-output").innerHTML = `
      <div class="mi-result-head">
        <b>Рейтинг исследованных стратегий</b>
        <span>${(data.families || []).length} моделей</span>
      </div>

      ${table(
        ["Стратегия", "Плюсовые", "Медиана OOS", "Медиана DD", "Худший DD", "Сделки"],
        rows
      )}

      <div class="mi-folds">${details}</div>

      <div class="mi-warning">
        ${esc(data.warning || "Результаты исследования не подтверждают будущую прибыльность.")}
      </div>
    `;
  }

  function selected() {
    return {
      symbol: $("mi-symbol").value,
      interval: $("mi-interval").value
    };
  }

  $("mi-analyze").addEventListener("click", () => {
    const {symbol, interval} = selected();

    run(
      "Анализируем структуру рынка",
      [
        "Загружаем последние свечи…",
        "Рассчитываем тренд, импульс и объём…",
        "Формируем аналитическое резюме…"
      ],
      `/api/intelligence/market/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`,
      data => {
        $("mi-result").textContent =
          `${data.symbol} · ${data.interval}\n` +
          `Режим: ${data.regime}\n` +
          `Направление: ${data.direction}\n` +
          `Оценка: ${data.score}/100\n` +
          `Цена: ${fmt(data.price)}\n` +
          `Объём / средний: ${fmt(data.volume_ratio)}x\n` +
          `${(data.signals || []).join("\n")}\n` +
          `${data.note || ""}`;
      }
    );
  });

  $("mi-backtest").addEventListener("click", () => {
    const {symbol, interval} = selected();

    run(
      "Выполняем исторический backtest",
      [
        "Подготавливаем OHLCV…",
        "Симулируем исполнение по следующему open…",
        "Учитываем комиссии и проскальзывание…",
        "Рассчитываем доходность и просадку…"
      ],
      `/api/intelligence/backtest/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`,
      data => {
        if (data.status !== "ok") {
          $("mi-result").textContent =
            `Недостаточно данных: ${data.candles || 0} свечей.`;
          return;
        }

        const a = data.in_sample;
        const b = data.out_of_sample;

        $("mi-result").textContent =
          `${symbol} · ${interval}\n` +
          `In-sample: ${fmt(a.return_pct)}% · DD ${fmt(a.max_drawdown_pct)}% · сделок ${a.trades}\n` +
          `Out-of-sample: ${fmt(b.return_pct)}% · DD ${fmt(b.max_drawdown_pct)}% · сделок ${b.trades}\n` +
          `${data.warning || ""}`;
      }
    );
  });

  $("mi-compare").addEventListener("click", () => {
    const {symbol, interval} = selected();

    run(
      "Сравниваем четыре стратегии",
      [
        "Применяем одинаковые условия тестирования…",
        "Проверяем EMA Trend и EMA Pullback…",
        "Проверяем Donchian и RSI…",
        "Ранжируем только по out-of-sample…"
      ],
      `/api/intelligence/compare/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`,
      data => {
        if (data.status !== "ok") {
          $("mi-result").textContent =
            `Недостаточно истории: ${data.candles || 0} свечей.`;
          return;
        }

        const rows = data.strategies.map(item => `
          <tr>
            <td>
              <span class="mi-rank">#${item.out_of_sample_rank}</span>
              ${esc(item.name)}
            </td>
            <td>${pct(item.out_of_sample.return_pct)}</td>
            <td>${pct(item.out_of_sample.max_drawdown_pct)}</td>
            <td>${item.out_of_sample.trades}</td>
            <td>${pct(item.out_of_sample.win_rate_pct)}</td>
            <td>${fmt(item.out_of_sample.profit_factor)}</td>
          </tr>
        `).join("");

        $("mi-result").textContent =
          `${symbol} · ${interval} · ${data.candles} свечей\n` +
          `${data.warning || ""}`;

        $("mi-output").innerHTML = table(
          ["Стратегия", "OOS", "DD", "Сделки", "Win rate", "PF"],
          rows
        );
      }
    );
  });

  $("mi-research").addEventListener("click", () => {
    const {symbol, interval} = selected();

    run(
      "Walk-forward исследование",
      [
        "Разделяем историю хронологически…",
        "Подбираем параметры только на прошлом…",
        "Проверяем три последовательных участка…",
        "Считаем устойчивость параметров…"
      ],
      `/api/intelligence/research/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`,
      data => {
        if (data.status !== "ok") {
          $("mi-result").textContent =
            `Недостаточно истории: ${data.candles || 0} свечей.`;
          return;
        }

        const rows = data.families.map(item => `
          <tr>
            <td><span class="mi-rank">#${item.rank}</span> ${esc(item.name)}</td>
            <td>${pct(item.out_of_sample_return_pct)}</td>
            <td>${pct(item.max_fold_drawdown_pct)}</td>
            <td>${item.validation_trades}</td>
            <td>${item.positive_folds}/3</td>
            <td>${fmt(item.profit_factor)}</td>
            <td>${item.research_status === "promising_but_unconfirmed" ? "Есть потенциал" : "Не подтверждена"}</td>
          </tr>
        `).join("");

        const folds = data.families.map(item => `
          <div>
            <b>${esc(item.name)}</b>
            <div>
              ${(item.folds || []).map(fold =>
                `F${fold.fold}: ${pct(fold.validation_return_pct)}`
              ).join(" · ")}
              · параметры ${item.parameter_stability === "stable" ? "стабильны" : "менялись"}
            </div>
          </div>
        `).join("");

        $("mi-result").textContent =
          `${symbol} · ${interval} · ${data.candles} свечей\n` +
          `Режим рынка: ${(data.regime || {}).label || "—"}\n` +
          `${data.warning || ""}`;

        $("mi-output").innerHTML =
          table(
            ["Стратегия", "OOS", "DD", "Сделки", "Плюсовые этапы", "PF", "Статус"],
            rows
          ) +
          `<div class="mi-folds">${folds}</div>`;
      }
    );
  });

  $("mi-universe").addEventListener("click", () => {
    const {interval} = selected();

    run(
      "Проверяем пять рынков",
      [
        "Загружаем BTC…",
        "Загружаем ETH и BNB…",
        "Загружаем SOL и XRP…",
        "Выполняем независимые walk-forward тесты…",
        "Собираем медианы и просадки…"
      ],
      `/api/intelligence/research-universe?interval=${encodeURIComponent(interval)}`,
      data => renderUniverse(data, false)
    );
  });

  $("mi-deep").addEventListener("click", () => {
    const {interval} = selected();

    run(
      "Запущено глубокое исследование",
      [
        "Подключаемся к Binance Spot…",
        "Загружаем исторические страницы…",
        "Проверяем BTC и ETH…",
        "Проверяем BNB, SOL и XRP…",
        "Собираем расширенные walk-forward результаты…"
      ],
      `/api/intelligence/research-universe-history?interval=${encodeURIComponent(interval)}&limit=1200`,
      data => renderUniverse(data, true)
    );
  });

  loadOverview();
})();
