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
