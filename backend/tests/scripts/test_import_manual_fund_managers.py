# backend/tests/scripts/test_import_manual_fund_managers.py
from datetime import date
from unittest.mock import patch

import pytest

from scripts.jobs import import_manual_fund_managers as cli


def test_refuses_an_amc_that_is_not_manual():
    with pytest.raises(SystemExit):
        cli.run(db=None, amc_name="Nippon India Mutual Fund", pdfs=[], today=date(2026, 10, 12))


def test_imports_every_given_file_and_reports_matched_count(tmp_path, db_session):
    files = [tmp_path / "hdfc_active.pdf", tmp_path / "hdfc_passive.pdf"]
    for f in files:
        f.write_bytes(b"%PDF-fake")
    with patch.object(cli, "extract_page_text", return_value=["page"] * 5), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(True, "ok")), \
         patch.object(cli, "import_pages", return_value=(103, 2)) as imported:
        result = cli.run(db_session, "HDFC Mutual Fund", files, today=date(2026, 10, 12))
    assert result == {"matched": 103, "unmatched": 2}
    assert imported.call_count == 1 and imported.call_args.kwargs["manual"] is True


def test_a_stale_file_is_refused_before_anything_is_written(tmp_path, db_session):
    f = tmp_path / "kotak.pdf"
    f.write_bytes(b"%PDF-fake")
    with patch.object(cli, "extract_page_text", return_value=["page"] * 5), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(False, "stale_month")), \
         patch.object(cli, "import_pages") as imported, pytest.raises(SystemExit):
        cli.run(db_session, "Kotak Mahindra Mutual Fund", [f], today=date(2026, 10, 12))
    imported.assert_not_called()


def test_second_file_is_checked_before_first_file_writes(tmp_path, db_session):
    files = [tmp_path / "active.pdf", tmp_path / "passive.pdf"]
    for pdf in files:
        pdf.write_bytes(b"%PDF-fake")
    with patch.object(cli, "extract_page_text", return_value=["page"] * 5), \
         patch.object(cli, "looks_like_current_factsheet", side_effect=[(True, "ok"), (False, "stale_month")]), \
         patch.object(cli, "import_pages") as imported, pytest.raises(SystemExit):
        cli.run(db_session, "HDFC Mutual Fund", files, today=date(2026, 10, 12))
    imported.assert_not_called()


def test_both_files_are_imported_together(tmp_path, db_session):
    """Run 5 review: one import over all files, so a fund in both files keeps both files' managers."""
    files = [tmp_path / "a.pdf", tmp_path / "b.pdf"]
    for f in files:
        f.write_bytes(b"%PDF-fake")
    with patch.object(cli, "extract_page_text", side_effect=[["page a"] * 3, ["page b"] * 3]), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(True, "ok")), \
         patch.object(cli, "import_pages", return_value=(10, 0)) as imported:
        cli.run(db_session, "HDFC Mutual Fund", files, today=date(2026, 10, 12))
    assert imported.call_count == 1
    assert list(imported.call_args.args[2]) == ["page a"] * 3 + ["page b"] * 3
