
import os
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker


def normalize_database_url(url):
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


DATABASE_URL = normalize_database_url(
    os.getenv("DATABASE_URL", "sqlite:///./trading_intelligence.db")
)

engine_options = {}

if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    **engine_options,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(String(32), unique=True, index=True, nullable=False)
    username = Column(String(100), nullable=True)
    first_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class PaperAccount(Base):
    __tablename__ = "paper_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    strategy = Column(String(50), nullable=False)

    balance = Column(Float, default=2500.0, nullable=False)
    initial_balance = Column(Float, default=2500.0, nullable=False)

    max_drawdown = Column(Float, default=0.10, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now)

    positions = relationship("Position", back_populates="account")


class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, index=True)

    symbol = Column(String(30), nullable=False, index=True)
    market = Column(String(30), default="crypto")
    timeframe = Column(String(10), nullable=False)

    direction = Column(String(10), nullable=False)
    grade = Column(String(5), nullable=True)
    score = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)

    entry_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)

    strategy = Column(String(50), nullable=True)
    reasoning = Column(Text, nullable=True)
    indicators = Column(JSON, nullable=True)

    status = Column(String(30), default="new", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)

    account_id = Column(
        Integer,
        ForeignKey("paper_accounts.id"),
        nullable=False,
    )
    signal_id = Column(
        Integer,
        ForeignKey("signals.id"),
        nullable=True,
    )

    symbol = Column(String(30), nullable=False)
    direction = Column(String(10), nullable=False)

    entry_price = Column(Float, nullable=False)
    current_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)

    quantity = Column(Float, default=0.0, nullable=False)
    unrealized_pnl = Column(Float, default=0.0, nullable=False)
    realized_pnl = Column(Float, default=0.0, nullable=False)

    status = Column(String(20), default="open", nullable=False)
    opened_at = Column(DateTime(timezone=True), default=utc_now)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    account = relationship("PaperAccount", back_populates="positions")


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)

    account_id = Column(
        Integer,
        ForeignKey("paper_accounts.id"),
        nullable=True,
    )
    position_id = Column(
        Integer,
        ForeignKey("positions.id"),
        nullable=True,
    )

    symbol = Column(String(30), nullable=False)
    direction = Column(String(10), nullable=False)
    strategy = Column(String(50), nullable=True)

    entry_price = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)
    quantity = Column(Float, default=0.0)

    gross_pnl = Column(Float, default=0.0)
    fees = Column(Float, default=0.0)
    net_pnl = Column(Float, default=0.0)

    exit_reason = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    closed_at = Column(DateTime(timezone=True), nullable=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now)


Index("ix_signals_symbol_created", Signal.symbol, Signal.created_at)
Index("ix_positions_account_status", Position.account_id, Position.status)


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        
