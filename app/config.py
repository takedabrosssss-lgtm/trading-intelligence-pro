import os
from datetime import datetime, timezone
from dataclasses import dataclass
from functools import lru_cache


def parse_user_ids(value: str) -> set[str]:
    return {item.strip() for item in value.split(",") if item.strip()}


def parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_utc_datetime(value: str | None) -> datetime | None:
    if not value or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True)
class Settings:
    environment: str
    bot_token: str
    telegram_webhook_secret: str
    webhook_url: str
    mini_app_url: str
    owner_telegram_id: str
    allowed_telegram_ids: str
    database_url: str
    secret_key: str
    exchange_encryption_key: str
    live_trading_enabled: bool
    max_users: int
    host: str
    port: int
    initial_capital: float
    strategy_capital: float
    max_risk_per_trade: float
    max_drawdown: float
    binance_base_url: str
    binance_futures_base_url: str
    bybit_base_url: str
    scan_interval_seconds: int
    request_timeout_seconds: int
    futures_position_check_seconds: int
    futures_taker_fee_rate: float
    futures_slippage_rate: float
    futures_maintenance_margin_rate: float
    futures_liquidation_fee_rate: float
    futures_max_leverage: int
    futures_max_exposure_fraction: float
    futures_max_margin_fraction: float
    signal_notifications_enabled: bool
    signal_notifications_start_after: datetime | None
    signal_notifications_max_signals_per_cycle: int
    signal_notifications_delay_seconds: float

    @property
    def telegram_token(self) -> str:
        return self.bot_token

    @property
    def allowed_user_ids(self) -> set[str]:
        ids = parse_user_ids(self.allowed_telegram_ids)
        if self.owner_telegram_id:
            ids.add(self.owner_telegram_id)
        return ids


@lru_cache
def get_settings() -> Settings:
    return Settings(
        environment=os.getenv("ENVIRONMENT", "production"),
        bot_token=os.getenv("BOT_TOKEN", os.getenv("TELEGRAM_BOT_TOKEN", "")),
        telegram_webhook_secret=os.getenv("TELEGRAM_WEBHOOK_SECRET", ""),
        webhook_url=os.getenv("WEBHOOK_URL", ""),
        mini_app_url=os.getenv("MINI_APP_URL", ""),
        owner_telegram_id=os.getenv("OWNER_TELEGRAM_ID", ""),
        allowed_telegram_ids=os.getenv("ALLOWED_TELEGRAM_IDS", ""),
        database_url=os.getenv("DATABASE_URL", "sqlite:///./trading_intelligence.db"),
        secret_key=os.getenv("SECRET_KEY", ""),
        exchange_encryption_key=os.getenv("EXCHANGE_ENCRYPTION_KEY", ""),
        # Deliberately hard-disabled: this release is Paper Trading only.
        live_trading_enabled=False,
        max_users=max(1, min(int(os.getenv("MAX_USERS", "4")), 20)),
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        initial_capital=10000.0,
        strategy_capital=2500.0,
        max_risk_per_trade=0.015,
        max_drawdown=0.10,
        binance_base_url=os.getenv("BINANCE_SPOT_BASE_URL", "https://data-api.binance.vision").rstrip("/"),
        binance_futures_base_url=os.getenv("BINANCE_FUTURES_BASE_URL", "https://fapi.binance.com").rstrip("/"),
        bybit_base_url=os.getenv("BYBIT_BASE_URL", "https://api.bybit.com").rstrip("/"),
        scan_interval_seconds=max(60, int(os.getenv("SCAN_INTERVAL_SECONDS", "300"))),
        request_timeout_seconds=max(3, min(int(os.getenv("REQUEST_TIMEOUT_SECONDS", "15")), 60)),
        futures_position_check_seconds=max(3, min(int(os.getenv("FUTURES_POSITION_CHECK_SECONDS", "5")), 30)),
        futures_taker_fee_rate=max(0.0, min(float(os.getenv("FUTURES_TAKER_FEE_RATE", "0.0005")), 0.01)),
        futures_slippage_rate=max(0.0, min(float(os.getenv("FUTURES_SLIPPAGE_RATE", "0.0002")), 0.05)),
        futures_maintenance_margin_rate=max(0.001, min(float(os.getenv("FUTURES_MAINTENANCE_MARGIN_RATE", "0.01")), 0.10)),
        futures_liquidation_fee_rate=max(0.0, min(float(os.getenv("FUTURES_LIQUIDATION_FEE_RATE", "0.01")), 0.05)),
        futures_max_leverage=max(1, min(int(os.getenv("FUTURES_MAX_LEVERAGE", "8")), 8)),
        futures_max_exposure_fraction=max(0.10, min(float(os.getenv("FUTURES_MAX_EXPOSURE_FRACTION", "0.75")), 0.90)),
        futures_max_margin_fraction=max(0.10, min(float(os.getenv("FUTURES_MAX_MARGIN_FRACTION", "0.50")), 0.75)),
        signal_notifications_enabled=parse_bool(os.getenv("SIGNAL_NOTIFICATIONS_ENABLED"), False),
        signal_notifications_start_after=parse_utc_datetime(os.getenv("SIGNAL_NOTIFICATIONS_START_AFTER")),
        signal_notifications_max_signals_per_cycle=max(1, min(int(os.getenv("SIGNAL_NOTIFICATIONS_MAX_SIGNALS_PER_CYCLE", "5")), 5)),
        signal_notifications_delay_seconds=max(1.0, min(float(os.getenv("SIGNAL_NOTIFICATIONS_DELAY_SECONDS", "2")), 10.0)),
    )


settings = get_settings()
