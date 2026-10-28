from __future__ import annotations

from datetime import date, datetime, timezone
from unittest.mock import patch

from app.services.fund_page import peer_cache as module


def test_default_day_is_ist_date_not_server_local():
    # 20:00 UTC on 23 Oct is 01:30 IST on 24 Oct.
    class FakeDT(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 23, 20, 0, tzinfo=timezone.utc).astimezone(tz)

    with patch.object(module, "datetime", FakeDT):
        assert module.PeerCache()._day() == date(2026, 10, 24)
