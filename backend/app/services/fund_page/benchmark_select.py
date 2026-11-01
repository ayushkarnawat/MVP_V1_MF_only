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


from dataclasses import dataclass
from datetime import date
import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.reference import SchemeBenchmark, BenchmarkIndexMaster
from app.services.analytics.benchmark_notes import benchmark_note
from app.services.analytics.benchmark_names import normalise_benchmark_name


@dataclass(frozen=True)
class BenchmarkChoice:
    index_key: str | None
    source: str
    declared_name: str | None = None
    window_start_note: str | None = None
    mapping_age_days: int | None = None


def benchmark_choices(db: Session, schemes: dict[uuid.UUID, Scheme]) -> dict[uuid.UUID, BenchmarkChoice]:
    """One metadata batch. Never selects any printed-return column."""
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
        declared = row.declared_benchmark_name if row else None
        age = max(0, (ist_today() - row.verified_on).days) if row else None
        key = (row.tracked_index_key or row.mapped_index_key) if row else None
        if key and active.get(key, False):
            quality = (row.tracked_match_quality or row.match_quality) if row.tracked_index_key else row.match_quality
            source = "closest" if quality == "proxy" else "factsheet"
            note = benchmark_note("benchmark_note_closest", index=labels[key]) if source == "closest" else None
            result[sid] = BenchmarkChoice(key, source, declared, note, age)
            continue
        category = scheme.sebi_category.lower()
        equity = asset_class_bucket(scheme.sebi_category) == "Equity"
        if not equity:
            result[sid] = BenchmarkChoice(None, "none", declared, None, age)
            continue
        if "small" in category:
            key = "nifty_smallcap_250"
        elif "large" in category and "mid" not in category:
            key = "nifty_100"
        else:
            key = _benchmark_index_for_category(scheme.sebi_category).value
        if not active.get(key, False):
            result[sid] = BenchmarkChoice(None, "none", declared, None, age)
            continue
        note = benchmark_note("benchmark_note_closest", index=labels[key])
        match = normalise_benchmark_name(declared) if declared else None
        if match and match.blend:
            import re
            weights = ", ".join(f"{weight}% {re.sub(r'(?i)total returns? index|\bTRI\b', '', name).strip()}" for name, weight in match.blend)
            note = benchmark_note("benchmark_note_mix", weights=weights)
        result[sid] = BenchmarkChoice(key, "closest" if declared else "category", declared, note, age)
    return result


def benchmark_for_scheme(db: Session, scheme_id: uuid.UUID) -> BenchmarkChoice:
    scheme = db.get(Scheme, scheme_id)
    return benchmark_choices(db, {scheme_id: scheme})[scheme_id] if scheme else BenchmarkChoice(None, "none")
