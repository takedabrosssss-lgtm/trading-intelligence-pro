
from contextlib import contextmanager

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
    func,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from app.config import settings


def normalize_database_url(url: str) -> str:
    """Normalize database URLs supplied by hosting providers."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


DATABASE_URL = normalize_database_url(settings.DATABASE_URL)

engine_options = {
    "pool_pre_ping": True,
}

if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(String(64), unique=True, nullable=False, index=True)
    username = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PaperAccount(Base):
    __tablename__ = "paper_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    strategy = Column(String(50), nullable=False, index=True)

    initial_balance = Column(Float, nullable=False, default=2500.0)
    balance = Column(Float, nullable=False, default=2500.0)
    equity = Column(Float, nullable=False, default=2500.0)

    max_drawdown = Column(Float, nullable=False, default=0.10)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    market = Column(String(50), nullable=True, index=True)
    timeframe = Column(String(20), nullable=True)

    direction = Column(String(10), nullable=False)
    grade = Column(String(5), nullable=True, index=True)
    confidence_score = Column(Float, nullable=True)

    entry_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)

    strategy = Column(String(50), nullable=True)
    reasoning = Column(Text, nullable=True)
    indicators = Column(JSON, nullable=True)

    status = Column(String(30), default="new", nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(
        Integer,
        ForeignKey("paper_accounts.id"),
        nullable=False,
        index=True,
    )
    signal_id = Column(
        Integer,
        ForeignKey("signals.id"),
        nullable=True,
    )

    symbol = Column(String(50), nullable=False, index=True)
    market = Column(String(50), nullable=True)
    direction = Column(String(10), nullable=False)

    quantity = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=False)
    current_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)

    unrealized_pnl = Column(Float, default=0.0, nullable=False)
    status = Column(String(20), default="open", nullable=False, index=True)

    opened_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)

    account = relationship("PaperAccount")


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(
        Integer,
        ForeignKey("paper_accounts.id"),
        nullable=False,
        index=True,
    )
    position_id = Column(
        Integer,
        ForeignKey("positions.id"),
        nullable=True,
    )

    symbol = Column(String(50), nullable=False, index=True)
    direction = Column(String(10), nullable=False)

    quantity = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=False)

    gross_pnl = Column(Float, nullable=False, default=0.0)
    fees = Column(Float, nullable=False, default=0.0)
    net_pnl = Column(Float, nullable=False, default=0.0)

    strategy = Column(String(50), nullable=True)
    exit_reason = Column(String(100), nullable=True)

    opened_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), server_default=func.now())


class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(JSON, nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


Index("ix_signals_symbol_created", Signal.symbol, Signal.created_at)
Index("ix_positions_account_status", Position.account_id, Position.status)


def init_db():
    """Create database tables if they do not exist."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI-compatible database dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope():
    """Provide a transactional database session."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        
