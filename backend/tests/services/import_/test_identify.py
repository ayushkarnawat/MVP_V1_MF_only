import asyncio
import uuid
from datetime import date
from decimal import Decimal
import pytest
from app.models.reference import Scheme
from app.models.enums import SchemeSource, SchemePlanType
from app.services.import_.parser import ParsedScheme
from app.services.import_.identify import identify_scheme



def _master(db, code, isin, name, base, plan, amc="Edelweiss Mutual Fund"):
    s = Scheme(id=uuid.uuid4(), amfi_code=code, isin=isin, name=name, base_name=base, plan_type=plan,
               amc_name=amc, sebi_category="Equity Scheme - Mid Cap Fund", source=SchemeSource.AMFI)
    db.add(s); db.flush(); return s


def _cas(isin, nav, close="100", amfi=None, name="Edelweiss Mid Cap Fund - Direct Plan - Growth", amc="Edelweiss Mutual Fund"):
    return ParsedScheme(name=name, isin=isin, amfi=amfi, scheme_type="EQUITY", folio="1/1", amc=amc, transaction_count=0,
                        close_units=Decimal(close), valuation_nav=Decimal(nav), valuation_date=date(2026, 10, 5))


def _series(table):
    async def fetch(code):
        return table.get(code)
    return fetch


DAY = date(2026, 10, 5)


