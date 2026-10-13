import uuid
from datetime import date
from decimal import Decimal

from app.models.enums import DisclosureBatchStatus as Status, AssetType
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding
from app.services.analytics import portfolio_disclosure_retention as retention


def test_prune_calendar_months_newest_written_and_holdings(db_session):
    schemes = [Scheme(id=uuid.uuid4(), name=name, amc_name='Test', sebi_category='Debt')
               for name in ('Monthly', 'Taurus', 'Waiting')]
    db_session.add_all(schemes)
    db_session.flush()
    def add(scheme, day, status=Status.WRITTEN):
        batch = DisclosureBatch(scheme_id=scheme.id, as_of_date=day, amc_name='Test', status=status)
        db_session.add(batch)
        db_session.flush()
        db_session.add(SchemeHolding(batch_id=batch.id, instrument_name='Cash', asset_type=AssetType.CASH_EQUIVALENT,
                                    market_value=Decimal(10), pct_to_nav=Decimal(100)))
    for month, last in [(4,30),(5,31),(6,30),(7,31),(8,31),(9,30)]:
        add(schemes[0],date(2026,month,last))
    add(schemes[0],date(2026,8,15))
    add(schemes[1],date(2026,3,31))
    add(schemes[2],date(2026,6,30),Status.AWAITING_MANUAL_UPLOAD)
    add(schemes[2],date(2026,9,30),Status.AWAITING_MANUAL_UPLOAD)
    db_session.flush()
    assert retention.prune_old_batches(db_session,date(2026,10,14)) == 4
    assert db_session.query(DisclosureBatch).count() == 6
    assert db_session.query(SchemeHolding).count() == 6
    assert db_session.query(DisclosureBatch).filter_by(scheme_id=schemes[0].id,as_of_date=date(2026,7,31)).one()
    assert db_session.query(DisclosureBatch).filter_by(scheme_id=schemes[1].id).one().as_of_date == date(2026,3,31)
    assert retention.prune_old_batches(db_session,date(2026,10,14)) == 0


def test_archive_unset_never_creates_client(monkeypatch):
    monkeypatch.delenv('PORTFOLIO_DISCLOSURE_ARCHIVE_BUCKET',raising=False)
    monkeypatch.setattr(retention.boto3,'client',lambda *a,**k: (_ for _ in ()).throw(AssertionError('network')))
    assert retention.archive_failed_file(b'abc','AMC',date(2026,9,30),'file.xls') is None


def test_archive_key_body_and_failure_swallowed(monkeypatch,caplog):
    monkeypatch.setenv('PORTFOLIO_DISCLOSURE_ARCHIVE_BUCKET','private-test')
    calls=[]
    class S3:
        def put_object(self,**kwargs):
            calls.append(kwargs)
    monkeypatch.setattr(retention.boto3,'client',lambda name: S3())
    assert retention.archive_failed_file(b'abc','JM Financial Mutual Fund',date(2026,9,30),'../file.xls') == 's3://private-test/failed/2026/09/jm-financial-mutual-fund/file.xls'
    assert calls == [{'Bucket':'private-test','Key':'failed/2026/09/jm-financial-mutual-fund/file.xls','Body':b'abc'}]
    monkeypatch.setattr(S3,'put_object',lambda *a,**k: (_ for _ in ()).throw(RuntimeError('S3 down')))
    assert retention.archive_failed_file(b'abc','AMC',date(2026,9,30),'file.xls') is None
    assert 'S3 down' in caplog.text
def test_prune_sparse_history_preserves_old_written_with_new_failed(db_session):
    scheme=Scheme(id=uuid.uuid4(),name='Sparse',amc_name='Test',sebi_category='Debt')
    db_session.add(scheme)
    db_session.flush()
    for disclosed,status in [(date(2026,3,31),Status.WRITTEN),
                             (date(2026,6,30),Status.FAILED),
                             (date(2026,7,31),Status.FAILED),
                             (date(2026,9,30),Status.FAILED)]:
        db_session.add(DisclosureBatch(scheme_id=scheme.id,amc_name='Test',as_of_date=disclosed,status=status))
    db_session.flush()
    assert retention.prune_old_batches(db_session,date(2027,1,10))==1
    assert {b.as_of_date for b in db_session.query(DisclosureBatch)} == {
        date(2026,3,31),date(2026,7,31),date(2026,9,30)}
def test_run4c_future_batch_never_defines_prune_cutoff(db_session):
    scheme=Scheme(id=uuid.uuid4(),name='History',amc_name='Test',sebi_category='Debt')
    db_session.add(scheme);db_session.flush()
    for day in [date(2026,7,31),date(2026,8,31),date(2026,9,30),date(2030,9,30)]:
        db_session.add(DisclosureBatch(scheme_id=scheme.id,amc_name='Test',as_of_date=day,status=Status.WRITTEN))
    db_session.flush()
    assert retention.prune_old_batches(db_session,date(2026,10,14))==0
    assert db_session.query(DisclosureBatch).count()==4
