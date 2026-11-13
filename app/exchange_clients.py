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
            if bool(data.get("canWithdraw")):
                raise PermissionError(
                    "The Binance API key has withdrawal permission. Disable withdrawals and create a new key."
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
