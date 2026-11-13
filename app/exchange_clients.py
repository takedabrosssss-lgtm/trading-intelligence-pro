"""Read-only credential verification for Binance and Bybit.

This module intentionally exposes no withdrawal methods and does not submit
orders. It validates that a supplied key can authenticate against its chosen
environment before the encrypted key pair is stored.
"""
from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import urlencode

import httpx

BINANCE_HOSTS = {
    "mainnet": "https://api.binance.com",
    "testnet": "https://testnet.binance.vision",
}
BYBIT_HOSTS = {
    "mainnet": "https://api.bybit.com",
    "testnet": "https://api-testnet.bybit.com",
}


def sign_binance_params(params: dict[str, str | int], secret: str) -> dict[str, str | int]:
    normalized = {key: str(value) for key, value in params.items()}
    payload = urlencode(normalized)
    normalized["signature"] = hmac.new(
        secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return normalized


def sign_bybit_request(timestamp: str, api_key: str, recv_window: str,
                       payload: str, secret: str) -> str:
    pre_sign = f"{timestamp}{api_key}{recv_window}{payload}"
    return hmac.new(secret.encode("utf-8"), pre_sign.encode("utf-8"), hashlib.sha256).hexdigest()


async def verify_credentials(exchange: str, environment: str, api_key: str,
                             api_secret: str) -> dict:
    exchange = exchange.lower().strip()
    environment = environment.lower().strip()
    if environment not in {"mainnet", "testnet"}:
        raise ValueError("Unsupported exchange environment")
    if not api_key.strip() or not api_secret.strip():
        raise ValueError("API key and secret are required")

    timeout = httpx.Timeout(10.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if exchange == "binance":
            params = sign_binance_params({
                "recvWindow": 5000,
                "timestamp": int(time.time() * 1000),
            }, api_secret)
            response = await client.get(
                BINANCE_HOSTS[environment] + "/api/v3/account",
                params=params,
                headers={"X-MBX-APIKEY": api_key},
            )
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict) or "canTrade" not in data:
                raise ValueError("Binance returned an unexpected account response")
            withdrawal_permission = data.get("canWithdraw")
            if withdrawal_permission is True:
                raise PermissionError(
                    "The Binance API key has withdrawal permission. Disable withdrawals and create a new key."
                )
            if withdrawal_permission is not False:
                raise PermissionError(
                    "Binance did not explicitly confirm that withdrawals are disabled. Verify API-key permissions and try again."
                )
            return {
                "exchange": exchange,
                "environment": environment,
                "can_trade": bool(data.get("canTrade")),
                "withdrawal_access_detected": False,
                "withdrawal_check": "verified_disabled",
                "account_type": "spot",
            }

        if exchange == "bybit":
            timestamp = str(int(time.time() * 1000))
            recv_window = "5000"
            query = "accountType=UNIFIED"
            signature = sign_bybit_request(
                timestamp, api_key, recv_window, query, api_secret
            )
            response = await client.get(
                BYBIT_HOSTS[environment] + "/v5/account/wallet-balance?" + query,
                headers={
                    "X-BAPI-API-KEY": api_key,
                    "X-BAPI-TIMESTAMP": timestamp,
                    "X-BAPI-RECV-WINDOW": recv_window,
                    "X-BAPI-SIGN": signature,
                    "X-BAPI-SIGN-TYPE": "2",
                },
            )
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict) or data.get("retCode") != 0:
                message = data.get("retMsg", "Bybit authentication failed") if isinstance(data, dict) else "Bybit authentication failed"
                raise PermissionError(str(message)[:180])
            return {
                "exchange": exchange,
                "environment": environment,
                "can_trade": None,
                "withdrawal_access_detected": None,
                "withdrawal_check": "manual_required",
                "account_type": "unified",
            }

    raise ValueError("Unsupported exchange. Supported: Binance, Bybit")

async def fetch_account_snapshot(exchange: str, environment: str, api_key: str,
                                 api_secret: str) -> dict:
    """Fetch a sanitized read-only account snapshot; never returns credentials."""
    exchange = exchange.lower().strip()
    environment = environment.lower().strip()
    if environment not in {"mainnet", "testnet"}:
        raise ValueError("Unsupported exchange environment")
    if not api_key.strip() or not api_secret.strip():
        raise ValueError("API key and secret are required")

    timeout = httpx.Timeout(10.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if exchange == "binance":
            params = sign_binance_params({
                "recvWindow": 5000,
                "timestamp": int(time.time() * 1000),
            }, api_secret)
            response = await client.get(
                BINANCE_HOSTS[environment] + "/api/v3/account",
                params=params,
                headers={"X-MBX-APIKEY": api_key},
            )
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict) or not isinstance(data.get("balances"), list):
                raise ValueError("Binance returned an unexpected account response")
            assets = []
            for item in data["balances"]:
                if not isinstance(item, dict):
                    continue
                free = float(item.get("free") or 0)
                locked = float(item.get("locked") or 0)
                if free + locked > 0:
                    assets.append({
                        "asset": str(item.get("asset") or "")[:20],
                        "free": free,
                        "locked": locked,
                        "total": free + locked,
                    })
            assets.sort(key=lambda item: item["total"], reverse=True)
            return {
                "exchange": exchange,
                "environment": environment,
                "account_type": str(data.get("accountType") or "spot"),
                "can_trade": bool(data.get("canTrade")),
                "total_equity_usd": None,
                "valuation_available": False,
                "assets": assets[:100],
                "note": "Binance Spot balances are shown in native asset units; USD valuation is not calculated in this release.",
            }

        if exchange == "bybit":
            timestamp = str(int(time.time() * 1000))
            recv_window = "5000"
            query = "accountType=UNIFIED"
            signature = sign_bybit_request(timestamp, api_key, recv_window, query, api_secret)
            response = await client.get(
                BYBIT_HOSTS[environment] + "/v5/account/wallet-balance?" + query,
                headers={
                    "X-BAPI-API-KEY": api_key,
                    "X-BAPI-TIMESTAMP": timestamp,
                    "X-BAPI-RECV-WINDOW": recv_window,
                    "X-BAPI-SIGN": signature,
                    "X-BAPI-SIGN-TYPE": "2",
                },
            )
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict) or data.get("retCode") != 0:
                message = data.get("retMsg", "Bybit account request failed") if isinstance(data, dict) else "Bybit account request failed"
                raise PermissionError(str(message)[:180])
            result = data.get("result") or {}
            accounts = result.get("list") or []
            account = accounts[0] if accounts else {}
            assets = []
            for item in account.get("coin") or []:
                if not isinstance(item, dict):
                    continue
                wallet = float(item.get("walletBalance") or 0)
                locked = float(item.get("locked") or 0)
                usd_value = float(item.get("usdValue") or 0)
                if wallet or locked or usd_value:
                    assets.append({
                        "asset": str(item.get("coin") or "")[:20],
                        "free": max(0.0, wallet - locked),
                        "locked": locked,
                        "total": wallet,
                        "usd_value": usd_value,
                    })
            assets.sort(key=lambda item: item.get("usd_value", 0), reverse=True)
            total_equity = account.get("totalEquity")
            return {
                "exchange": exchange,
                "environment": environment,
                "account_type": "unified",
                "total_equity_usd": float(total_equity) if total_equity not in (None, "") else None,
                "total_wallet_balance_usd": float(account.get("totalWalletBalance") or 0),
                "valuation_available": total_equity not in (None, ""),
                "assets": assets[:100],
                "note": "Bybit Unified account snapshot. Values are provided by Bybit.",
            }

    raise ValueError("Unsupported exchange. Supported: Binance, Bybit")

