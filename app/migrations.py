"""Conservative, idempotent schema preparation for existing MIRAGE databases.

Legacy Paper Trading rows are assigned to OWNER_TELEGRAM_ID; balances, positions,
signals and trades are never reset. New account names include the Telegram ID so
upgraded SQLite databases can retain their legacy UNIQUE(name) constraint safely.
"""
from __future__ import annotations

import logging
from sqlalchemy import inspect, text
from app.config import settings
from app.database import engine

logger = logging.getLogger("mirage.migrations")


def prepare_legacy_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if not tables:
        logger.info("Empty database: create_all will create the current schema")
        return

    dialect = engine.dialect.name
    with engine.begin() as connection:
        current = set(inspect(connection).get_table_names())
        if "users" in current:
            columns = {c["name"] for c in inspect(connection).get_columns("users")}
            additions = {
                "role": "VARCHAR(20) NOT NULL DEFAULT 'user'",
                "invited_by": "VARCHAR(32)",
                "ui_mode": "VARCHAR(20) NOT NULL DEFAULT 'stealth'",
                "trading_mode": "VARCHAR(20) NOT NULL DEFAULT 'paper'",
                "phantom_locked": "BOOLEAN NOT NULL DEFAULT FALSE",
            }
            for name, definition in additions.items():
                if name not in columns:
                    connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))

        if "paper_accounts" in current:
            columns = {c["name"] for c in inspect(connection).get_columns("paper_accounts")}
            if "owner_telegram_id" not in columns:
                connection.execute(text(
                    "ALTER TABLE paper_accounts ADD COLUMN owner_telegram_id VARCHAR(32) NOT NULL DEFAULT ''"
                ))
            owner_id = (settings.owner_telegram_id or "").strip()
            if owner_id:
                connection.execute(
                    text("UPDATE paper_accounts SET owner_telegram_id = :owner WHERE owner_telegram_id = '' OR owner_telegram_id IS NULL"),
                    {"owner": owner_id},
                )
            else:
                unassigned = connection.execute(text(
                    "SELECT COUNT(*) FROM paper_accounts WHERE owner_telegram_id = '' OR owner_telegram_id IS NULL"
                )).scalar_one()
                if unassigned:
                    raise RuntimeError(
                        "Set OWNER_TELEGRAM_ID before starting this release: existing Paper accounts need a clear owner."
                    )

            if dialect == "postgresql":
                # The legacy name uniqueness is no longer appropriate for multiple users.
                for constraint in inspect(connection).get_unique_constraints("paper_accounts"):
                    if constraint.get("column_names") == ["name"] and constraint.get("name"):
                        name = constraint["name"].replace('"', '""')
                        connection.execute(text(f'ALTER TABLE paper_accounts DROP CONSTRAINT IF EXISTS "{name}"'))
                connection.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_accounts_owner_strategy "
                    "ON paper_accounts (owner_telegram_id, strategy)"
                ))
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_paper_accounts_owner "
                    "ON paper_accounts (owner_telegram_id)"
                ))
            elif dialect == "sqlite":
                # Existing SQLite databases keep UNIQUE(name); new accounts use a
                # Telegram-ID suffix, avoiding a risky table rebuild during rollout.
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_paper_accounts_owner ON paper_accounts (owner_telegram_id)"
                ))
                connection.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_accounts_owner_strategy "
                    "ON paper_accounts (owner_telegram_id, strategy)"
                ))

    logger.info("MIRAGE schema preparation complete (%s)", dialect)
