import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HistoryPoint } from "../../../features/mutual-funds/types";
import { formatPercent, formatRupees } from "../../../lib/format";
import { YearByYearTable } from "./YearByYearTable";

afterEach(cleanup);

function pt(month: string, value: number, invested: number | null): HistoryPoint {
  return {
    month,
    value,
    invested,
    valueText: String(value),
    investedText: invested === null ? null : String(invested),
    partial: false,
    missing: [],
  };
}

describe("YearByYearTable", () => {
  it("one row per year using the December point, else the last point of the year", () => {
    const points: HistoryPoint[] = [
      pt("2024-06", 100_000, 90_000),
      pt("2024-12", 120_000, 100_000),
      pt("2025-03", 130_000, 105_000),
      pt("2025-11", 150_000, 110_000),
    ];
    const { container } = render(<YearByYearTable points={points} asOf={null} />);
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0].textContent).toContain("2024");
    expect(bodyRows[0].textContent).toContain(formatRupees("120000"));
    expect(bodyRows[1].textContent).toContain("2025");
    expect(bodyRows[1].textContent).toContain(formatRupees("150000"));
  });

  it("gain and gain percent equal value minus invested and its ratio, formatted by the shared formatters", () => {
    const points: HistoryPoint[] = [
      pt("2024-12", 56_645, 52_500),
      pt("2025-12", 90_000, 100_000),
    ];
    const { container } = render(<YearByYearTable points={points} asOf={null} />);
    const rows = container.querySelectorAll("tbody tr");

    const gain1 = 56_645 - 52_500;
    const pct1 = (gain1 / 52_500) * 100;
    expect(rows[0].textContent).toContain(formatRupees("52500"));
    expect(rows[0].textContent).toContain(formatRupees("56645"));
    expect(rows[0].textContent).toContain(`+${formatRupees(String(gain1))}`);
    expect(rows[0].textContent).toContain(formatPercent(String(pct1), { digits: 1, signed: true }));

    const gain2 = 90_000 - 100_000;
    const pct2 = (gain2 / 100_000) * 100;
    expect(rows[1].textContent).toContain(formatRupees(String(gain2)));
    expect(rows[1].textContent).toContain(formatPercent(String(pct2), { digits: 1, signed: true }));
  });

  it("labels the partial year from asOf", () => {
    const points: HistoryPoint[] = [
      pt("2025-12", 830_559, 366_793),
      pt("2026-10", 950_916, 396_542),
    ];
    render(<YearByYearTable points={points} asOf="2026-10-05" />);
    expect(screen.getByText("2025")).toBeTruthy();
    expect(screen.getByText("2026 (to 5 Oct)")).toBeTruthy();
  });

  it("shows dashes where invested is null", () => {
    const points: HistoryPoint[] = [pt("2024-12", 200_000, null)];
    const { container } = render(<YearByYearTable points={points} asOf={null} />);
    const cells = Array.from(container.querySelectorAll("tbody tr td")).map(td => td.textContent);
    expect(cells).toEqual(["2024", "-", formatRupees("200000"), "-", "-"]);
  });

  it("rows do not split and the header is a thead", () => {
    const points: HistoryPoint[] = [pt("2024-12", 200_000, 150_000)];
    const { container } = render(<YearByYearTable points={points} asOf={null} />);
    const thead = container.querySelector("table thead");
    expect(thead).not.toBeNull();
    const row = container.querySelector("tbody tr");
    expect(row?.className).toContain("break-inside-avoid");
  });

  it("no button, no title attribute", () => {
    const points: HistoryPoint[] = [pt("2024-12", 200_000, 150_000)];
    const { container } = render(<YearByYearTable points={points} asOf="2024-12-31" />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[role='button']")).toBeNull();
    expect(container.querySelector("[title]")).toBeNull();
    const src = readFileSync(resolve("src/print/groups/performance/YearByYearTable.tsx"), "utf8");
    expect(src).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
  });
});
