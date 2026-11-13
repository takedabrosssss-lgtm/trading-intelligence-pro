"""MIRAGE multi-user profile, preferences, invitations and exchange vault API."""
from __future__ import annotations

import logging

import httpx
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from app.access import STRATEGY_ACCOUNTS
from app.config import settings
from app.database import SessionLocal, User, PaperAccount, Position, ExchangeConnection, ExchangeAuditEvent
from app.exchange_clients import verify_credentials
from app.security import encrypt_secret, CredentialEncryptionUnavailable
from app.access import user_id_from_claims, user_account_ids
from app.market_data import market_data
from app.paper_trading import _close_position

logger = logging.getLogger("mirage.platform")


class PreferencesRequest(BaseModel):
    ui_mode: str | None = None
    trading_mode: str | None = None


class InviteRequest(BaseModel):
    telegram_id: str = Field(min_length=4, max_length=32, pattern=r"^[0-9]+$")


class ExchangeConnectRequest(BaseModel):
    exchange: str = Field(pattern=r"^(binance|bybit)$")
    environment: str = Field(default="mainnet", pattern=r"^(mainnet|testnet)$")
    api_key: str = Field(min_length=8, max_length=256)
    api_secret: str = Field(min_length=8, max_length=256)
    confirm_withdrawals_disabled: bool = False
    label: str | None = Field(default=None, max_length=100)


def _audit(db, owner_id: str, connection_id: int | None, event_type: str,
           outcome: str, details: dict | None = None) -> None:
    db.add(ExchangeAuditEvent(
        owner_telegram_id=owner_id,
        connection_id=connection_id,
        event_type=event_type,
        outcome=outcome,
        details=details or {},
        created_at=datetime.now(timezone.utc),
    ))


def _owned_connection(db, owner_id: str, connection_id: int):
    row = db.query(ExchangeConnection).filter(
        ExchangeConnection.id == connection_id,
        ExchangeConnection.owner_telegram_id == owner_id,
    ).first()
    if row is None:
        raise HTTPException(404, "Exchange connection not found")
    return row


