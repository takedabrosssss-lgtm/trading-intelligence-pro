
"""Read-only credential verification for Binance, Bybit and Kraken Spot.

No order placement, trading, funding or withdrawal methods are implemented.
Kraken API keys are accepted only when their sole permission is query-funds.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import threading
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

KRAKEN_HOST = "https://api.kraken.com"

_kraken_nonce_lock = threading.Lock()
_kraken_last_nonce = 0


def sign_binance_params(
    params: dict[str, str | int],
    secret: str,
) -> dict[str, str | int]:
    normalized = {key: str(value) for key, value in params.items()}
    payload = urlencode(normalized)

    normalized["signature"] = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return normalized


def sign_bybit_request(
    timestamp: str,
    api_key: str,
    recv_window: str,
    payload: str,
    secret: str,
) -> str:
    pre_sign = f"{timestamp}{api_key}{recv_window}{payload}"

    return hmac.new(
        secret.encode("utf-8"),
        pre_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _next_kraken_nonce() -> str:
    """Generate a strictly increasing millisecond nonce within this process."""
    global _kraken_last_nonce

    with _kraken_nonce_lock:
        candidate = int(time.time() * 1000)
        _kraken_last_nonce = max(candidate, _kraken_last_nonce + 1)
        return str(_kraken_last_nonce)


def sign_kraken_request(
    uri_path: str,
    post_data: str,
    nonce: str,
    secret: str,
) -> str:
    """Generate Kraken Spot API-Sign according to Kraken's REST specification."""
    try:
        secret_bytes = base64.b64decode(secret, validate=True)
    except Exception as exc:
        raise ValueError("Kraken API Secret is not valid Base64") from exc

    sha256_digest = hashlib.sha256(
        (nonce + post_data).encode("utf-8")
    ).digest()

    message = uri_path.encode("utf-8") + sha256_digest

    signature = hmac.new(
        secret_bytes,
        message,
        hashlib.sha512,
    ).digest()

    return base64.b64encode(signature).decode("ascii")


