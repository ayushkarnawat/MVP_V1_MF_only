import asyncio
import uuid
from unittest.mock import patch
import pytest
from app.models.reference import Scheme
from app.models.enums import SchemeSource, SchemePlanType
from app.services.analytics.scheme_universe import UniverseRow
from app.services.analytics.scheme_master import refresh_scheme_master, MasterRefreshAborted, plan_type_for
from tests.services.analytics.test_scheme_universe import NAVALL_8


def test_refresh_inserts_updates_and_deactivates(db_session):
    db_session.add(Scheme(id=uuid.uuid4(), amfi_code="999999", name="Gone Fund", amc_name="A",
                          sebi_category="E", source=SchemeSource.AMFI))
    db_session.add(Scheme(id=uuid.uuid4(), amfi_code=None, name="Closed CAS fund", amc_name="A",
                          sebi_category="E", source=SchemeSource.CAS_ONLY, is_active=False))
    db_session.commit()
    with patch("app.services.analytics.scheme_master.MIN_ROWS", 1):
        result = asyncio.run(refresh_scheme_master(db_session, NAVALL_8))
    assert result.inserted == 2 and result.deactivated == 1
    direct = db_session.query(Scheme).filter_by(amfi_code="140228").one()
    assert direct.plan_type == SchemePlanType.DIRECT and direct.base_name == "Edelweiss Mid Cap Fund"
    assert db_session.query(Scheme).filter_by(amfi_code="999999").one().is_active is False
    assert db_session.query(Scheme).filter_by(source=SchemeSource.CAS_ONLY).count() == 1


def test_refresh_aborts_on_tiny_file(db_session):
    db_session.add(Scheme(id=uuid.uuid4(), amfi_code="999999", name="Live", amc_name="A", sebi_category="E"))
    db_session.commit()
    with pytest.raises(MasterRefreshAborted):
        asyncio.run(refresh_scheme_master(db_session, NAVALL_8))     # 2 rows < MIN_ROWS
    assert db_session.query(Scheme).filter_by(amfi_code="999999").one().is_active is True


def test_plan_type_from_name_when_plan_column_blank():
    row = UniverseRow(amfi_code="1", isin=None, isin_reinvest=None, name="DSP Small Cap Fund - Dir - Growth",
                      base_name=None, plan=None, amc_name="DSP", sebi_category="E", nav=None, nav_date=None)
    assert plan_type_for(row) == SchemePlanType.DIRECT


def test_refresh_updates_once_and_preserves_casparser_rows(db_session):
    db_session.add(Scheme(amfi_code="140228", name="Old name", amc_name="A", sebi_category="E"))
    db_session.add(Scheme(amfi_code="140225", name="Protected", amc_name="A", sebi_category="E", source=SchemeSource.CASPARSER))
    db_session.commit()
    with patch("app.services.analytics.scheme_master.MIN_ROWS", 1):
        first = asyncio.run(refresh_scheme_master(db_session, NAVALL_8))
        second = asyncio.run(refresh_scheme_master(db_session, NAVALL_8))
    assert first.updated == 1 and first.inserted == 0
    assert second.updated == second.inserted == 0
    assert db_session.query(Scheme).filter_by(amfi_code="140225").one().name == "Protected"


def test_refresh_rolls_back_partial_writes(db_session, monkeypatch):
    db_session.add(Scheme(amfi_code="999999", name="Live", amc_name="A", sebi_category="E"))
    db_session.commit()

    def fail(*args, **kwargs):
        raise RuntimeError("write failed")

    monkeypatch.setattr(db_session, "bulk_update_mappings", fail)
    with patch("app.services.analytics.scheme_master.MIN_ROWS", 1), pytest.raises(RuntimeError):
        asyncio.run(refresh_scheme_master(db_session, NAVALL_8))
    assert db_session.query(Scheme).count() == 1
    assert db_session.query(Scheme).one().is_active is True
