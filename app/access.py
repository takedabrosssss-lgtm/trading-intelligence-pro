"""Authenticated-user provisioning and ownership helpers."""
from __future__ import annotations

import hashlib
import threading

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.database import SessionLocal, User, PaperAccount

_USER_LOCKS: dict[str, threading.RLock] = {}
_USER_LOCKS_GUARD = threading.Lock()


def _user_lock(telegram_id: str) -> threading.RLock:
    with _USER_LOCKS_GUARD:
        return _USER_LOCKS.setdefault(telegram_id, threading.RLock())


def _postgres_user_lock_id(telegram_id: str) -> int:
    digest = hashlib.blake2b(
        telegram_id.encode("utf-8"), digest_size=8, person=b"mirageUsr"
    ).digest()
    unsigned = int.from_bytes(digest, "big", signed=False)
    return unsigned if unsigned < (1 << 63) else unsigned - (1 << 64)


STRATEGY_ACCOUNTS = (
    ("Scalping", "scalping"),
    ("Intraday", "intraday"),
    ("Swing", "swing"),
    ("Position", "position"),
)


def ensure_user_records(user_data: dict) -> User:
    telegram_id = str(user_data.get("id", "")).strip()
    if not telegram_id:
        raise ValueError("Telegram user ID is missing")
    # Many Mini App requests arrive concurrently on the first page load. Serialize
    # provisioning for a Telegram ID in-process, and across Render instances on PostgreSQL.
    with _user_lock(telegram_id):
        return _ensure_user_records_locked(user_data, telegram_id)


def _ensure_user_records_locked(user_data: dict, telegram_id: str) -> User:
    db = SessionLocal()
    try:
        if db.get_bind().dialect.name == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(:lock_id)"),
                {"lock_id": _postgres_user_lock_id(telegram_id)},
            )
        user = db.query(User).filter(User.telegram_id == telegram_id).first()
        is_owner = telegram_id == str(settings.owner_telegram_id or "")
        if user is None:
            allowed_by_env = telegram_id in settings.allowed_user_ids
            if not is_owner and not allowed_by_env:
                raise PermissionError("This Telegram account has not been invited")
            active_count = db.query(User).filter(User.is_active.is_(True)).count()
            if active_count >= settings.max_users:
                raise PermissionError("MIRAGE user limit has been reached")
            user = User(
                telegram_id=telegram_id,
                username=(user_data.get("username") or "")[:100] or None,
                first_name=(user_data.get("first_name") or "")[:100] or None,
                role="owner" if is_owner else "user",
                is_active=True,
                ui_mode="stealth",
                trading_mode="paper",
            )
            db.add(user)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                user = db.query(User).filter(User.telegram_id == telegram_id).first()
                if user is None:
                    raise
        else:
            if not user.is_active:
                raise PermissionError("This MIRAGE account is disabled")
            user.username = (user_data.get("username") or "")[:100] or user.username
            user.first_name = (user_data.get("first_name") or "")[:100] or user.first_name
            if is_owner:
                user.role = "owner"

        # Every user starts with an independent $10,000 paper environment.
        for name, strategy in STRATEGY_ACCOUNTS:
            account = db.query(PaperAccount).filter(
                PaperAccount.owner_telegram_id == telegram_id,
                PaperAccount.strategy == strategy,
            ).first()
            if account is None:
                db.add(PaperAccount(
                    owner_telegram_id=telegram_id,
                    # Suffix keeps names unique on legacy SQLite databases where
                    # the old global UNIQUE(name) constraint cannot be dropped in-place.
                    name=f"{name} · {telegram_id}",
                    strategy=strategy,
                    balance=2500.0,
                    initial_balance=2500.0,
                ))
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def user_id_from_claims(user_data: dict) -> str:
    value = str((user_data or {}).get("id", "")).strip()
    if not value:
        raise ValueError("Telegram user ID is missing")
    return value


def user_account_ids(db, telegram_id: str) -> list[int]:
    return [row[0] for row in db.query(PaperAccount.id).filter(
        PaperAccount.owner_telegram_id == str(telegram_id)
    ).all()]
