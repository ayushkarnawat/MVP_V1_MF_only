import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as fc from "../fixtures/mfC";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { OverlapSummary } from "../types";
import { StatStrip } from "./StatStrip";

const mount = (summary: OverlapSummary = fc.overlapSummary()) => renderInShell(<StatStrip summary={summary} />, { path: "/portfolio/mutual-funds/overlap" });
const value = (id: string) => screen.getByTestId(`stat-${id}-value`).textContent;
const note = (id: string) => screen.getByTestId(`stat-${id}-note`).textContent;

describe("the four tiles", () => {
  it("draws Funds analysed, Fund pairs with overlap, Highest overlap and Overlap risk in that order", () => {
    mount();
    const tiles = [...screen.getByTestId("stat-strip").children].map(tile => tile.getAttribute("data-testid"));
    expect(tiles).toEqual(["stat-funds", "stat-pairs", "stat-highest", "stat-risk"]);
    expect(["Funds analysed", "Fund pairs with overlap", "Highest overlap", "Overlap risk"].map(label => screen.getByText(label))).toHaveLength(4);
  });
  it("says funds analysed against all funds, with the excluded funds counted from the coverage", () => {
    mount();
    expect(value("funds")).toBe("4 of 7");
    expect(note("funds")).toBe("3 funds excluded — no stock holdings to look through");
  });
  it("says one excluded fund in the singular and all funds when none are left out", () => {
    const one = fc.overlapSummary();
    one.coverage.not_available_from_amc = [];
    one.coverage.missing_value_schemes = [];
    const view = mount(one);
    expect(value("funds")).toBe("4 of 5");
    expect(note("funds")).toBe("1 fund excluded — no stock holdings to look through");
    view.unmount();
    const none = fc.overlapSummary();
    none.coverage.not_published_yet = [];
    none.coverage.not_available_from_amc = [];
    none.coverage.missing_value_schemes = [];
    mount(none);
    expect(value("funds")).toBe("4 of 4");
    expect(note("funds")).toBe("all your funds have stock holdings to look through");
  });
  it("counts the pairs at moderate or higher against n choose 2 of the funds in the grid", () => {
    mount();
    expect(value("pairs")).toBe("3 of 6");
    expect(note("pairs")).toBe("at moderate (≥20%) or higher — possible pairs across your 4 equity funds");
  });
  it("takes the denominator from the grid when the matrix was cut to 12 funds", () => {
    const summary = fc.overlapSummary();
    summary.total_fund_count = 15;
    summary.matrix_truncated = true;
    mount(summary);
    expect(value("funds")).toBe("15 of 18");
    expect(value("pairs")).toBe("3 of 6");
  });
  it("names the highest pair with the two full fund names and shows its overlap in whole percent", () => {
    mount();
    expect(value("highest")).toBe("41%");
    expect(note("highest")).toBe("Kotak Multi Cap Fund × SBI Bluechip Fund");
  });
  it("bands the risk from the highest pair against the payload's bands, with its own explanation", () => {
    const view = mount();
    expect(value("risk")).toBe("High");
    expect(note("risk")).toBe("some fund pairs duplicate a large share of each other's holdings");
    expect(screen.getByTestId("stat-risk")).toHaveAttribute("data-band", "high");
    view.unmount();
    const moderate = fc.overlapSummary();
    moderate.bands = { low: "20", high: "45" };
    mount(moderate);
    expect(value("risk")).toBe("Moderate");
    expect(note("risk")).toBe("a few fund pairs share meaningful exposure");
    expect(screen.getByTestId("stat-risk")).toHaveAttribute("data-band", "moderate");
  });
  it("words the low band and the note from the bands it is given", () => {
    const summary = fc.overlapSummary();
    summary.bands = { low: "50", high: "80" };
    mount(summary);
    expect(value("risk")).toBe("Low");
    expect(note("risk")).toBe("no fund pair shares meaningful exposure");
    expect(value("pairs")).toBe("0 of 6");
    expect(note("pairs")).toContain("(≥50%)");
  });
  it("shows dashes and the need for two funds when the grid has no pair", () => {
    const summary = fc.overlapSummary();
    summary.matrix = [];
    summary.matrix_funds = summary.matrix_funds.slice(0, 1);
    mount(summary);
    expect(value("highest")).toBe("—");
    expect(note("highest")).toBe("needs at least two funds");
    expect(value("risk")).toBe("—");
    expect(note("risk")).toBe("needs at least two funds");
    expect(value("pairs")).toBe("0 of 0");
  });
});

describe("hover text (design rule 11.1)", () => {
  it("gives every tile a focusable tooltip with text, the risk one naming the bands", () => {
    const { container } = mount();
    for (const id of ["funds", "pairs", "highest", "risk"]) {
      const tile = screen.getByTestId(`stat-${id}`);
      expect(tile).toHaveAttribute("tabindex", "0");
      expect(tile).toHaveAttribute("data-tooltip");
      expect(tile.getAttribute("title")!.length).toBeGreaterThan(20);
    }
    expect(screen.getByTestId("stat-risk")).toHaveAttribute("title", "Banded from the highest overlap: Low below 20%, Moderate from 20% to below 40%, High from 40% up.");
    expect(within(screen.getByTestId("stat-strip")).queryAllByRole("button")).toHaveLength(0);
    expectInteractivity(container, 0);
  });
});