def build_platform_router(require_user):
    router = APIRouter(prefix="/api/platform", tags=["platform"])

    @router.get("/profile")
    async def profile(user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        db = SessionLocal()
        try:
            row = db.query(User).filter(User.telegram_id == owner_id).first()
            if row is None or not row.is_active:
                raise HTTPException(403, "MIRAGE account is inactive")
            connections = db.query(ExchangeConnection).filter(
                ExchangeConnection.owner_telegram_id == owner_id,
                ExchangeConnection.connection_status == "connected",
            ).count()
            active_users = db.query(User).filter(User.is_active.is_(True)).count()
            return {
                "telegram_id": row.telegram_id,
                "username": row.username,
                "first_name": row.first_name,
                "role": row.role,
                "ui_mode": row.ui_mode or "stealth",
                "trading_mode": row.trading_mode or "paper",
                "exchange_connections": connections,
                "is_owner": row.role == "owner",
                "active_users": active_users if row.role == "owner" else None,
                "max_users": settings.max_users if row.role == "owner" else None,
                "live_trading_enabled": False,
            }
        finally:
            db.close()

    @router.put("/preferences")
    async def update_preferences(payload: PreferencesRequest, user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        if payload.ui_mode is None and payload.trading_mode is None:
            raise HTTPException(400, "No preferences supplied")
        if payload.ui_mode is not None and payload.ui_mode not in {"stealth", "spectre"}:
            raise HTTPException(400, "ui_mode must be stealth or spectre")
        if payload.trading_mode is not None and payload.trading_mode not in {"paper", "live"}:
            raise HTTPException(400, "trading_mode must be paper or live")
        db = SessionLocal()
        try:
            row = db.query(User).filter(User.telegram_id == owner_id, User.is_active.is_(True)).first()
            if row is None:
                raise HTTPException(403, "MIRAGE account is inactive")
            if payload.ui_mode is not None:
                row.ui_mode = payload.ui_mode
            if payload.trading_mode is not None:
                if payload.trading_mode == "live":
                    raise HTTPException(
                        409,
                        "LIVE order execution is not included in this release. Exchange connections are verified and stored, but all orders remain disabled.",
                    )
                row.trading_mode = "paper"
            db.commit()
            return {"ui_mode": row.ui_mode, "trading_mode": row.trading_mode}
        finally:
            db.close()

    @router.get("/users")
    async def list_users(user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        db = SessionLocal()
        try:
            actor = db.query(User).filter(User.telegram_id == owner_id).first()
            if actor is None or actor.role != "owner":
                raise HTTPException(403, "Owner access required")
            users = db.query(User).order_by(User.created_at.asc()).all()
            return {"users": [{
                "telegram_id": item.telegram_id,
                "username": item.username,
                "first_name": item.first_name,
                "role": item.role,
                "is_active": bool(item.is_active),
                "created_at": item.created_at.isoformat() if item.created_at else None,
            } for item in users], "max_users": settings.max_users}
        finally:
            db.close()

    @router.post("/users", status_code=201)
    async def invite_user(payload: InviteRequest, user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        if payload.telegram_id == owner_id:
            raise HTTPException(400, "Owner is already registered")
        db = SessionLocal()
        try:
            actor = db.query(User).filter(User.telegram_id == owner_id).first()
            if actor is None or actor.role != "owner":
                raise HTTPException(403, "Owner access required")
            existing = db.query(User).filter(User.telegram_id == payload.telegram_id).first()
            if existing and existing.is_active:
                raise HTTPException(409, "This Telegram ID is already invited")
            active_count = db.query(User).filter(User.is_active.is_(True)).count()
            if (existing is None or not existing.is_active) and active_count >= settings.max_users:
                raise HTTPException(409, "MIRAGE user limit has been reached")
            if existing:
                existing.is_active = True
                existing.invited_by = owner_id
                existing.role = "user"
            else:
                existing = User(
                    telegram_id=payload.telegram_id,
                    role="user",
                    invited_by=owner_id,
                    is_active=True,
                    ui_mode="stealth",
                    trading_mode="paper",
                )
                db.add(existing)
            db.flush()
            for name, strategy in STRATEGY_ACCOUNTS:
                account = db.query(PaperAccount).filter(
                    PaperAccount.owner_telegram_id == payload.telegram_id,
                    PaperAccount.strategy == strategy,
                ).first()
                if account is None:
                    db.add(PaperAccount(
                        owner_telegram_id=payload.telegram_id,
                        name=f"{name} · {payload.telegram_id}",
                        strategy=strategy,
                        balance=2500.0,
                        initial_balance=2500.0,
                    ))
            db.commit()
            return {"status": "invited", "telegram_id": payload.telegram_id,
                    "paper_initial_capital": 10000.0}
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(409, "Could not create invitation; refresh and try again") from exc
        finally:
            db.close()

    @router.delete("/users/{telegram_id}")
    async def deactivate_user(telegram_id: str, user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        db = SessionLocal()
        try:
            actor = db.query(User).filter(User.telegram_id == owner_id).first()
            target = db.query(User).filter(User.telegram_id == telegram_id).first()
            if actor is None or actor.role != "owner":
                raise HTTPException(403, "Owner access required")
            if target is None or target.telegram_id == owner_id:
                raise HTTPException(404, "User not found or cannot deactivate owner")
            target.is_active = False
            connections = db.query(ExchangeConnection).filter(
                ExchangeConnection.owner_telegram_id == telegram_id
            ).all()
            for connection in connections:
                connection.emergency_lock = True
                connection.connection_status = "disabled"
                # Remove locally stored credentials when access is revoked.
                # This is not a remote API-key revocation; the user must revoke it at the exchange.
                connection.api_key_encrypted = ""
                connection.api_secret_encrypted = ""
                _audit(db, owner_id, connection.id, "USER_DEACTIVATED", "LOCAL_CREDENTIALS_REMOVED", {
                    "affected_user_telegram_id": telegram_id,
                    "note": "Local credentials erased. The exchange API key must be revoked separately in the exchange account.",
                })
            db.commit()
            return {"status": "deactivated", "telegram_id": telegram_id}
        finally:
            db.close()

    @router.get("/exchanges")
    async def list_exchanges(user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        db = SessionLocal()
        try:
            rows = db.query(ExchangeConnection).filter(
                ExchangeConnection.owner_telegram_id == owner_id
            ).order_by(ExchangeConnection.created_at.desc()).all()
            return {"connections": [{
                "id": row.id, "exchange": row.exchange, "label": row.label,
                "environment": row.environment, "status": row.connection_status,
                "can_trade": row.can_trade,
                "withdrawal_check": "manual_required" if row.exchange == "bybit" else "verified_disabled",
                "emergency_lock": bool(row.emergency_lock),
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "last_checked_at": row.last_checked_at.isoformat() if row.last_checked_at else None,
            } for row in rows], "live_trading_enabled": bool(settings.live_trading_enabled)}
        finally:
            db.close()

    @router.post("/exchanges/connect", status_code=201)
    async def connect_exchange(payload: ExchangeConnectRequest, user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        if not payload.confirm_withdrawals_disabled:
            raise HTTPException(
                400,
                "Confirm that withdrawal permissions are disabled in the exchange API-key settings before connecting.",
            )
        try:
            result = await verify_credentials(
                payload.exchange, payload.environment, payload.api_key, payload.api_secret
            )
            encrypted_key = encrypt_secret(payload.api_key)
            encrypted_secret = encrypt_secret(payload.api_secret)
        except CredentialEncryptionUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(403, str(exc)) from exc
        except httpx.HTTPError as exc:
            logger.warning("Exchange credential check failed (%s): %s", payload.exchange, type(exc).__name__)
            raise HTTPException(502, "Exchange did not accept the connection check. Verify API host, key and IP restrictions.") from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            logger.exception("Unexpected exchange verification error")
            raise HTTPException(502, "Exchange connection could not be verified") from exc

        db = SessionLocal()
        try:
            row = db.query(ExchangeConnection).filter(
                ExchangeConnection.owner_telegram_id == owner_id,
                ExchangeConnection.exchange == payload.exchange,
                ExchangeConnection.environment == payload.environment,
            ).first()
            if row is None:
                row = ExchangeConnection(
                    owner_telegram_id=owner_id,
                    exchange=payload.exchange,
                    environment=payload.environment,
                    api_key_encrypted=encrypted_key,
                    api_secret_encrypted=encrypted_secret,
                    label=payload.label,
                    connection_status="connected",
                    can_trade=bool(result.get("can_trade")),
                    withdrawal_access_detected=result.get("withdrawal_access_detected"),
                    emergency_lock=False,
                    last_checked_at=datetime.now(timezone.utc),
                )
                db.add(row)
                db.flush()
            else:
                row.api_key_encrypted = encrypted_key
                row.api_secret_encrypted = encrypted_secret
                row.label = payload.label or row.label
                row.connection_status = "connected"
                row.can_trade = bool(result.get("can_trade"))
                row.withdrawal_access_detected = result.get("withdrawal_access_detected")
                row.emergency_lock = False
                row.last_checked_at = datetime.now(timezone.utc)
            _audit(db, owner_id, row.id, "CONNECT", "SUCCESS", {
                "exchange": payload.exchange,
                "environment": payload.environment,
                "withdrawal_check": result.get("withdrawal_check"),
            })
            db.commit()
            return {
                "status": "connected", "connection_id": row.id,
                "exchange": row.exchange, "environment": row.environment,
                "withdrawal_check": result.get("withdrawal_check"),
                "message": (
                    "Connection verified. Bybit withdrawal permission must be checked manually in the Bybit API-key settings."
                    if payload.exchange == "bybit" else
                    "Connection verified. Binance reports withdrawal access disabled."
                ),
            }
        finally:
            db.close()

    @router.delete("/exchanges/{connection_id}")
    async def disconnect_exchange(connection_id: int, user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        db = SessionLocal()
        try:
            row = _owned_connection(db, owner_id, connection_id)
            row.api_key_encrypted = ""
            row.api_secret_encrypted = ""
            row.connection_status = "disconnected"
            row.emergency_lock = True
            _audit(db, owner_id, row.id, "DISCONNECT", "SUCCESS", {
                "note": "Local encrypted credentials removed; revoke API key at the exchange to invalidate it fully."
            })
            db.commit()
            return {"status": "disconnected", "message": "Local credentials removed. Revoke the API key in the exchange account to invalidate it fully."}
        finally:
            db.close()

    @router.post("/paper/positions/{position_id}/close")
    async def close_paper_position(position_id: int, user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        db = SessionLocal()
        try:
            row = db.query(Position).join(PaperAccount, Position.account_id == PaperAccount.id).filter(
                Position.id == position_id,
                Position.status == "open",
                PaperAccount.owner_telegram_id == owner_id,
            ).with_for_update().first()
            if row is None or row.status != "open":
                raise HTTPException(404, "Open Paper Trading position not found")
            quote = await market_data.get_price(row.symbol)
            exit_price = float(quote.get("price") or 0)
            if exit_price <= 0:
                raise HTTPException(502, "Current market price is unavailable; position was not changed")
            _close_position(db, row, exit_price, "MANUAL_CLOSE")
            db.commit()
            return {
                "status": "closed", "position_id": row.id, "symbol": row.symbol,
                "exit_price": round(exit_price, 8),
                "realized_pnl": round(float(row.realized_pnl or 0), 2),
                "exit_reason": "MANUAL_CLOSE",
                "included_in_win_rate": False,
            }
        except HTTPException:
            db.rollback()
            raise
        except Exception as exc:
            db.rollback()
            logger.exception("Manual Paper position close failed")
            raise HTTPException(502, "Position was not closed; refresh and retry") from exc
        finally:
            db.close()

    @router.get("/live/status")
    async def live_status(user=Depends(require_user)):
        owner_id = user_id_from_claims(user)
        db = SessionLocal()
        try:
            connections = db.query(ExchangeConnection).filter(
                ExchangeConnection.owner_telegram_id == owner_id,
                ExchangeConnection.connection_status == "connected",
            ).count()
            return {
                "live_trading_enabled": False,
                "connected_exchanges": connections,
                "trading_mode": "paper",
                "order_execution": "disabled",
                "notice": "This release verifies and securely stores exchange connections. Live order execution is intentionally disabled pending a separately validated testnet execution release.",
            }
        finally:
            db.close()

    @router.post("/phantom/lock")
    async def phantom_lock(user=Depends(require_user)):
        """Fail-safe lock: stop future MIRAGE activity without falsely claiming positions closed."""
        owner_id = user_id_from_claims(user)
        db = SessionLocal()
        try:
            rows = db.query(ExchangeConnection).filter(
                ExchangeConnection.owner_telegram_id == owner_id,
                ExchangeConnection.connection_status == "connected",
            ).all()
            for row in rows:
                row.emergency_lock = True
                _audit(db, owner_id, row.id, "PHANTOM_LOCK", "LOCKED", {
                    "note": "Order execution is disabled in this release; no exchange positions were closed or API keys revoked."
                })
            user_row = db.query(User).filter(User.telegram_id == owner_id).first()
            if user_row:
                user_row.trading_mode = "paper"
            db.commit()
            return {
                "status": "locked",
                "connections_locked": len(rows),
                "positions_closed": 0,
                "keys_revoked": False,
                "message": "MIRAGE live mode is locked. No exchange positions were closed. Check and close any manually opened exchange positions directly in the exchange app, then revoke the API key there if needed.",
            }
        finally:
            db.close()

    return router