def test_isin_and_nav_verified(db_session):
    async def run():
        _master(db_session, "140228", "INF754K01KO2", "Edelweiss Mid Cap Fund - Direct Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
        ident = await identify_scheme(db_session, _cas("INF754K01KO2", "128.3011"), _series({"140228": [(DAY, Decimal("128.3011"))]}))
        assert (ident.status, ident.amfi_code, ident.plan_type, ident.plan_verified, ident.identified_by) == \
            ("verified", "140228", "direct", True, "isin")
        assert ident.nav_matched is True

    asyncio.run(run())


def test_isin_match_survives_nav_outage(db_session):
    async def run():
        _master(db_session, "140228", "INF754K01KO2", "Edelweiss Mid Cap Fund - Direct Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
        ident = await identify_scheme(db_session, _cas("INF754K01KO2", "128.3011"), _series({}))
        assert ident.status == "verified" and ident.identified_by == "isin"
        assert ident.nav_matched is None

    asyncio.run(run())


def test_wrong_casparser_code_is_corrected_by_nav(db_session):
    async def run():
        _master(db_session, "140228", None, "Edelweiss Mid Cap Fund - Direct Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
        _master(db_session, "140225", None, "Edelweiss Mid Cap Fund - Regular Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.REGULAR)
        series = _series({"140228": [(DAY, Decimal("128.3011"))], "140225": [(DAY, Decimal("108.5602"))]})
        ident = await identify_scheme(db_session, _cas(None, "108.5602", amfi="140228"), series)
        assert ident.amfi_code == "140225" and ident.identified_by == "sibling_nav" and ident.plan_type == "regular"

    asyncio.run(run())


def test_unknown_isin_with_zero_units_is_closed_fund(db_session):
    async def run():
        ident = await identify_scheme(db_session, _cas("INF999X01ZZ9", "10", close="0", name="HDFC Old Small Cap - Dir"), _series({}))
        assert ident.status == "closed" and ident.scheme_id is None and ident.plan_type == "direct"

    asyncio.run(run())


def test_unknown_isin_with_units_and_nothing_to_offer_is_unlisted(db_session):
    # Decided 6 Oct: a held fund in no master imports as an unlisted fund,
    # valued at the statement's NAV, instead of asking a question with no answers.
    async def run():
        ident = await identify_scheme(db_session, _cas("INF999X01ZZ9", "10", close="5"), _series({}))
        assert ident.status == "unlisted" and ident.scheme_id is None and ident.candidates == []

    asyncio.run(run())


def test_unknown_isin_with_units_and_a_candidate_asks(db_session):
    async def run():
        _master(db_session, "140228", "INF754K01KO2", "Edelweiss Mid Cap Fund - Direct Plan - Growth",
                "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
        ident = await identify_scheme(db_session, _cas("INF999X01ZZ9", "10", close="5"), _series({}))
        assert ident.status == "ask" and ident.candidates == [("140228", "Edelweiss Mid Cap Fund - Direct Plan - Growth")]

    asyncio.run(run())


def test_adviser_code_never_decides_plan(db_session):
    async def run():
        # ParsedScheme.arn_code set; plan still from the master
        _master(db_session, "140228", "INF754K01KO2", "Edelweiss Mid Cap Fund - Direct Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
        cas = _cas("INF754K01KO2", "128.3011"); cas.arn_code = "INA000012345"
        ident = await identify_scheme(db_session, cas, _series({"140228": [(DAY, Decimal("128.3011"))]}))
        assert ident.plan_type == "direct" and ident.plan_verified

    asyncio.run(run())


def test_neither_word_no_sibling_is_regular_unverified(db_session):
    async def run():
        _master(db_session, "100100", "INF100A01AA1", "Old Plan Fund - Growth", "Old Plan Fund", None, amc="HDFC Mutual Fund")
        ident = await identify_scheme(db_session, _cas("INF100A01AA1", "50", name="Old Plan Fund - Growth", amc="HDFC Mutual Fund"),
                                      _series({"100100": [(DAY, Decimal("50"))]}))
        assert ident.plan_type == "regular" and ident.plan_verified is False

    asyncio.run(run())


def _blank_plan_master(db):
    # AMFI's live file leaves Plan/Option blank for some funds, e.g. all four
    # Motilal Oswal Midcap Fund rows (8 Oct): no plan type, no plan word.
    return _master(db, "127042", "INF247L01445", "Motilal Oswal Midcap Fund", "Motilal Oswal Midcap Fund", None,
                   amc="Motilal Oswal Mutual Fund")


@pytest.mark.parametrize("plan", ["direct", "regular"])
def test_blank_amfi_plan_takes_the_plan_named_on_the_statement(db_session, plan):
    async def run():
        _blank_plan_master(db_session)
        cas = _cas("INF247L01445", "116.4021", name=f"Motilal Oswal Midcap Fund - {plan.title()} Plan - Growth",
                   amc="Motilal Oswal Mutual Fund")
        cas.plan_type = plan
        ident = await identify_scheme(db_session, cas, _series({"127042": [(DAY, Decimal("116.4021"))]}))
        assert (ident.plan_type, ident.plan_verified) == (plan, True)

    asyncio.run(run())


def test_blank_amfi_plan_and_unclear_statement_stays_unverified(db_session):
    # "unclassified" covers both a statement name without a plan word and a
    # Direct name on a folio with a distributor code (FR-5): never guess.
    async def run():
        _blank_plan_master(db_session)
        cas = _cas("INF247L01445", "116.4021", name="Motilal Oswal Midcap Fund - Direct Plan - Growth",
                   amc="Motilal Oswal Mutual Fund")
        cas.plan_type = "unclassified"
        ident = await identify_scheme(db_session, cas, _series({"127042": [(DAY, Decimal("116.4021"))]}))
        assert (ident.plan_type, ident.plan_verified) == ("regular", False)

    asyncio.run(run())


def test_franklin_main_and_segregated_resolve_separately(db_session):
    async def run():
        main = _master(db_session, "118530", "INF090I01HG7", "Franklin India Low Duration Fund - Growth", "Franklin India Low Duration Fund", SchemePlanType.REGULAR, amc="Franklin Templeton Mutual Fund")
        side = _master(db_session, "147989", "INF090I01UD7", "Franklin India Low Duration Fund - Segregated Portfolio 1", "Franklin India Low Duration Fund", SchemePlanType.REGULAR, amc="Franklin Templeton Mutual Fund")
        a = await identify_scheme(db_session, _cas("INF090I01HG7", "10", amfi="118530", amc=main.amc_name), _series({}))
        b = await identify_scheme(db_session, _cas("INF090I01UD7", "0", close="0", amfi="118530", amc=main.amc_name), _series({}))
        assert a.scheme_id == main.id and b.scheme_id == side.id
        assert a.scheme_id != b.scheme_id

    asyncio.run(run())


def test_unifund_never_borrows_other_amc_scheme(db_session):
    async def run():
        _master(db_session, "100100", "INF_UTI", "UTI Small Cap Fund - Growth", "UTI Small Cap Fund", SchemePlanType.REGULAR, amc="UTI Mutual Fund")
        cas = _cas("INF_UNIFUND", "10", close="0", amfi="100100", name="Unifund Small Cap Fund - Growth", amc="Unifund Mutual Fund")
        ident = await identify_scheme(db_session, cas, _series({"100100": [(DAY, Decimal("20"))]}))
        assert ident.status == "closed" and ident.scheme_id is None and ident.name == cas.name

    asyncio.run(run())




def test_cas_only_identity_stays_closed_on_reupload(db_session):
    db_session.add(Scheme(amfi_code=None, isin="INF_UNIFUND", name="Unifund Small Cap Fund - Growth",
                          amc_name="Unifund Mutual Fund", sebi_category="EQUITY", source=SchemeSource.CAS_ONLY,
                          is_active=False, plan_type=SchemePlanType.DIRECT))
    db_session.flush()
    cas = _cas("INF_UNIFUND", "0", close="0", name="Unifund Small Cap Fund - Growth", amc="Unifund Mutual Fund")
    ident = asyncio.run(identify_scheme(db_session, cas, _series({})))
    assert ident.status == "closed" and ident.amfi_code is None


def test_isin_hit_is_verified_despite_nav_mismatch(db_session):
    master = _master(db_session, "140228", "INF754K01KO2", "Edelweiss Mid Cap Fund - Direct Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
    ident = asyncio.run(identify_scheme(db_session, _cas(master.isin, "128.3011"),
                           _series({"140228": [(DAY, Decimal("120"))]})))
    assert (ident.status, ident.scheme_id, ident.identified_by) == ("verified", master.id, "isin")
    assert ident.nav_matched is False
