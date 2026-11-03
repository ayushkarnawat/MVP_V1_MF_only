from __future__ import annotations

from app.models.enums import BenchmarkIndex
from app.models.reference import Scheme
from app.services.analytics.benchmark import _benchmark_index_for_category
from app.services.dashboard.allocation_labels import asset_class_bucket
from app.services.analytics.benchmark_registry import INDICES, index_label

BENCHMARK_LABELS: dict[str, str] = {spec.key: index_label(spec.key) for spec in INDICES}


def benchmark_for(scheme: Scheme) -> BenchmarkIndex | None:
    if asset_class_bucket(scheme.sebi_category) != "Equity":
        return None
    return _benchmark_index_for_category(scheme.sebi_category)


import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.reference import SchemeBenchmark, BenchmarkIndexMaster
from app.services.analytics.benchmark_selection import BenchmarkChoice, choose_benchmark  # noqa: F401  (BenchmarkChoice is re-exported)


def benchmark_choices(db: Session, schemes: dict[uuid.UUID, Scheme]) -> dict[uuid.UUID, BenchmarkChoice]:
    """One metadata batch. Never selects any printed-return column.

    Only gathers inputs; the order (factsheet, closest, category, none) and the label are
    decided by `choose_benchmark` in analytics/benchmark_selection.py."""
    from app.services.analytics.benchmark_windows import ist_today
    if not schemes:
        return {}
    rows = {r.scheme_id: r for r in db.execute(select(
        SchemeBenchmark.scheme_id, SchemeBenchmark.declared_benchmark_name,
        SchemeBenchmark.mapped_index_key, SchemeBenchmark.tracked_index_key,
        SchemeBenchmark.match_quality, SchemeBenchmark.tracked_match_quality, SchemeBenchmark.verified_on,
    ).where(SchemeBenchmark.scheme_id.in_(schemes))).all()}
    active = {s.key: s.active for s in INDICES}
    labels = {s.key: index_label(s.key) for s in INDICES}
    for key, name, enabled in db.execute(select(BenchmarkIndexMaster.key, BenchmarkIndexMaster.nse_name, BenchmarkIndexMaster.active)):
        active[key], labels[key] = enabled, name
    result = {}
    for sid, scheme in schemes.items():
        row = rows.get(sid)
        result[sid] = choose_benchmark(
            category=scheme.sebi_category, scheme_name=scheme.name,
            declared=row.declared_benchmark_name if row else None,
            mapped_key=row.mapped_index_key if row else None, mapped_quality=row.match_quality if row else None,
            tracked_key=row.tracked_index_key if row else None,
            tracked_quality=row.tracked_match_quality if row else None,
            age=max(0, (ist_today() - row.verified_on).days) if row else None,
            is_active=lambda key: active.get(key, False), label_of=lambda key: labels.get(key, key),
        )
    return result


def benchmark_for_scheme(db: Session, scheme_id: uuid.UUID) -> BenchmarkChoice:
    scheme = db.get(Scheme, scheme_id)
    return benchmark_choices(db, {scheme_id: scheme})[scheme_id] if scheme else BenchmarkChoice(None, "none")
