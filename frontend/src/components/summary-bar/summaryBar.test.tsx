import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryBar, SummaryCell, SummaryFigure, SummaryLead, SummarySpark } from "@/components/summary-bar";
import styles from "./summaryBar.module.css";

function setup() {
  render(<SummaryBar ariaLabel="Portfolio summary"
    lead={<SummaryLead label="Total Portfolio Value" testId="metric-total-value"
      figure={<SummaryFigure text="₹1,53,26,999" testId="value-total" />}
      trend={<SummarySpark points="0,26 72,0" trend="up" />} caption="Today's Gain: ₹0" footer="1 on last known NAV" />}
    cells={[
      <SummaryCell key="invested" label="Total Invested" testId="metric-invested" figure={<SummaryFigure text="₹51,53,169" testId="value-invested" />} />,
      <SummaryCell key="unrealised" label="Unrealised Gain" testId="metric-unrealised" wash="pos" figure={<SummaryFigure text="+₹1,01,73,830" tone="pos" testId="value-unrealised" />} caption="+197.4% return on invested" />,
      <SummaryCell key="realised" label="Realised Gain" testId="metric-realised" figure={<SummaryFigure text="₹0" testId="value-realised" />} />,
      <SummaryCell key="xirr" label="XIRR" testId="metric-xirr" figure={<SummaryFigure text="14.8%" testId="value-xirr" />} />,
    ]}
    footerLeft={<span>Prices as on 18 Nov 2026</span>}
    footerRight={<div role="group" aria-label="XIRR basis"><button type="button" data-clickable="" aria-pressed="true">Lifetime</button><button type="button" data-clickable="" aria-pressed="false">Current</button></div>}
  />);
}

describe("summary bar primitives", () => {
  it("every_tile_renders_its_figure_in_the_same_row_position", () => {
    setup();
    const figures = screen.getAllByTestId(/^value-/);
    expect(figures).toHaveLength(5);
    const positions = figures.map(figure => {
      expect(figure).toHaveAttribute("data-row", "figure");
      const tile = figure.closest('[data-testid^="metric-"]')!;
      let row: Element = figure;
      while (row.parentElement !== tile) row = row.parentElement!;
      return Array.from(tile.children).indexOf(row);
    });
    expect(new Set(positions).size).toBe(1);
    expect(screen.getByTestId("sparkline").querySelector("polyline")).toHaveAttribute("points", "0,26 72,0");
  });

  it("the_lead_card_and_the_panel_are_two_surfaces", () => {
    setup();
    const bar = screen.getByTestId("summary-bar");
    expect(bar).toHaveAccessibleName("Portfolio summary");
    expect(bar.children).toHaveLength(2);
    expect(bar.children[0]).toContainElement(screen.getByTestId("metric-total-value"));
    for (const id of ["invested", "unrealised", "realised", "xirr"]) {
      expect(bar.children[1]).toContainElement(screen.getByTestId(`metric-${id}`));
      expect(bar.children[0]).not.toContainElement(screen.getByTestId(`metric-${id}`));
    }
  });

  it("bottom_strip_holds_the_basis_switch_and_prices_as_on", () => {
    setup();
    const panel = screen.getByTestId("summary-bar").children[1];
    const bottom = panel.lastElementChild as HTMLElement;
    expect(within(bottom).getByText("Prices as on 18 Nov 2026")).toBeInTheDocument();
    const basis = within(bottom).getByRole("group", { name: "XIRR basis" });
    expect(within(basis).getByRole("button", { name: "Lifetime" })).toHaveAttribute("aria-pressed", "true");
    expect(within(basis).getByRole("button", { name: "Current" })).toBeInTheDocument();
    expect(bottom.querySelector('[data-row="figure"]')).toBeNull();
  });

  it("figure_uses_the_smaller_rupee_sign_without_changing_the_text_content", () => {
    const values = ["₹1,53,26,999", "+₹1,01,73,830", "-₹3,79,885", "₹0", "\u2014", "14.8%"];
    const { container } = render(<>{values.map((text, i) => <SummaryFigure key={text} text={text} testId={`figure-${i}`} />)}</>);
    const css = readFileSync(resolve("src/components/summary-bar/summaryBar.module.css"), "utf8");
    values.forEach((text, i) => {
      const figure = screen.getByTestId(`figure-${i}`);
      expect(figure.textContent).toBe(text);
      expect(figure).toHaveAttribute("data-row", "figure");
      if (!text.includes("₹")) return;
      const currency = within(figure).getByText("₹", { exact: true });
      expect(currency).not.toBe(figure);
      const ruleName = Object.keys(styles).find(name => currency.classList.contains(styles[name]));
      expect(ruleName).toBeDefined();
      const rule = css.match(new RegExp(`\\.${ruleName}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
      expect(rule).toMatch(/font-size:\s*0?\.\d+em\b/);
    });
    expect(container.querySelectorAll('[data-row="figure"]')).toHaveLength(values.length);
  });
});
