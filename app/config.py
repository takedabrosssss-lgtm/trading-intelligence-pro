from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from functools import lru_cache

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    app_name: str = "Trading Intelligence PRO"
    environment: str = "development"
    bot_token: str = ""
    telegram_admin_ids: str = ""
    telegram_channel_id: str = ""
    mini_app_url: str = ""
    webhook_url: str = ""
    webhook_secret: str = "change-me"
    redis_url: str = ""
    database_url: str = "sqlite+aiosqlite:///./trading.db"
    market_data_provider: str = "binance"
    binance_base_url: str = "https://api.binance.com"
    forex_api_key: str = ""
    twelve_data_api_key: str = ""
    scan_interval_seconds: int = 300
    signal_min_winrate: float = 60.0
    trading_style: str = "balanced"
    paper_trading: bool = True
    min_backtest_trades: int = 30
    backtest_days: int = 365
    default_timeframe: str = "1h"
    allowed_origins: str = "*"
    log_level: str = "INFO"

    @property
    def admin_ids(self) -> set[int]:
        return {int(x.strip()) for x in self.telegram_admin_ids.split(",") if x.strip().isdigit()}

    @property
    def database_url_async(self) -> str:
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

@lru_cache
def get_settings():
    return Settings()
