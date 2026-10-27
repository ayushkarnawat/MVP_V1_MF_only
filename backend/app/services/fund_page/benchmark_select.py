from __future__ import annotations

from app.models.enums import BenchmarkIndex
from app.models.reference import Scheme
from app.services.analytics.benchmark import _benchmark_index_for_category
from app.services.dashboard.allocation_labels import asset_class_bucket
from app.services.home.benchmarks import HOME_BENCHMARKS

BENCHMARK_LABELS: dict[BenchmarkIndex, str] = {option.index: option.label for option in HOME_BENCHMARKS}


def benchmark_for(scheme: Scheme) -> BenchmarkIndex | None:
    if asset_class_bucket(scheme.sebi_category) != "Equity":
        return None
    return _benchmark_index_for_category(scheme.sebi_category)
