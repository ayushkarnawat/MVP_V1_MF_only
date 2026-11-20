"""Shared formatting and comparison checks for the reference exports."""

from collections.abc import Iterable, Sequence
from datetime import date
from decimal import Decimal
from typing import Literal, NamedTuple

from openpyxl import Workbook
from openpyxl.cell import Cell
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet


_FORMULA_FILL = PatternFill(fill_type="solid", fgColor="E2F0D9")
_VALUE_FILL = PatternFill(fill_type="solid", fgColor="FFFFFF")
_HEADER_FONT = Font(bold=True)
_WRAP = Alignment(vertical="top", wrap_text=True)
_DATE_FORMAT = "dd mmm yyyy"

CellValue = date | Decimal | int | str | None


def append_values(ws: Worksheet, values: Sequence[CellValue]) -> None:
    """Append literal values, including source text that Excel might interpret as a formula."""
    cells = []
    for value in values:
        cell = Cell(ws, value=value)
        cell.fill = _VALUE_FILL
        if isinstance(value, str):
            cell.data_type = "s"
        elif isinstance(value, date):
            cell.number_format = _DATE_FORMAT
        cells.append(cell)
    ws.append(cells)


def formula_cell(ws: Worksheet, ref: str, formula: str) -> Cell:
    cell = ws[ref]
    cell.value = formula
    cell.fill = _FORMULA_FILL
    return cell


def freeze_and_filter(ws: Worksheet) -> None:
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for column, cells in enumerate(ws.iter_cols(), 1):
        width = 14
        for cell in cells:
            if cell.row == 1:
                cell.font = _HEADER_FONT
            if cell.value is not None and cell.data_type != "f" and isinstance(cell.value, str):
                width = max(width, min(len(cell.value) + 3, 54))
                if len(cell.value) > 51:
                    cell.alignment = _WRAP
        ws.column_dimensions[get_column_letter(column)].width = width


class CheckRow(NamedTuple):
    category: str
    plan: str
    period: str
    as_of: date
    recount: int | Decimal
    app: int | Decimal
    difference: int | Decimal
    result: Literal["PASS", "FAIL"]
    recount_only: str | None = None
    app_only: str | None = None


def add_checks_sheet(wb: Workbook, rows: Iterable[CheckRow]) -> Worksheet:
    ws = wb.create_sheet("Checks")
    append_values(ws, ("Category", "Plan", "Period", "As of", "Recount", "App", "Difference", "Result",
                       "Recount only", "App only"))
    for row in rows:
        append_values(ws, row)
    freeze_and_filter(ws)
    return ws
