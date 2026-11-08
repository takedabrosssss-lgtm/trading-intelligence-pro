"""PostgreSQL advisory locks shared by overlapping Render instances."""
from sqlalchemy import text

from app.database import engine


def acquire_advisory_lock(lock_id: int):
    """Return a held SQLAlchemy connection, or None if another instance owns the lock."""
    connection = engine.connect()
    if engine.dialect.name != "postgresql":
        # Local SQLite development remains usable; Render production uses PostgreSQL.
        return connection

    try:
        acquired = connection.execute(
            text("SELECT pg_try_advisory_lock(:lock_id)"),
            {"lock_id": lock_id},
        ).scalar()
    except Exception:
        connection.close()
        raise

    if not acquired:
        connection.close()
        return None
    return connection


def release_advisory_lock(connection, lock_id: int) -> None:
    if connection is None:
        return
    try:
        if engine.dialect.name == "postgresql":
            connection.execute(
                text("SELECT pg_advisory_unlock(:lock_id)"),
                {"lock_id": lock_id},
            )
    finally:
        connection.close()
