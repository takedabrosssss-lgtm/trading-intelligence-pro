# Trading Intelligence PRO

Telegram bot + Telegram Mini App for market monitoring, rule-based signals and paper-trade tracking.

## Important limitations

This repository is a runnable starter implementation, not a validated profitable trading system. The included strategy is a transparent EMA trend + breakout baseline. Its score is a heuristic, not a probability. The displayed historical winrate is a simple walk-forward backtest estimate and must not be represented as the probability that the next trade wins. It does not yet model exchange fees, spread, slippage, partial fills, funding, broker contract specifications, or all intrabar paths. Validate on out-of-sample data and paper trade before relying on results.

Crypto candles are sourced from Binance public market data. EURUSD, XAUUSD and NAS100 use Twelve Data where the account plan supports the requested symbols/intervals; provider symbol availability and data entitlements must be verified. NAS100/NDX may not match a broker's CFD quote. Do not mix price feeds between backtest and live tracking.

Redis URL is accepted as configuration for future cache/queue expansion; this initial version persists signals in PostgreSQL and does not yet depend on Redis. Never place API secrets in frontend code.

## Local run

1. Python 3.12+
2. `python -m venv .venv && source .venv/bin/activate` (Windows: `.venv\\Scripts\\activate`)
3. `pip install -r requirements.txt`
4. `cp .env.example .env` and fill in BOT_TOKEN, database and provider keys.
5. `uvicorn app.main:app --reload --port 8000`
6. In another terminal: `python -m app.worker`

For local polling rather than webhook, run a small custom entry point calling `app.bot.run_polling()`; do not run polling and webhook simultaneously. Production deployment uses webhook.

## Render deployment

1. Push this repository to a private/public GitHub repo.
2. Create a Render Blueprint from `render.yaml`, or manually create one Web Service and one Background Worker from the same repo/Dockerfile.
3. Attach a managed PostgreSQL database. Set `DATABASE_URL` to its **internal** connection string.
4. Set `BOT_TOKEN`, `MINI_APP_URL`, `WEBHOOK_URL`, `WEBHOOK_SECRET`, `TWELVE_DATA_API_KEY`, `SIGNAL_MIN_WINRATE=60`, `PAPER_TRADING=true`, `MIN_BACKTEST_TRADES=30`, `SCAN_INTERVAL_SECONDS=300`.
5. Set `TELEGRAM_ADMIN_IDS` to your numeric Telegram user ID. Optionally set `TELEGRAM_CHANNEL_ID` if you later want channel publishing.
6. Deploy the web service. Set `MINI_APP_URL` and `WEBHOOK_URL` to its final HTTPS URL, then redeploy.
7. Set the Mini App URL in BotFather (`/newapp` or bot settings → Menu Button) to the Web Service URL.
8. Set the Telegram webhook to `https://YOUR-SERVICE.onrender.com/telegram/webhook` through `WEBHOOK_URL`. The app configures it at startup.
9. Deploy the worker. Check Render logs for provider errors and successful scan cycles.
10. Configure UptimeRobot to monitor `https://YOUR-SERVICE.onrender.com/health`. Monitoring does not prevent every restart/sleep and does not replace an always-on paid service.

### Upstash Redis

Create a Redis database in Upstash and copy its TLS connection string to `REDIS_URL` (`rediss://...`). This starter currently does not use Redis for durable signal records; PostgreSQL is the source of truth. Redis integration for cache/locks can be added without changing the signal schema.

## BotFather

- Create bot with `/newbot`, save token in Render environment only.
- Configure commands: `start`, `help`, `analyze`, `summary`, `signals`, `history`, `status`.
- Set Mini App URL using `/newapp` or bot menu button settings.
- Never commit `.env` or expose BOT_TOKEN.

## Data provider configuration

- Binance public klines are used for BTCUSDT, ETHUSDT, SOLUSDT.
- Obtain a Twelve Data API key and verify EUR/USD, XAU/USD, and NDX support for your plan. If the provider cannot provide NAS100 CFD data, replace `MarketData.candles()` with your chosen broker's official API adapter.
- Use identical provider feeds for historical tests and paper-trade monitoring.

## API

- `GET /health`
- `GET /api/assets`
- `GET /api/signals`
- `GET /api/stats`

## Tests and production hardening

Before live use, add automated unit/integration tests, migrations (Alembic), rate limiting, Telegram user subscriptions/consent, admin authorization for sensitive commands, robust news provider, alert retries/outbox, Redis caching, candle freshness checks, provider failover, and broker-specific spread/commission models. The initial `/admin` command is intentionally omitted rather than exposing unsafe unimplemented controls.

Paper mode only. No exchange order placement exists.


## MIRAGE multi-user / exchange-connection release (staging)

This package adds Telegram-ID user provisioning, owner invitations, account-scoped Paper Trading views, exchange credential verification/storage, manual Paper close, persistent STEALTH/SPECTRE preferences, and the safe-lock action called **Протокол Фантом**.

**Live order placement is intentionally not implemented or enabled in this release.** Binance/Bybit keys are verified with read-only account endpoints and stored encrypted. No order, cancellation, or withdrawal API is called. Bybit withdrawal permissions cannot be reliably inferred by the read-only verification in this release; the UI therefore requires a manual check in the Bybit API-key settings.

Set `OWNER_TELEGRAM_ID`, `MAX_USERS=4`, and a separate `EXCHANGE_ENCRYPTION_KEY` on the staging service. The legacy Paper accounts are assigned to `OWNER_TELEGRAM_ID` by the idempotent migration; do not run this release against production before testing with a database backup. New invitees receive four independent Paper accounts ($2,500 each).

Generate an encryption key locally with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Keep that key stable and private. Losing it makes stored exchange credentials undecryptable. Do not commit it to Git.


## MIRAGE 4.3 staging package

This repository snapshot is a **staging-only** release candidate. The `render.yaml` file is intentionally configured with separate `mirage-staging-web` and `mirage-staging-db` resources. Do not point it at the production database or production Telegram bot.

The release adds per-Telegram-user Paper Trading accounts, invited-user access, Exchange Center credential verification and encrypted local storage, Paper manual close, and the **Протокол Фантом** lock. It also establishes the light STEALTH / dark SPECTRE visual layer and removes the conflicting legacy navigation scripts from the active HTML entry point. The existing news aggregator and Strategy Lab remain in place.

**Live order execution is not in this release.** The UI and backend reject a request to switch to Live, no order-placement/cancellation methods are implemented, and no exchange orders are sent. Use the Exchange Center for read-only verification only. Bybit withdrawal permissions require manual confirmation in the exchange key settings.

Follow `INSTALL_RU.md` before deploying this snapshot. The existing database migration assigns all legacy Paper accounts to `OWNER_TELEGRAM_ID`; create a backup and test on a newly provisioned staging database.
