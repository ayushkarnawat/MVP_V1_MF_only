import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fa from "../fixtures/mfAsks";
import * as fc from "../fixtures/mfC";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { OverlapSummary } from "../types";
import { ImpactDonut } from "./ImpactDonut";

const mount = (data: OverlapSummary | null, state: "loading" | "ready" | "failed" | "error" = "ready") =>
  renderInShell(<ImpactDonut state={state} data={data} onRetry={vi.fn()} />, { path: "/portfolio/mutual-funds/overlap" });
const A = "S-KOTAK~S-SBI";
const B = "S-JM~S-SBI";
const C = "S-JM~S-KOTAK";
const name = (key: string, isin: string) => screen.getByTestId(`impact-driver-name-${key}-${isin}`).textContent;
const value = (key: string, isin: string) => screen.getByTestId(`impact-driver-value-${key}-${isin}`).textContent;

describe("the stock-level drivers under the donut", () => {
  it("has a titled section with one block per impact pair, in the backend's order", () => {
    mount(fa.overlapSummaryWithAsks());
    const section = screen.getByTestId("impact-drivers");
    expect(within(section).getByRole("heading", { name: "What drives the overlap" })).toBeInTheDocument();
    expect(within(section).getByText("The biggest shared stocks behind your top overlapping pairs.")).toBeInTheDocument();
    expect([...section.querySelectorAll("[data-pair]")].map(node => node.getAttribute("data-pair"))).toEqual([A, B, C]);
  });
  it("titles each block with both fund names and the pair's overlap", () => {
    mount(fa.overlapSummaryWithAsks());
    expect(screen.getByTestId(`impact-pair-title-${A}`)).toHaveTextContent("Kotak Multi Cap Fund × SBI Bluechip Fund");
    expect(screen.getByTestId(`impact-pair-overlap-${A}`)).toHaveTextContent("41% overlap");
    expect(screen.getByTestId(`impact-pair-title-${B}`)).toHaveTextContent("JM Flexi Cap Fund × SBI Bluechip Fund");
    expect(screen.getByTestId(`impact-pair-overlap-${B}`)).toHaveTextContent("26% overlap");
    expect(screen.getByTestId(`impact-pair-title-${C}`)).toHaveTextContent("Kotak Multi Cap Fund × JM Flexi Cap Fund");
    expect(screen.getByTestId(`impact-pair-overlap-${C}`)).toHaveTextContent("24% overlap");
  });
  it("lists the five drivers of the top pair largest first, each with its weight and its share of the overlap", () => {
    mount(fa.overlapSummaryWithAsks());
    const list = within(screen.getByRole("list", { name: "Stocks driving Kotak Multi Cap Fund × SBI Bluechip Fund" }));
    expect(list.getAllByRole("listitem").map(item => item.getAttribute("data-testid"))).toEqual([
      `impact-driver-${A}-INE040A01034`, `impact-driver-${A}-INE090A01021`, `impact-driver-${A}-INE002A01018`, `impact-driver-${A}-INE009A01021`, `impact-driver-${A}-INE018A01030`,
    ]);
    expect(["INE040A01034", "INE090A01021", "INE002A01018", "INE009A01021", "INE018A01030"].map(isin => [isin, name(A, isin), value(A, isin)])).toEqual([
      ["INE040A01034", "HDFC Bank Ltd", "7.80% of net assets · 19.2% of the overlap"],
      ["INE090A01021", "ICICI Bank Ltd", "6.90% of net assets · 17.0% of the overlap"],
      ["INE002A01018", "Reliance Industries Ltd", "5.60% of net assets · 13.8% of the overlap"],
      ["INE009A01021", "Infosys Ltd", "4.90% of net assets · 12.1% of the overlap"],
      ["INE018A01030", "Larsen & Toubro Ltd", "4.40% of net assets · 10.8% of the overlap"],
    ]);
  });
  it("lists the other pairs with their own figures, the smaller fund weight counting", () => {
    mount(fa.overlapSummaryWithAsks());
    expect(within(screen.getByRole("list", { name: "Stocks driving JM Flexi Cap Fund × SBI Bluechip Fund" })).getAllByRole("listitem")).toHaveLength(4);
    expect(value(B, "INE090A01021")).toBe("8.20% of net assets · 31.1% of the overlap");
    expect(value(B, "INE040A01034")).toBe("7.10% of net assets · 26.9% of the overlap");
    expect(value(B, "INE009A01021")).toBe("6.30% of net assets · 23.9% of the overlap");
    expect(value(B, "INE002A01018")).toBe("4.80% of net assets · 18.2% of the overlap");
    expect(within(screen.getByRole("list", { name: "Stocks driving Kotak Multi Cap Fund × JM Flexi Cap Fund" })).getAllByRole("listitem")).toHaveLength(4);
    expect(value(C, "INE040A01034")).toBe("7.10% of net assets · 30.0% of the overlap");
    expect(value(C, "INE090A01021")).toBe("6.90% of net assets · 29.1% of the overlap");
    expect(value(C, "INE009A01021")).toBe("4.90% of net assets · 20.7% of the overlap");
    expect(value(C, "INE002A01018")).toBe("4.80% of net assets · 20.3% of the overlap");
    expect(name(C, "INE002A01018")).toBe("Reliance Industries Ltd");
  });
  it("sits after the donut and its legend", () => {
    mount(fa.overlapSummaryWithAsks());
    const legend = screen.getByRole("list", { name: "Overlap impact" });
    expect(legend.compareDocumentPosition(screen.getByTestId("impact-drivers")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("leaves the donut, the headline and the three rows exactly as they were", () => {
    mount(fa.overlapSummaryWithAsks());
    expect(screen.getByTestId("impact-headline")).toHaveTextContent("71.8% of portfolio in top 3 overlapping pairs");
    expect(["top3", "other", "unique"].map(key => screen.getByTestId(`impact-pct-${key}`).textContent)).toEqual(["71.8%", "0.0%", "28.2%"]);
  });
  it("adds no control and keeps every existing one marked", () => {
    const { container } = mount(fa.overlapSummaryWithAsks());
    expect(within(screen.getByTestId("impact-drivers")).queryAllByRole("button")).toEqual([]);
    expectInteractivity(container, 3);
  });
});

describe("when the backend does not send the drivers", () => {
  it("hides the whole section on an old payload, with the card unchanged", () => {
    mount(fc.overlapSummary());
    expect(screen.queryByTestId("impact-drivers")).not.toBeInTheDocument();
    expect(screen.queryByText("What drives the overlap")).not.toBeInTheDocument();
    expect(screen.getByTestId("impact-headline")).toHaveTextContent("71.8% of portfolio in top 3 overlapping pairs");
  });
  it("hides it for a null or empty list, and for a pair list whose pairs all have no drivers", () => {
    const nulled = fa.overlapSummaryWithAsks();
    nulled.impact_pairs = null;
    const first = mount(nulled);
    expect(screen.queryByTestId("impact-drivers")).not.toBeInTheDocument();
    first.unmount();
    const empty = fa.overlapSummaryWithAsks();
    empty.impact_pairs = [];
    const second = mount(empty);
    expect(screen.queryByTestId("impact-drivers")).not.toBeInTheDocument();
    second.unmount();
    const hollow = fa.overlapSummaryWithAsks();
    hollow.impact_pairs!.forEach(pair => { pair.drivers = []; });
    mount(hollow);
    expect(screen.queryByTestId("impact-drivers")).not.toBeInTheDocument();
  });
  it("shows only the pairs that have drivers", () => {
    const data = fa.overlapSummaryWithAsks();
    data.impact_pairs![1].drivers = [];
    mount(data);
    expect(screen.getByTestId(`impact-pair-${A}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`impact-pair-${B}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`impact-pair-${C}`)).toBeInTheDocument();
  });
  it("shows nothing while loading", () => {
    mount(null, "loading");
    expect(screen.queryByTestId("impact-drivers")).not.toBeInTheDocument();
  });
});
