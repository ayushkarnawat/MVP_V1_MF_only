import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HistoryPoint } from "../../../features/mutual-funds/types";
import { formatCompactRupees } from "../../../lib/format";
import { HistoryChartPrint } from "./HistoryChartPrint";

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

const SAMPLE_POINTS: HistoryPoint[] = [
  pt("2022-01", 1_000_000, 800_000),
  pt("2022-12", 1_250_000, 950_000),
  pt("2023-12", 1_600_000, 1_100_000),
  pt("2024-01", 1_700_000, 1_150_000),
  pt("2024-12", 2_100_000, 1_300_000),
  pt("2025-12", 2_500_000, 1_500_000),
  pt("2026-01", 2_650_000, 1_550_000),
  pt("2026-10", 3_000_000, 1_700_000),
];

describe("HistoryChartPrint", () => {
  it("draws the value and invested lines from the points", () => {
    const { container } = render(<HistoryChartPrint points={SAMPLE_POINTS} title="Value over time" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const polylines = container.querySelectorAll("svg polyline");
    expect(polylines.length).toBeGreaterThanOrEqual(2);
    const strokes = Array.from(polylines).map(el => el.getAttribute("stroke"));
    expect(strokes).toContain("var(--pos)");
    expect(strokes).toContain("var(--ui-text-muted)");
    const investedLine = Array.from(polylines).find(el => el.getAttribute("stroke") === "var(--ui-text-muted)");
    expect(investedLine?.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("labels the y axis in the compact style and the x axis by year", () => {
    const { container } = render(<HistoryChartPrint points={SAMPLE_POINTS} title="Value over time" />);
    const texts = Array.from(container.querySelectorAll("svg text")).map(el => el.textContent ?? "");
    expect(texts).toContain(formatCompactRupees("0"));
    expect(texts.some(t => t.includes("L") && t.startsWith("₹"))).toBe(true);
    expect(texts).toContain("2022");
    expect(texts).toContain("2024");
    expect(texts).toContain("2026");
  });

  it("shows the two-item legend and the given title", () => {
    render(<HistoryChartPrint points={SAMPLE_POINTS} title="Value and money invested (net of withdrawals), 2022 to 2026" />);
    expect(screen.getByRole("heading", { level: 4, name: "Value and money invested (net of withdrawals), 2022 to 2026" })).toBeTruthy();
    expect(screen.getByText("Portfolio value")).toBeTruthy();
    expect(screen.getByText("Invested")).toBeTruthy();
  });

  it("shows the empty sentence with no points", () => {
    const { container } = render(<HistoryChartPrint points={[]} title="Value over time" />);
    expect(screen.getByText("No history yet")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("breaks the invested line where invested is null", () => {
    const gapped: HistoryPoint[] = [
      pt("2024-01", 100_000, 90_000),
      pt("2024-02", 110_000, 95_000),
      pt("2024-03", 120_000, null),
      pt("2024-04", 130_000, 105_000),
      pt("2024-05", 140_000, 110_000),
    ];
    const { container } = render(<HistoryChartPrint points={gapped} title="Value over time" />);
    const investedLines = Array.from(container.querySelectorAll("svg polyline")).filter(
      el => el.getAttribute("stroke") === "var(--ui-text-muted)"
    );
    expect(investedLines).toHaveLength(2);
  });

  it("has no button, no title attribute and no hex colour", () => {
    const { container } = render(<HistoryChartPrint points={SAMPLE_POINTS} title="Value over time" />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[role='button']")).toBeNull();
    expect(container.querySelector("[title]")).toBeNull();
    const src = readFileSync(resolve("src/print/groups/performance/HistoryChartPrint.tsx"), "utf8");
    expect(src).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
  });
});
