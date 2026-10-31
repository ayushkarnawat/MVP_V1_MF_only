# backend/tests/scripts/test_import_manual_fund_managers.py
from datetime import date
from unittest.mock import patch

import pytest

from scripts.jobs import import_manual_fund_managers as cli


def test_without_the_flag_an_automatic_house_is_still_refused():
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


def test_manual_import_preserves_word_boxes_through_validation_and_file_union(tmp_path, db_session, monkeypatch):
    from app.services.analytics.amfi_factsheet_client import FactsheetPages
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    monkeypatch.setitem(cli.AMC_RESOLVERS, "Box AMC", ResolverEntry(ResolverKind.MANUAL, "Box Company", layout="icici", needs_boxes=True))
    files = [tmp_path / "active.pdf", tmp_path / "passive.pdf"]
    for pdf in files:
        pdf.write_bytes(b"%PDF-fake")
    words = [[(1, 2, 3, 4, "one")], [(5, 6, 7, 8, "two")]]
    with patch.object(cli, "extract_page_text", side_effect=[["a"], ["b"]]), \
         patch.object(cli, "extract_page_words", side_effect=[[words[0]], [words[1]]]), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(True, "ok")) as checked, \
         patch.object(cli, "import_pages", return_value=(2, 0)) as imported:
        cli.run(db_session, "Box AMC", files, today=date(2026, 10, 10))
    assert all(isinstance(call.args[0], FactsheetPages) for call in checked.call_args_list)
    pages = imported.call_args.args[2]
    assert isinstance(pages, FactsheetPages) and list(pages) == ["a", "b"]
    assert pages.words == words


def test_manual_month_check_uses_the_amcs_own_date_pattern(tmp_path, db_session):
    """The monthly job passes entry.as_on_pattern; the manual path must too (Run 6 review)."""
    from dataclasses import replace
    pdf = tmp_path / "hdfc.pdf"
    pdf.write_bytes(b"%PDF-fake")
    entry = replace(cli.AMC_RESOLVERS["HDFC Mutual Fund"], as_on_pattern=r"AUM \((\d{1,2} \w+ \d{4})\)")
    with patch.dict(cli.AMC_RESOLVERS, {"HDFC Mutual Fund": entry}), \
         patch.object(cli, "extract_page_text", return_value=["page"] * 5), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(True, "ok")) as checked, \
         patch.object(cli, "import_pages", return_value=(1, 0)):
        cli.run(db_session, "HDFC Mutual Fund", [pdf], today=date(2026, 10, 12))
    assert checked.call_args.kwargs["as_on_pattern"] == entry.as_on_pattern


@pytest.fixture
def downloaded_pdf(tmp_path):
    pdf = tmp_path / "factsheet.pdf"
    pdf.write_bytes(b"%PDF-fake")
    return pdf


def test_this_month_only_accepts_an_automatic_house_with_a_reader(downloaded_pdf, db_session, capsys):
    with patch.object(cli, "extract_page_text", return_value=["As on September 30, 2026"] * 3), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(True, "ok")), \
         patch.object(cli, "import_pages", return_value=(3, 1)) as imported:
        result = cli.run(db_session, "Nippon India Mutual Fund", [downloaded_pdf], date(2026, 10, 31), this_month_only=True)
    assert result == {"matched": 3, "unmatched": 1}
    assert imported.call_args.kwargs["manual"] is True
    assert imported.call_args.args[4] == date(2026, 10, 1)
    output = capsys.readouterr().out
    assert "as on 2026-09-30" in output
    assert "this-month-only import: Nippon India Mutual Fund stays automatic in the registry; the monthly job will be tried again next month" in output
    assert "warning" not in output.lower()


def test_this_month_only_refuses_a_house_with_no_layout(monkeypatch):
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    monkeypatch.setitem(cli.AMC_RESOLVERS, "No reader", ResolverEntry(ResolverKind.STATIC_LINK, "No reader"))
    with pytest.raises(SystemExit, match="reader"):
        cli.run(None, "No reader", [], date(2026, 10, 31), this_month_only=True)


def test_this_month_only_never_changes_the_registry_entry(downloaded_pdf, db_session):
    before = dict(cli.AMC_RESOLVERS)
    houses = ["Angel One Mutual Fund", "SBI Mutual Fund", "Sundaram Mutual Fund", "Mahindra Manulife Mutual Fund"]
    with patch.object(cli, "extract_page_text", return_value=["page"] * 3), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(True, "ok")), \
         patch.object(cli, "import_pages", return_value=(3, 0)):
        for house in houses:
            cli.run(db_session, house, [downloaded_pdf], date(2026, 10, 31), this_month_only=True)
    assert cli.AMC_RESOLVERS == before
    assert all(cli.AMC_RESOLVERS[house] is before[house] for house in houses)


