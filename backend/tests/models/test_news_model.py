import uuid
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.news import NewsItem
from app.models.reference import StockMaster


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[NewsItem.__table__, StockMaster.__table__])
    return sessionmaker(bind=engine)()


def _item(**overrides):
    now = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)
    defaults = dict(
        id=uuid.uuid4(),
        source="Moneycontrol",
        title="HDFC Bank Q2 profit rises 11%",
        url="https://www.moneycontrol.com/news/example.html",
        published_at=now,
        ingested_at=now,
        tier=1,
        entity_tags=[{"kind": "stock", "key": "INE040A01034", "label": "HDFC Bank", "tier": 1}],
    )
    defaults.update(overrides)
    return NewsItem(**defaults)


def test_entity_tags_round_trip_as_list_of_dicts():
    db = _session()
    db.add(_item())
    db.commit()

    fetched = db.query(NewsItem).one()
    assert fetched.entity_tags == [{"kind": "stock", "key": "INE040A01034", "label": "HDFC Bank", "tier": 1}]


def test_duplicate_url_raises_integrity_error():
    db = _session()
    db.add(_item(url="https://www.moneycontrol.com/news/dup.html"))
    db.commit()
    db.add(_item(id=uuid.uuid4(), url="https://www.moneycontrol.com/news/dup.html"))
    with pytest.raises(IntegrityError):
        db.commit()


@pytest.mark.parametrize("bad_tier", [0, 8])
def test_tier_out_of_range_raises(bad_tier):
    db = _session()
    db.add(_item(tier=bad_tier, url=f"https://www.moneycontrol.com/news/tier-{bad_tier}.html"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_stock_master_nse_symbol_defaults_to_none():
    db = _session()
    stock = StockMaster(
        isin="INE040A01034", name="HDFC Bank", as_of_date=date(2026, 10, 1), source="test",
    )
    db.add(stock)
    db.commit()

    fetched = db.query(StockMaster).one()
    assert fetched.nse_symbol is None
