from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.enums import BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory, NavHistory, Scheme
from app.services.analytics.risk_metrics import years_ago
from app.services.dashboard.allocation_labels import asset_class_bucket
from app.services.fund_page.benchmark_select import benchmark_for
from app.services.fund_page.performance import latest_nav_date
from app.services.fund_page.risk_bands import band_for
from app.services.fund_page.schemas import RiskMetricOut, RiskResponse, Unavailable, plain

PriceRow = tuple[date, Decimal]


def daily_returns(rows: list[PriceRow]) -> list[Decimal]:
    result: list[Decimal] = []
    for previous, current in zip(rows, rows[1:]):
        if previous[1] > 0:
            result.append(current[1] / previous[1] - Decimal("1"))
    return result


def sample_std(values: list[Decimal]) -> Decimal:
    if len(values) < 2:
        return Decimal("0")
    mean = sum(values, Decimal("0")) / Decimal(len(values))
    variance = sum(((value - mean) ** 2 for value in values), Decimal("0")) / Decimal(
        len(values) - 1
    )
    return variance.sqrt()


def max_drawdown(rows: list[PriceRow]) -> Decimal:
    if not rows:
        return Decimal("0")
    peak = rows[0][1]
    worst = Decimal("0")
    for _row_date, value in rows:
        if value > peak:
            peak = value
        if peak > 0:
            drawdown = (value / peak - Decimal("1")) * Decimal("100")
            if drawdown < worst:
                worst = drawdown
    return worst


def cagr(rows: list[PriceRow]) -> Decimal | None:
    if len(rows) < 2 or rows[0][1] <= 0:
        return None
    days = (rows[-1][0] - rows[0][0]).days
    if days <= 0:
        return None
    return (rows[-1][1] / rows[0][1]) ** (
        Decimal("365") / Decimal(days)
    ) - Decimal("1")


def beta(fund_values: list[Decimal], benchmark_values: list[Decimal]) -> Decimal | None:
    if len(fund_values) != len(benchmark_values) or len(fund_values) < 2:
        return None
    fund_mean = sum(fund_values, Decimal("0")) / Decimal(len(fund_values))
    benchmark_mean = sum(benchmark_values, Decimal("0")) / Decimal(
        len(benchmark_values)
    )
    covariance = sum(
        (
            (fund_value - fund_mean) * (benchmark_value - benchmark_mean)
            for fund_value, benchmark_value in zip(fund_values, benchmark_values)
        ),
        Decimal("0"),
    )
    benchmark_variance = sum(
        ((value - benchmark_mean) ** 2 for value in benchmark_values),
        Decimal("0"),
    )
    if benchmark_variance == 0:
        return None
    return covariance / benchmark_variance


def _fund_rows(
    db: Session,
    scheme_id: uuid.UUID,
    start: date,
    end: date,
) -> list[PriceRow]:
    return list(
        db.execute(
            select(NavHistory.date, NavHistory.nav)
            .where(
                NavHistory.scheme_id == scheme_id,
                NavHistory.date >= start,
                NavHistory.date <= end,
            )
            .order_by(NavHistory.date)
        ).all()
    )


def _first_nav_date(db: Session, scheme_id: uuid.UUID, end: date) -> date | None:
    row = db.execute(
        select(NavHistory.date)
        .where(NavHistory.scheme_id == scheme_id, NavHistory.date <= end)
        .order_by(NavHistory.date)
        .limit(1)
    ).first()
    return row[0] if row is not None else None


def _metric(metric: str, value: Decimal | None, fund_class: str) -> RiskMetricOut:
    if value is None:
        return RiskMetricOut(value=None, band=None, tone=None)
    band = band_for(metric, value, fund_class)
    return RiskMetricOut(
        value=plain(value, 4),
        band=band[0] if band is not None else None,
        tone=band[1] if band is not None else None,
    )


def _shared_beta(
    db: Session,
    scheme: Scheme,
    rows: list[PriceRow],
    start: date,
    end: date,
) -> tuple[Decimal | None, str | None]:
    index = benchmark_for(scheme)
    if index is None:
        return None, "no_benchmark"
    benchmark_rows = db.execute(
        select(BenchmarkIndexHistory.date, BenchmarkIndexHistory.value)
        .where(
            BenchmarkIndexHistory.index_name == index,
            BenchmarkIndexHistory.return_type == BenchmarkReturnType.TRI,
            BenchmarkIndexHistory.date >= start,
            BenchmarkIndexHistory.date <= end,
        )
        .order_by(BenchmarkIndexHistory.date)
    ).all()
    fund_by_date = dict(rows)
    benchmark_by_date = dict(benchmark_rows)
    shared_dates = sorted(set(fund_by_date) & set(benchmark_by_date))
    if len(shared_dates) < 120:
        return None, "insufficient_shared_dates"
    fund_shared = [(day, fund_by_date[day]) for day in shared_dates]
    benchmark_shared = [(day, benchmark_by_date[day]) for day in shared_dates]
    value = beta(daily_returns(fund_shared), daily_returns(benchmark_shared))
    return (
        (value, None)
        if value is not None
        else (None, "insufficient_shared_dates")
    )


def compute_risk(
    db: Session,
    scheme: Scheme,
    today: date,
) -> RiskResponse | Unavailable:
    if scheme.amfi_code is None:
        return Unavailable(reason="no_history")
    end = latest_nav_date(db, scheme, today)
    if end is None:
        return Unavailable(reason="no_history")
    first = _first_nav_date(db, scheme.id, end)
    if first is None or (end - first).days < 365:
        return Unavailable(reason="no_history")

    requested_start = years_ago(end, 3)
    life_window = first > requested_start
    start = first if life_window else requested_start
    rows = _fund_rows(db, scheme.id, start, end)
    returns = daily_returns(rows)
    volatility_fraction = sample_std(returns) * Decimal("252").sqrt()
    volatility = volatility_fraction * Decimal("100")
    drawdown = max_drawdown(rows)
    annual_return = cagr(rows)
    sharpe = (
        None
        if annual_return is None or volatility_fraction == 0
        else (annual_return - settings.risk_free_rate) / volatility_fraction
    )
    beta_value, beta_reason = _shared_beta(db, scheme, rows, start, end)
    fund_class = asset_class_bucket(scheme.sebi_category)

    return RiskResponse(
        scheme_id=str(scheme.id),
        window_start=start,
        window_end=end,
        points=len(returns),
        life_window=life_window,
        risk_free_rate=format(settings.risk_free_rate, "f"),
        volatility=_metric("volatility", volatility, fund_class),
        max_drawdown=_metric("max_drawdown", drawdown, fund_class),
        sharpe=_metric("sharpe", sharpe, fund_class),
        beta=_metric("beta", beta_value, fund_class),
        beta_reason=beta_reason,
    )
