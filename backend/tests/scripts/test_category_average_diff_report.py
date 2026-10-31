from decimal import Decimal
import importlib.util
from pathlib import Path
import uuid


def test_comparison_reports_only_counts_and_percentage_point_differences():
    path = Path(__file__).resolve().parents[2] / "scripts/category_average_diff_report.py"
    assert path.exists(), "the read-only comparison script is missing"
    spec = importlib.util.spec_from_file_location("category_average_diff_report", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    a, b, young = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    detailed = {a: (Decimal(".10"), Decimal(".12"), None, Decimal(".12")),
                b: (Decimal(".30"), Decimal(".32"), Decimal(".40"), Decimal(".368")),
                young: (Decimal("9"), None, None, None)}
    # Old: only A has size, so 1Y=10%, 3Y=12%; 5Y has no weighted value.
    # New: 1Y=(10+30)/2=20%, 3Y=(12+32)/2=22%, 5Y=40%.
    result = module.compare_category_averages(detailed, {a: Decimal("100")})
    assert result == {
        "1y": {"before": Decimal(".10"), "after": Decimal(".20"), "difference_pp": Decimal("10.00"), "peers_before": 1, "peers_after": 2},
        "3y": {"before": Decimal(".12"), "after": Decimal(".22"), "difference_pp": Decimal("10.00"), "peers_before": 1, "peers_after": 2},
        "5y": {"before": None, "after": Decimal(".40"), "difference_pp": None, "peers_before": 0, "peers_after": 1},
    }
    assert all(module.compare_category_averages({}, {})[p]["difference_pp"] is None for p in ("1y", "3y", "5y"))

    c = uuid.uuid4()
    same_three = {sid: (value, value, value, value) for sid, value in
                  ((a, Decimal(".10")), (b, Decimal(".20")), (c, Decimal(".40")))}
    # Same fund-page input: weighted=(10*100+20*100+40*200)/400=27.5%; simple=(10+20+40)/3=23.3333%.
    compared = module.compare_category_averages(same_three, {a: Decimal("100"), b: Decimal("100"), c: Decimal("200")})
    for period in ("1y", "3y", "5y"):
        assert compared[period]["before"] == Decimal(".275")
        assert compared[period]["after"] == Decimal(".70") / Decimal("3")
        assert (compared[period]["after"] * Decimal("100")).quantize(Decimal(".0001")) == Decimal("23.3333")