def test_stale_file_is_refused_without_as_of_and_accepted_with_it_with_a_warning(downloaded_pdf, db_session, capsys):
    from app.services.analytics.fund_manager_layouts import SchemePage
    pages = ["As on September 30, 2026"] * 3
    with patch.object(cli, "extract_page_text", return_value=pages), \
         patch.dict(cli.LAYOUTS, {"nippon": lambda text: SchemePage("Test Fund", [{"name": "Test Manager"}])}), \
         patch.object(cli, "import_pages", return_value=(3, 0)) as imported:
        with pytest.raises(SystemExit):
            cli.run(db_session, "Nippon India Mutual Fund", [downloaded_pdf], date(2026, 11, 20), this_month_only=True)
        imported.assert_not_called()
        capsys.readouterr()
        cli.run(db_session, "Nippon India Mutual Fund", [downloaded_pdf], date(2026, 11, 20), this_month_only=True, as_of=date(2026, 10, 31))
    assert imported.call_args.args[4] == date(2026, 11, 1)
    output = capsys.readouterr().out
    assert "as on 2026-09-30" in output
    assert sum("warning" in line.lower() for line in output.splitlines()) == 1
    assert "2026-10-31" in output and "2026-11-20" in output


def test_a_wrong_file_is_still_refused_before_anything_is_written(downloaded_pdf, tmp_path):
    from unittest.mock import Mock
    from app.services.analytics.fund_manager_layouts import SchemePage
    wrong = tmp_path / "wrong.pdf"
    wrong.write_bytes(b"%PDF-wrong")
    db = Mock()
    with patch.object(cli, "extract_page_text", side_effect=[["As on September 30, 2026"] * 3, ["unrelated file"]]), \
         patch.dict(cli.LAYOUTS, {"nippon": lambda text: SchemePage("Test Fund", []) if "As on" in text else None}), \
         patch.object(cli, "import_pages") as imported, pytest.raises(SystemExit):
        cli.run(db, "Nippon India Mutual Fund", [downloaded_pdf, wrong], date(2026, 11, 20), this_month_only=True, as_of=date(2026, 10, 31))
    imported.assert_not_called()
    db.commit.assert_not_called()
    db.add.assert_not_called()


def test_sbi_takes_both_files(tmp_path, db_session):
    files = [tmp_path / "active.pdf", tmp_path / "passive.pdf"]
    for pdf in files:
        pdf.write_bytes(b"%PDF-fake")
    with patch.object(cli, "extract_page_text", side_effect=[["active"] * 3, ["passive"] * 3]), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(True, "ok")) as checked, \
         patch.object(cli, "import_pages", return_value=(92, 0)) as imported:
        cli.run(db_session, "SBI Mutual Fund", files, date(2026, 10, 31), this_month_only=True)
    assert checked.call_count == 2
    assert imported.call_count == 1
    assert imported.call_args.args[2] == ["active"] * 3 + ["passive"] * 3
    assert imported.call_args.kwargs["manual"] is True


def test_cli_passes_both_options_and_prints_counts(downloaded_pdf, db_session, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["import", "--amc", "Nippon India Mutual Fund", "--pdf", str(downloaded_pdf), "--this-month-only", "--as-of", "2026-10-31"])
    with patch.object(cli, "SessionLocal") as session, \
         patch.object(cli, "run", return_value={"matched": 3, "unmatched": 1}) as imported:
        session.return_value.__enter__.return_value = db_session
        cli.main()
    assert imported.call_args.kwargs == {"this_month_only": True, "as_of": date(2026, 10, 31)}
    assert "matched=3 unmatched=1" in capsys.readouterr().out


@pytest.mark.parametrize("today, warns", [(date(2026, 11, 14), False), (date(2026, 11, 15), True)])
def test_as_of_warning_only_when_needed_and_once_for_all_files(tmp_path, db_session, capsys, today, warns):
    from app.services.analytics.fund_manager_layouts import SchemePage
    files = [tmp_path / "active.pdf", tmp_path / "passive.pdf"]
    for pdf in files:
        pdf.write_bytes(b"%PDF-fake")
    with patch.object(cli, "extract_page_text", return_value=["As on September 30, 2026"] * 3), \
         patch.dict(cli.LAYOUTS, {"sbi": lambda text: SchemePage("Test Fund", [])}), \
         patch.object(cli, "import_pages", return_value=(3, 0)) as imported:
        cli.run(db_session, "SBI Mutual Fund", files, today, this_month_only=True, as_of=date(2026, 10, 31))
    output = capsys.readouterr().out
    assert output.count("as on 2026-09-30") == 2
    assert sum("warning" in line.lower() for line in output.splitlines()) == int(warns)
    assert imported.call_args.args[4] == date(2026, 11, 1)


def test_printed_date_uses_the_houses_own_caption(downloaded_pdf, db_session, capsys):
    from dataclasses import replace
    from app.services.analytics.fund_manager_layouts import SchemePage
    house = "Nippon India Mutual Fund"
    entry = replace(cli.AMC_RESOLVERS[house], as_on_pattern=r"AUM \((\d{1,2} \w+ \d{4})\)")
    with patch.dict(cli.AMC_RESOLVERS, {house: entry}), \
         patch.dict(cli.LAYOUTS, {"nippon": lambda text: SchemePage("Test Fund", [])}), \
         patch.object(cli, "extract_page_text", return_value=["AUM (30 September 2026) As on October 31, 2026"] * 3), \
         patch.object(cli, "import_pages", return_value=(3, 0)):
        cli.run(db_session, house, [downloaded_pdf], date(2026, 11, 20), this_month_only=True, as_of=date(2026, 10, 31))
    output = capsys.readouterr().out
    assert "as on 2026-09-30" in output
    assert "Warning:" in output
