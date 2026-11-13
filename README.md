# MIRAGE — Main Release Candidate

MIRAGE is a Telegram Mini App and Telegram bot for market monitoring, technical analysis, research, news intelligence and isolated Paper Trading accounts.

This release combines the current `main` foundation with the tested `test`-branch work while retaining the production service/database names from the `main` Render blueprint.

## Included in this release

- Telegram Mini App authentication using Telegram-signed `initData`.
- Owner-controlled invitations and up to four active Telegram users by default.
- Separate user profiles and four Paper Trading strategy accounts per user (Scalping, Intraday, Swing, Position), with $2,500 per account / $10,000 total starting virtual capital.
- Tenant-scoped portfolio, trade history, journal, analytics, manual Paper position close and Paper statistics.
- Shared market signals and public market data, with each user's Paper positions kept in their own accounts.
- Binance and Bybit read-only credential verification and encrypted server-side storage.
- Read-only account snapshots: Binance native-asset balances and Bybit Unified account balances/valuation when supplied by the exchange.
- The user must explicitly confirm read-only access and disabled withdrawals. Binance `canWithdraw` is checked when present in the account response; the Bybit read-only endpoint does not expose all key-level permissions. Manually verify that both trading and withdrawals are disabled in the API-key settings on either exchange.
- Persistent PROTOCOL PHANTOM account lock. It blocks future MIRAGE exchange reconnects until the user explicitly unlocks the account. Previously locked connections require a fresh verification/reconnect.
- STEALTH MODE (light) and SPECTRE MODE (dark), with a persistent per-user preference.
- Existing market scanner, Paper Trading engine, Strategy Lab, research/backtesting, robustness analysis, signal intelligence and RSS news aggregation.

## Important trading and safety limitations

**Real order execution is not included and is hard-disabled.** This release does not submit live orders, cancel exchange orders, close exchange positions or revoke exchange API keys. PROTOCOL PHANTOM persistently locks MIRAGE's saved exchange connections and switches the user back to Paper Trading, but it cannot affect positions or orders placed directly at an exchange. Check and manage those directly in the exchange app.

Exchange API credentials are sent from the Mini App to the backend over HTTPS and encrypted with `EXCHANGE_ENCRYPTION_KEY`. The application never returns the plaintext key or secret to the frontend. Use read-only permissions for connection and account snapshots. Disable both trading and withdrawals in the exchange API-key settings. The read-only checks used here do not reliably prove all key-level trading/withdrawal permissions for both exchanges, so the user must inspect those settings manually before connecting.

Binance account snapshots show native asset quantities; this release does not calculate a consolidated USD valuation for Binance assets. Bybit Unified snapshots may include exchange-provided USD equity values.

This is a technical trading tool, not financial advice or a guarantee of profitability. Backtests and signal scores are heuristic and do not predict future returns.

## Required environment variables

- `BOT_TOKEN` — Telegram bot token.
- `OWNER_TELEGRAM_ID` — numeric Telegram ID of the owner. **Must be set before the first upgraded startup** so legacy Paper accounts can be assigned safely.
- `ALLOWED_TELEGRAM_IDS` — optional comma-separated allow-list for initial users. Invited users are persisted in the database.
- `MAX_USERS` — active-user cap; default `4`.
- `DATABASE_URL` — PostgreSQL in Render. Keep the existing production database attached to the existing production service.
- `MINI_APP_URL` — the Mini App HTTPS URL.
- `EXCHANGE_ENCRYPTION_KEY` — a dedicated Fernet key required to connect/store exchange credentials. It is separate from `SECRET_KEY`.

Generate a Fernet key once, outside Git:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Store it in the Render environment as `EXCHANGE_ENCRYPTION_KEY`. Keep it stable and backed up securely. Losing or changing this key makes previously stored exchange credentials undecryptable. Never put the actual key in `.env.example`, source code or Git.

## Database upgrade and deployment

1. Create a verified backup of the existing PostgreSQL database before deploying.
2. Confirm `OWNER_TELEGRAM_ID` matches the owner of the existing Paper Trading accounts.
3. Set `EXCHANGE_ENCRYPTION_KEY` in Render before enabling Exchange Center use.
4. Upload the release files to the `main` branch using the accompanying `UPLOAD_INSTRUCTIONS_RU.txt`.
5. Keep the existing production Render service and database resources. The included `render.yaml` retains their existing names and adds only the required environment-variable declarations; do not recreate the database.
6. Deploy and inspect startup logs. The idempotent schema preparation adds user/profile/ownership columns and assigns legacy Paper accounts to `OWNER_TELEGRAM_ID` without resetting balances, positions or trades.
7. Verify `/health`, Telegram Mini App authentication, owner profile, Paper balances and the new user's isolated $10,000 Paper environment before inviting anyone else.
8. Connect an exchange first with read-only permissions on testnet. Verify the connection and account snapshot before using a mainnet read-only key.

### Rollback precautions

- Keep the original `main` ZIP and a pre-release PostgreSQL backup until the new release is verified.
- If startup fails before any invitees are created, restore the original code snapshot; the additive schema changes are backward-compatible for the original single-user data model.
- Once additional users have been invited or have created Paper Trading history, **do not simply roll back to the old single-user code**: the old endpoints are not tenant-scoped and could expose combined user data. In that case, fix forward, or restore both the pre-release database backup and original code (this discards post-backup activity).
- Keep the same `EXCHANGE_ENCRYPTION_KEY` when restoring a database that contains exchange connections. Changing or losing it makes stored credentials undecryptable.

If `OWNER_TELEGRAM_ID` is missing while legacy Paper accounts are unassigned, startup intentionally fails rather than guessing ownership. If `EXCHANGE_ENCRYPTION_KEY` is missing or invalid, the app can still start, but exchange credential storage/decryption fails closed.

## Local development

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env             # fill required values
uvicorn app.main:app --reload --port 8000
```

The application starts the market scanner and Telegram bot polling supervisor from its FastAPI lifespan. Do not start a second polling process with the same bot token.

## Validation

Run from the repository root:

```bash
python -m compileall -q app tests
PYTHONPATH=. pytest -q
```

The release package includes regression tests for legacy SQLite migration, tenant isolation, Paper lifecycle, manual close statistics, exchange credential encryption/verification, account snapshots, persistent Phantom lock and invitation flows.
