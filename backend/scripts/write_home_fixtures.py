from __future__ import annotations

import json
from pathlib import Path


REQUESTS = {
    "summary_family.json": "/household/aggregate/home/summary",
    "summary_member.json": "/household-members/{member_id}/home/summary",
    "summary_empty.json": "/household/aggregate/home/summary",
    "summary_partial.json": "/household/aggregate/home/summary",
    "summary_weekend.json": "/household/aggregate/home/summary",
    "wealth_1d_family.json": "/household/aggregate/home/wealth-series?period=1D",
    "wealth_1m_family_benchmark.json": "/household/aggregate/home/wealth-series?period=1M&benchmark=nifty_50",
    "wealth_1y_member_clipped.json": "/household-members/{member_id}/home/wealth-series?period=1Y&benchmark=nifty_smallcap_250",
    "wealth_custom_empty_range.json": "/household/aggregate/home/wealth-series?period=custom&from=2016-01-01&to=2016-12-31",
    "wealth_partial.json": "/household/aggregate/home/wealth-series?period=1M",
    "allocation_family.json": "/household/aggregate/home/allocation",
    "allocation_member.json": "/household-members/{member_id}/home/allocation",
    "allocation_fallback.json": "/household/aggregate/home/allocation",
    "allocation_empty.json": "/household/aggregate/home/allocation",
    "movers_sector.json": "/household/aggregate/home/movers?by=sector",
    "movers_category_fallback.json": "/household/aggregate/home/movers?by=category",
    "movers_fund.json": "/household/aggregate/home/movers?by=fund",
    "movers_all_down.json": "/household/aggregate/home/movers?by=fund",
    "movers_empty.json": "/household/aggregate/home/movers?by=fund",
    "worth_three_cards.json": "/household/aggregate/home/worth-a-look",
    "worth_none.json": "/household/aggregate/home/worth-a-look",
    "worth_unavailable.json": "/household/aggregate/home/worth-a-look",
    "benchmarks_family.json": "/household/aggregate/home/benchmarks",
    "benchmarks_no_mix.json": "/household-members/{member_id}/home/benchmarks",
}


def write_fixture_set(client, member_id, destination: Path) -> dict[str, dict]:
    destination.mkdir(parents=True, exist_ok=True)
    written = {}
    for filename, template in REQUESTS.items():
        path = template.format(member_id=member_id)
        response = client.get(path)
        if response.status_code != 200:
            raise RuntimeError(f"{path}: {response.status_code} {response.text}")
        payload = response.json()
        (destination / filename).write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        written[filename] = payload
    return written


def main() -> None:
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from fastapi.testclient import TestClient

    from app.db.base import Base
    from app.db.session import get_db
    from app.main import app
    from tests.api.home_fixture import seed_home_household

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    event.listen(engine, "connect", lambda connection, _record: connection.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    sessions = sessionmaker(autoflush=False, bind=engine)

    def override_db():
        with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    household = seed_home_household(client)
    destination = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "home"
    write_fixture_set(client, household.asha_id, destination)
    print(f"wrote {len(REQUESTS)} Home fixtures to {destination}")


if __name__ == "__main__":
    main()
