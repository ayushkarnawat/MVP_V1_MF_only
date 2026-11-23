import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatPercent, formatRupees } from "../../../lib/format";
import { PrintModeProvider } from "../../../lib/printMode";
import { DonutLegendPrint, type DonutLegendSlice } from "./DonutLegendPrint";

const SAMPLE_SLICES: DonutLegendSlice[] = [
  { key: "alpha-amc", label: "Alpha Mutual Fund", value: "6308077", percent: "66.3" },
  { key: "beta-amc", label: "Beta Mutual Fund", value: "1944684", percent: "20.5" },
  { key: "gamma-amc", label: "Gamma Mutual Fund", value: "675058", percent: "7.1" },
  { key: "delta-amc", label: "Delta Mutual Fund", value: "581340", percent: "6.1" },
];

function renderWithPrint(ui: React.ReactElement) {
  return render(
    <PrintModeProvider value={{ folios: "masked", dataDates: true }}>
      {ui}
    </PrintModeProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe("DonutLegendPrint", () => {
  it("renders the donut flat: nothing is selected or active", () => {
    renderWithPrint(
      <DonutLegendPrint slices={SAMPLE_SLICES} centreLabel="Total" centreValue="₹95.10 L" />
    );
    for (const slice of SAMPLE_SLICES) {
      const node = screen.getByTestId(`slice-${slice.key}`);
      expect(node).toHaveAttribute("data-selected", "false");
      expect(node).toHaveAttribute("data-popped", "false");
      expect(node).toHaveAttribute("data-dim", "false");
    }
  });

  it("colours follow the screen mapping, slice n uses --c{n % 8 + 1}", () => {
    const tenSlices: DonutLegendSlice[] = Array.from({ length: 10 }, (_, i) => ({
      key: `slice-${i}`,
      label: `Fund House ${i + 1}`,
      value: "100000",
      percent: "10.0",
    }));
    renderWithPrint(
      <DonutLegendPrint slices={tenSlices} centreLabel="Total" centreValue="₹10.00 L" />
    );
    tenSlices.forEach((slice, index) => {
      const expectedVar = `var(--c${(index % 8) + 1})`;
      const circle = screen.getByTestId(`slice-${slice.key}`).querySelector("circle");
      expect(circle).toHaveAttribute("stroke", expectedVar);
      const dot = screen.getByTestId(`legend-dot-${slice.key}`);
      expect(dot).toHaveStyle({ backgroundColor: expectedVar });
    });
  });

  it("the legend shows the label, the percent and the rupee value of every slice, untruncated", () => {
    const longSlice: DonutLegendSlice = {
      key: "long-amc",
      label: "Very Long Asset Management Company Name That Should Wrap Naturally",
      value: "1234567",
      percent: "100",
    };
    renderWithPrint(
      <DonutLegendPrint slices={[longSlice]} centreLabel="Total" centreValue="₹12.35 L" />
    );
    const labelEl = screen.getByText(longSlice.label);
    expect(labelEl).toBeInTheDocument();
    expect(labelEl.className).not.toContain("truncate");
    expect(screen.getByText(formatPercent(longSlice.percent, { digits: 1 }))).toBeInTheDocument();
    expect(screen.getByText(formatRupees(longSlice.value))).toBeInTheDocument();
  });

  it("the centre shows the label and value it is given", () => {
    renderWithPrint(
      <DonutLegendPrint slices={SAMPLE_SLICES} centreLabel="Total" centreValue="₹95.10 L" />
    );
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Total");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹95.10 L");
  });

  it("percent and value are formatted by the shared formatters", () => {
    renderWithPrint(
      <DonutLegendPrint slices={SAMPLE_SLICES} centreLabel="Total" centreValue="₹95.10 L" />
    );
    for (const slice of SAMPLE_SLICES) {
      expect(screen.getByText(formatPercent(slice.percent, { digits: 1 }))).toBeInTheDocument();
      expect(screen.getByText(formatRupees(slice.value))).toBeInTheDocument();
    }
  });

  it("renders null with no slices", () => {
    const { container } = renderWithPrint(
      <DonutLegendPrint slices={[]} centreLabel="Total" centreValue="₹0" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("no button, no title attribute, no hover handlers, no hex colour", () => {
    const { container } = renderWithPrint(
      <DonutLegendPrint slices={SAMPLE_SLICES} centreLabel="Total" centreValue="₹95.10 L" />
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(container.querySelectorAll("[title]")).toHaveLength(0);

    const source = readFileSync(
      resolve("src/print/groups/shared/DonutLegendPrint.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
    expect(source).not.toMatch(/\bonMouse|\bonClick|\bhover:/);
  });
});
