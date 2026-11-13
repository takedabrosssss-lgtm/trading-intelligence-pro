"""Application-level encryption for exchange credentials.

The key is intentionally separate from SECRET_KEY and must be provisioned in the
service environment. No plaintext exchange secret is ever returned by this module.
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class CredentialEncryptionUnavailable(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = (settings.exchange_encryption_key or "").strip()
    if not key:
        raise CredentialEncryptionUnavailable(
            "EXCHANGE_ENCRYPTION_KEY is not configured"
        )
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError, UnicodeEncodeError) as exc:
        raise CredentialEncryptionUnavailable(
            "EXCHANGE_ENCRYPTION_KEY must be a valid Fernet key"
        ) from exc


def encrypt_secret(value: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError("Secret must be a non-empty string")
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError("Encrypted secret is missing")
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, UnicodeDecodeError) as exc:
        raise CredentialEncryptionUnavailable(
            "Could not decrypt exchange credentials; check EXCHANGE_ENCRYPTION_KEY"
        ) from exc