async def _kraken_private_post(
    client: httpx.AsyncClient,
    endpoint: str,
    api_key: str,
    api_secret: str,
) -> dict:
    """Execute a signed, read-only Kraken Spot private request."""
    uri_path = f"/0/private/{endpoint}"
    nonce = _next_kraken_nonce()
    post_data = urlencode({"nonce": nonce})

    signature = sign_kraken_request(
        uri_path,
        post_data,
        nonce,
        api_secret,
    )

    response = await client.post(
        KRAKEN_HOST + uri_path,
        content=post_data,
        headers={
            "API-Key": api_key,
            "API-Sign": signature,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )

    response.raise_for_status()

    try:
        payload = response.json()
    except ValueError as exc:
        raise ValueError("Kraken returned an invalid JSON response") from exc

    if not isinstance(payload, dict):
        raise ValueError("Kraken returned an unexpected response")

    errors = payload.get("error") or []

    if errors:
        message = "; ".join(str(item) for item in errors)[:240]

        lowered = message.lower()

        if (
            "invalid key" in lowered
            or "invalid signature" in lowered
            or "invalid nonce" in lowered
            or "permission denied" in lowered
        ):
            raise PermissionError(
                "Kraken rejected the API key, signature, nonce or required permission."
            )

        raise RuntimeError(f"Kraken API request failed: {message}")

    result = payload.get("result")

    if not isinstance(result, dict):
        raise ValueError("Kraken returned an unexpected result structure")

    return result


async def _verify_kraken_credentials(
    client: httpx.AsyncClient,
    api_key: str,
    api_secret: str,
) -> dict:
    """Verify key permissions and confirm that account balances are readable."""
    key_info = await _kraken_private_post(
        client,
        "GetApiKeyInfo",
        api_key,
        api_secret,
    )

    permissions = key_info.get("permissions")

    if not isinstance(permissions, list):
        raise PermissionError(
            "Kraken did not return API-key permissions. Connection rejected."
        )

    normalized_permissions = {
        str(permission).strip().lower()
        for permission in permissions
    }

    if "query-funds" not in normalized_permissions:
        raise PermissionError(
            "Kraken API key must have Query Funds permission enabled."
        )

    unsafe_permissions = normalized_permissions - {"query-funds"}

    if unsafe_permissions:
        raise PermissionError(
            "Kraken API key has additional permissions. "
            "Only Query Funds is allowed. Disable all other permissions."
        )

    # Verify that Query Funds actually permits a balance request.
    balance = await _kraken_private_post(
        client,
        "Balance",
        api_key,
        api_secret,
    )

    if not isinstance(balance, dict):
        raise ValueError("Kraken returned an invalid balance response")

    return {
        "exchange": "kraken",
        "environment": "mainnet",
        "can_trade": None,
        "withdrawal_access_detected": False,
        "withdrawal_check": "verified_disabled",
        "account_type": "spot",
        "permissions": ["query-funds"],
    }


async def verify_credentials(
    exchange: str,
    environment: str,
    api_key: str,
    api_secret: str,
) -> dict:
    exchange = exchange.lower().strip()
    environment = environment.lower().strip()

    if not api_key.strip() or not api_secret.strip():
        raise ValueError("API key and secret are required")

    if exchange == "kraken":
        if environment != "mainnet":
            raise ValueError("Kraken Spot supports Mainnet only in this integration.")

        timeout = httpx.Timeout(15.0, connect=7.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            return await _verify_kraken_credentials(
                client,
                api_key,
                api_secret,
            )

    if environment not in {"mainnet", "testnet"}:
        raise ValueError("Unsupported exchange environment")

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
                raise ValueError(
                    "Binance returned an unexpected account response"
                )

            withdrawal_permission = data.get("canWithdraw")

            if withdrawal_permission is True:
                raise PermissionError(
                    "The Binance API key has withdrawal permission. "
                    "Disable withdrawals and create a new key."
                )

            if withdrawal_permission is not False:
                raise PermissionError(
                    "Binance did not explicitly confirm that withdrawals "
                    "are disabled."
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
                timestamp,
                api_key,
                recv_window,
                query,
                api_secret,
            )

            response = await client.get(
                BYBIT_HOSTS[environment]
                + "/v5/account/wallet-balance?"
                + query,
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
                message = (
                    data.get("retMsg", "Bybit authentication failed")
                    if isinstance(data, dict)
                    else "Bybit authentication failed"
                )
                raise PermissionError(str(message)[:180])

            return {
                "exchange": exchange,
                "environment": environment,
                "can_trade": None,
                "withdrawal_access_detected": None,
                "withdrawal_check": "manual_required",
                "account_type": "unified",
            }

    raise ValueError("Unsupported exchange. Supported: Binance, Bybit, Kraken")


async def fetch_account_snapshot(
    exchange: str,
    environment: str,
    api_key: str,
    api_secret: str,
) -> dict:
    """Fetch a sanitized read-only account snapshot. Never returns credentials."""
    exchange = exchange.lower().strip()
    environment = environment.lower().strip()

    if not api_key.strip() or not api_secret.strip():
        raise ValueError("API key and secret are required")

    timeout = httpx.Timeout(15.0, connect=7.0)

    if exchange == "kraken":
        if environment != "mainnet":
            raise ValueError("Kraken Spot supports Mainnet only.")

        async with httpx.AsyncClient(timeout=timeout) as client:
            data = await _kraken_private_post(
                client,
                "Balance",
                api_key,
                api_secret,
            )

        assets = []

        for asset, raw_balance in data.items():
            try:
                total = float(raw_balance or 0)
            except (TypeError, ValueError):
                continue

            if total <= 0:
                continue

            assets.append({
                "asset": str(asset)[:20],
                "free": total,
                "locked": 0.0,
                "total": total,
            })

        assets.sort(
            key=lambda item: item["total"],
            reverse=True,
        )

        return {
            "exchange": "kraken",
            "environment": "mainnet",
            "account_type": "spot",
            "total_equity_usd": None,
            "valuation_available": False,
            "assets": assets[:100],
            "note": (
                "Kraken Spot balances are shown in native asset units. "
                "USD valuation and locked balances are not calculated "
                "in this release."
            ),
        }

    if environment not in {"mainnet", "testnet"}:
        raise ValueError("Unsupported exchange environment")

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

            if (
                not isinstance(data, dict)
                or not isinstance(data.get("balances"), list)
            ):
                raise ValueError(
                    "Binance returned an unexpected account response"
                )

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

            assets.sort(
                key=lambda item: item["total"],
                reverse=True,
            )

            return {
                "exchange": exchange,
                "environment": environment,
                "account_type": str(data.get("accountType") or "spot"),
                "can_trade": bool(data.get("canTrade")),
                "total_equity_usd": None,
                "valuation_available": False,
                "assets": assets[:100],
                "note": (
                    "Binance Spot balances are shown in native asset units; "
                    "USD valuation is not calculated in this release."
                ),
            }

        if exchange == "bybit":
            timestamp = str(int(time.time() * 1000))
            recv_window = "5000"
            query = "accountType=UNIFIED"

            signature = sign_bybit_request(
                timestamp,
                api_key,
                recv_window,
                query,
                api_secret,
            )

            response = await client.get(
                BYBIT_HOSTS[environment]
                + "/v5/account/wallet-balance?"
                + query,
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
                message = (
                    data.get("retMsg", "Bybit account request failed")
                    if isinstance(data, dict)
                    else "Bybit account request failed"
                )
                raise PermissionError(str(message)[:180])

            result = data.get("result") or {}
            accounts = result.get("list") or []
            account = accounts[0] if accounts else []

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

            assets.sort(
                key=lambda item: item.get("usd_value", 0),
                reverse=True,
            )

            total_equity = account.get("totalEquity")

            return {
                "exchange": exchange,
                "environment": environment,
                "account_type": "unified",
                "total_equity_usd": (
                    float(total_equity)
                    if total_equity not in (None, "")
                    else None
                ),
                "total_wallet_balance_usd": float(
                    account.get("totalWalletBalance") or 0
                ),
                "valuation_available": total_equity not in (None, ""),
                "assets": assets[:100],
                "note": (
                    "Bybit Unified account snapshot. "
                    "Values are provided by Bybit."
                ),
            }

    raise ValueError("Unsupported exchange. Supported: Binance, Bybit, Kraken")
            
