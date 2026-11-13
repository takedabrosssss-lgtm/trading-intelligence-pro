/* MIRAGE Release UI: user preferences, Exchange Center, invitations, manual Paper close and Протокол Фантом.
   All exchange credentials are submitted directly to the authenticated server over HTTPS.
   This frontend has no order-placement implementation. */
(() => {
  "use strict";
  if (window.__MIRAGE_RELEASE_UI__) return;
  window.__MIRAGE_RELEASE_UI__ = true;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = { profile: null, connections: [], users: [], applyingServerMode: false, modeSaveTimer: 0 };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
  const authHeaders = () => {
    const headers = { Accept: "application/json" };
    const initData = window.Telegram?.WebApp?.initData || "";
    if (initData) headers["X-Telegram-Init-Data"] = initData;
    return headers;
  };
  async function request(url, options = {}) {
    const headers = { ...authHeaders(), ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { ...options, headers, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Сервер ответил ${response.status}`);
    return data;
  }
  function toast(message) {
    const node = $("#toast");
    if (node) {
      node.textContent = message;
      node.classList.add("show");
      window.setTimeout(() => node.classList.remove("show"), 3200);
    } else {
      console.info("MIRAGE:", message);
    }
  }
  function setStatus(node, message, kind = "") {
    if (!node) return;
    node.textContent = message;
    node.classList.remove("mirage-platform-error", "mirage-platform-success");
    if (kind) node.classList.add(`mirage-platform-${kind}`);
  }
  function addReleaseStyles() {
    let link = $("#mirage-release-css");
    if (!link) {
      link = document.createElement("link");
      link.id = "mirage-release-css";
      link.rel = "stylesheet";
      link.href = "mirage-release.css?v=20261113-r1";
    }
    document.head.appendChild(link);
  }
  function ensureProfileSections() {
    const profile = $("#profile");
    if (!profile || $("#mirage-platform-controls")) return;
    const identity = $(".profile-identity-card", profile);
    const section = document.createElement("div");
    section.id = "mirage-platform-controls";
    section.innerHTML = `
      <section class="mirage-platform-card" id="mirage-trading-mode-card">
        <h2>Торговая среда</h2>
        <p>Paper Trading и Live Trading не смешиваются. В этой сборке реальные ордера ещё заблокированы.</p>
        <div class="mirage-platform-grid">
          <div class="mirage-platform-note"><b>PAPER TRADING</b><br>Полноценная симуляция. Персональный стартовый капитал $10 000.</div>
          <div class="mirage-platform-note"><b>LIVE TRADING</b><br>Подключение и проверка биржи доступны. Исполнение реальных ордеров отключено.</div>
        </div>
        <div class="mirage-platform-status" id="mirage-live-lock-status">Реальные ордера заблокированы</div>
      </section>
      <section class="mirage-platform-card" id="mirage-exchange-center">
        <h2>Exchange Center</h2>
        <p>Подключи личный API-ключ. Рекомендуемые права: чтение аккаунта, без торговли и без вывода средств. Секрет шифруется на сервере.</p>
        <form id="mirage-exchange-form" autocomplete="off">
          <div class="mirage-platform-grid">
            <div class="mp-field"><label for="mp-exchange">Биржа</label><select id="mp-exchange" name="exchange"><option value="binance">Binance</option><option value="bybit">Bybit</option></select></div>
            <div class="mp-field"><label for="mp-environment">Среда API</label><select id="mp-environment" name="environment"><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select></div>
          </div>
          <div class="mp-field"><label for="mp-api-key">API Key</label><input id="mp-api-key" name="api_key" type="password" minlength="8" maxlength="256" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="Вставь API Key"></div>
          <div class="mp-field"><label for="mp-api-secret">API Secret</label><input id="mp-api-secret" name="api_secret" type="password" minlength="8" maxlength="256" autocomplete="new-password" autocapitalize="off" spellcheck="false" required placeholder="Вставь API Secret"></div>
          <div class="mp-field"><label for="mp-label">Название подключения (необязательно)</label><input id="mp-label" name="label" maxlength="100" autocomplete="off" placeholder="Например, мой Bybit"></div>
          <label class="mirage-withdrawal-confirm"><input id="mp-withdrawals-confirm" type="checkbox" required> Подтверждаю, что отключил Withdrawals в настройках API-ключа. Для Bybit это подтверждение пользователя — приложение не может проверить это разрешение read-only запросом.</label>
          <button class="mirage-platform-primary" id="mp-connect" type="submit">Проверить и подключить</button>
          <div class="mirage-platform-note">Важно: не включай Withdrawals. Binance сообщает о разрешении вывода в ответе API; для Bybit нужно вручную убедиться в настройках ключа, так как read-only проверка не подтверждает это разрешение.</div>
          <p id="mp-connect-status" role="status"></p>
        </form>
        <div id="mp-connections"><p>Загрузка подключений…</p></div>
      </section>
      <section class="mirage-platform-card" id="mirage-phantom-card">
        <h2>Протокол Фантом</h2>
        <p>Аварийная блокировка новых действий MIRAGE с подключёнными биржами. В этой сборке у MIRAGE нет активных live-ордеров, поэтому протокол блокирует соединения, но не закрывает позиции и не отзывает ключ на стороне биржи.</p>
        <button type="button" class="mirage-platform-danger" id="mp-phantom">Заблокировать подключения</button>
        <p id="mp-phantom-status" role="status"></p>
      </section>
      <section class="mirage-platform-card mirage-platform-hidden" id="mirage-user-management">
        <h2>Пользователи MIRAGE</h2>
        <p>Приглашения контролирует владелец. Максимум пользователей задаётся в настройках тестового сервиса.</p>
        <form id="mirage-invite-form"><div class="mp-field"><label for="mp-invite-id">Telegram ID приглашённого</label><input id="mp-invite-id" inputmode="numeric" pattern="[0-9]+" minlength="4" maxlength="32" required placeholder="Например, 123456789"></div><button class="mirage-platform-primary" id="mp-invite" type="submit">Пригласить пользователя</button><p id="mp-invite-status" role="status"></p></form>
        <div id="mp-user-list"></div>
      </section>`;
    if (identity) identity.insertAdjacentElement("afterend", section);
    else profile.appendChild(section);
  }
  async function loadProfile() {
    const data = await request("/api/platform/profile");
    state.profile = data;
    const subtitle = $("#profile-user-subtitle");
    if (subtitle) subtitle.textContent = data.username ? `@${data.username} · MIRAGE` : `MIRAGE · ${data.role === "owner" ? "Владелец" : "Участник"}`;
    const live = $("#mirage-live-lock-status");
    if (live) live.textContent = "Реальные ордера заблокированы в этом релизе";
    const users = $("#mirage-user-management");
    if (users) users.classList.toggle("mirage-platform-hidden", !data.is_owner);
    if (data.ui_mode && window.MIRAGE_MODES?.setImmediate) {
      state.applyingServerMode = true;
      window.MIRAGE_MODES.setImmediate(data.ui_mode);
      window.setTimeout(() => { state.applyingServerMode = false; }, 300);
    }
  }
  async function loadConnections() {
    const host = $("#mp-connections");
    if (!host) return;
    try {
      const data = await request("/api/platform/exchanges");
      state.connections = data.connections || [];
      host.innerHTML = state.connections.length ? state.connections.map(row => `
        <div class="mirage-platform-row">
          <div><b>${esc(row.exchange.toUpperCase())}${row.label ? ` · ${esc(row.label)}` : ""}</b><small>${esc(row.environment)} · ${esc(row.status)} · ${row.can_trade ? "Trade permission reported" : "Read-only / trade not confirmed"}</small><small>${row.withdrawal_check === "manual_required" ? "Права Withdrawals проверь вручную на Bybit" : "Binance reports withdrawals disabled"}${row.emergency_lock ? " · LOCKED" : ""}</small></div>
          <button type="button" class="mirage-platform-danger" data-exchange-disconnect="${Number(row.id)}">Отключить</button>
        </div>`).join("") : `<p>Подключений пока нет.</p>`;
    } catch (error) {
      host.innerHTML = `<p class="mirage-platform-error">${esc(error.message)}</p>`;
    }
  }
  async function loadUsers() {
    if (!state.profile?.is_owner) return;
    const host = $("#mp-user-list");
    if (!host) return;
    try {
      const data = await request("/api/platform/users");
      state.users = data.users || [];
      host.innerHTML = `<div class="mirage-platform-note">Пользователи: ${state.users.filter(x => x.is_active).length} / ${Number(data.max_users || 4)}</div>` + state.users.map(item => `
        <div class="mirage-platform-row"><div><b>${esc(item.first_name || item.username || item.telegram_id)}</b><small>Telegram ID: ${esc(item.telegram_id)} · ${esc(item.role)} · ${item.is_active ? "Активен" : "Отключён"}</small></div>${item.role !== "owner" && item.is_active ? `<button type="button" class="mirage-platform-danger" data-user-disable="${esc(item.telegram_id)}">Отключить</button>` : ""}</div>`).join("");
    } catch (error) {
      host.innerHTML = `<p class="mirage-platform-error">${esc(error.message)}</p>`;
    }
  }
  async function connectExchange(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("#mp-connect");
    const status = $("#mp-connect-status");
    const apiKey = $("#mp-api-key");
    const apiSecret = $("#mp-api-secret");
    button.disabled = true;
    setStatus(status, "Проверяем разрешения ключа…");
    try {
      const body = {
        exchange: $("#mp-exchange").value,
        environment: $("#mp-environment").value,
        api_key: apiKey.value,
        api_secret: apiSecret.value,
        confirm_withdrawals_disabled: $("#mp-withdrawals-confirm").checked,
        label: $("#mp-label").value.trim() || null
      };
      const data = await request("/api/platform/exchanges/connect", { method: "POST", body: JSON.stringify(body) });
      apiKey.value = "";
      apiSecret.value = "";
      $("#mp-withdrawals-confirm").checked = false;
      $("#mp-label").value = "";
      setStatus(status, data.message || "Подключение проверено и сохранено.", "success");
      toast("Биржевое подключение сохранено");
      await loadConnections();
    } catch (error) {
      apiKey.value = "";
      apiSecret.value = "";
      setStatus(status, error.message || "Не удалось подключить биржу.", "error");
    } finally {
      button.disabled = false;
    }
  }
  async function disconnectExchange(id) {
    const ok = window.confirm("Удалить сохранённые MIRAGE API-ключи? Это не отзывает ключ на самой бирже. После удаления при необходимости отзови его вручную в кабинете биржи.");
    if (!ok) return;
    try {
      await request(`/api/platform/exchanges/${id}`, { method: "DELETE" });
      toast("Локальные ключи удалены. Проверь отзыв на бирже.");
      await loadConnections();
    } catch (error) { toast(error.message); }
  }
  async function doPhantom() {
    const ok = window.confirm("ПРОТОКОЛ ФАНТОМ\n\nMIRAGE заблокирует свои подключения к биржам и переключит интерфейс в Paper Trading. В этой версии нет механизма live-исполнения: позиции бирж, включая открытые вручную, автоматически закрываться не будут. API-ключи на бирже не отзываются. Продолжить?");
    if (!ok) return;
    const button = $("#mp-phantom");
    const status = $("#mp-phantom-status");
    button.disabled = true;
    setStatus(status, "Блокируем подключения…");
    try {
      const data = await request("/api/platform/phantom/lock", { method: "POST" });
      setStatus(status, `${data.message} Заблокировано подключений: ${data.connections_locked}.`, "success");
      toast("Протокол Фантом активирован");
      await loadProfile();
      await loadConnections();
    } catch (error) { setStatus(status, error.message, "error"); }
    finally { button.disabled = false; }
  }
  async function inviteUser(event) {
    event.preventDefault();
    const button = $("#mp-invite");
    const status = $("#mp-invite-status");
    button.disabled = true;
    try {
      const telegramId = $("#mp-invite-id").value.trim();
      const data = await request("/api/platform/users", { method: "POST", body: JSON.stringify({ telegram_id: telegramId }) });
      $("#mp-invite-id").value = "";
      setStatus(status, `Пользователь приглашён. Его Paper Trading стартует с $${Number(data.paper_initial_capital).toLocaleString("en-US")}. Передай ему ссылку на Telegram-бота.`, "success");
      await loadUsers();
    } catch (error) { setStatus(status, error.message, "error"); }
    finally { button.disabled = false; }
  }
  async function disableUser(id) {
    if (!window.confirm(`Отключить пользователя ${id}? Его данные сохраняются, но доступ будет заблокирован.`)) return;
    try { await request(`/api/platform/users/${encodeURIComponent(id)}`, { method: "DELETE" }); await loadUsers(); }
    catch (error) { toast(error.message); }
  }
  async function closePaperPosition(id) {
    if (!window.confirm("Закрыть эту Paper Trading позицию по текущей доступной рыночной цене? Результат попадёт в P&L и историю, но не будет учитываться в Win Rate.")) return;
    try {
      const data = await request(`/api/platform/paper/positions/${id}/close`, { method: "POST" });
      toast(`Позиция закрыта. P&L: ${Number(data.realized_pnl).toFixed(2)} USD`);
      if (window.MIRAGE?.refresh) await window.MIRAGE.refresh();
      else window.location.reload();
    } catch (error) { toast(error.message); }
  }
  async function persistMode(mode) {
    if (state.applyingServerMode || !["stealth", "spectre"].includes(mode)) return;
    try { await request("/api/platform/preferences", { method: "PUT", body: JSON.stringify({ ui_mode: mode }) }); }
    catch (error) { console.warn("MIRAGE mode preference was not synchronized:", error.message); }
  }
  function installHandlers() {
    $("#mirage-exchange-form")?.addEventListener("submit", connectExchange);
    $("#mirage-invite-form")?.addEventListener("submit", inviteUser);
    $("#mp-phantom")?.addEventListener("click", doPhantom);
    document.addEventListener("click", event => {
      const disconnect = event.target.closest("[data-exchange-disconnect]");
      if (disconnect) disconnectExchange(Number(disconnect.dataset.exchangeDisconnect));
      const disable = event.target.closest("[data-user-disable]");
      if (disable) disableUser(disable.dataset.userDisable);
      const close = event.target.closest("[data-paper-close-id]");
      if (close) closePaperPosition(Number(close.dataset.paperCloseId));
    });
    const modeObserver = new MutationObserver(() => {
      const mode = document.body.dataset.mirageMode || "stealth";
      const themeMeta = $('meta[name="theme-color"]');
      if (themeMeta) themeMeta.content = mode === "spectre" ? "#07090c" : "#f4f7f8";
      if (!state.applyingServerMode) {
        window.clearTimeout(state.modeSaveTimer);
        state.modeSaveTimer = window.setTimeout(() => persistMode(mode), 250);
      }
    });
    modeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-mirage-mode"] });
  }
  async function start() {
    addReleaseStyles();
    ensureProfileSections();
    installHandlers();
    try {
      await loadProfile();
      await Promise.all([loadConnections(), loadUsers()]);
    } catch (error) {
      const host = $("#mirage-platform-controls");
      if (host) host.insertAdjacentHTML("afterbegin", `<div class="mirage-platform-card mirage-platform-error">${esc(error.message)}. Открой Mini App внутри авторизованного Telegram-бота.</div>`);
      console.error("MIRAGE platform bootstrap failed:", error);
    }
    window.addEventListener("mirage:pagechange", event => {
      if (event.detail?.page === "profile") {
        loadProfile().catch(() => {});
        loadConnections();
        loadUsers();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && $("#profile")?.classList.contains("active")) {
        loadConnections();
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
