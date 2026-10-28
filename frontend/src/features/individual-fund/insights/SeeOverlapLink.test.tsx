import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { IDS, fixture } from "../fixtures";
import type { Fact, InsightsResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { FactRow } from "./FactRow";
import { InsightList } from "./InsightList";
import { StrengthsConsiderations } from "./StrengthsConsiderations";

const OVERLAP_HREF = `/portfolio/mutual-funds/funds/${IDS.scheme}/overlap`;
const insights = () => fixture<InsightsResponse>("insights_full");
const overlapFact = () => insights().key[0];
const section = (data: InsightsResponse): FundSection<InsightsResponse> => ({ status: "ready", data, reason: null, error: null, retry: vi.fn() });

function mountRow(fact: Fact, schemeId?: string, routes = buildRegistry()) {
  const onOpen = vi.fn();
  renderInShell(<ul><FactRow fact={fact} onOpen={onOpen} schemeId={schemeId} /></ul>, { path: `/portfolio/mutual-funds/funds/${IDS.scheme}/insights`, routes });
  return onOpen;
}

describe("See Overlap link (the Insights tab)", () => {
  it("with the fund id and a live Overlap route, 'See Overlap' is a real link to the Overlap tab", () => {
    mountRow(overlapFact(), IDS.scheme);
    const link = within(screen.getByTestId("fact-overlap")).getByRole("link", { name: "See Overlap" });
    expect(link).toHaveAttribute("href", OVERLAP_HREF);
    expect(screen.getByTestId("overlap-link")).not.toHaveAttribute("aria-disabled");
  });

  it("clicking the link goes to the tab and does not also open the evidence; clicking elsewhere on the row still opens it", () => {
    const onOpen = mountRow(overlapFact(), IDS.scheme);
    fireEvent.click(screen.getByRole("link", { name: "See Overlap" }));
    fireEvent.keyDown(screen.getByRole("link", { name: "See Overlap" }), { key: "Enter" });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("fact-overlap"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("without the fund id the greyed stub stays exactly as before", () => {
    mountRow(overlapFact());
    const stub = screen.getByTestId("overlap-link");
    expect(stub).toHaveAttribute("aria-disabled", "true");
    expect(stub).toHaveAttribute("title", "Coming soon");
    expect(screen.queryByRole("link", { name: "See Overlap" })).toBeNull();
  });

  it("with the fund id but the Overlap route not live, the link is the greyed Coming soon span", () => {
    const routes = buildRegistry().map(route => (route.id === "portfolio-mutual-funds-fund-overlap" ? { ...route, status: "placeholder" as const } : route));
    mountRow(overlapFact(), IDS.scheme, routes);
    const row = screen.getByTestId("fact-overlap");
    expect(within(row).getByRole("link", { name: "See Overlap" })).not.toHaveAttribute("href");
    expect(within(row).getByText("See Overlap")).toHaveAttribute("aria-disabled", "true");
    expect(within(row).getByText("See Overlap")).toHaveAttribute("title", "Coming soon");
  });

  it("only the overlap fact gets the link", () => {
    mountRow(insights().key[1], IDS.scheme);
    expect(screen.queryByTestId("overlap-link")).toBeNull();
    expect(screen.queryByText("See Overlap")).toBeNull();
  });

  it("InsightList passes the fund id down: the key list's overlap fact links to the tab", () => {
    renderInShell(<InsightList insights={section(insights())} schemeId={IDS.scheme} />, { path: OVERLAP_HREF });
    expect(screen.getByRole("link", { name: "See Overlap" })).toHaveAttribute("href", OVERLAP_HREF);
  });

  it("StrengthsConsiderations passes the fund id down too (an overlap fact there links as well)", () => {
    const data = insights();
    data.strengths = [{ ...data.key[0], list: "strength" }];
    renderInShell(<StrengthsConsiderations insights={section(data)} schemeId={IDS.scheme} />, { path: OVERLAP_HREF });
    expect(screen.getByRole("link", { name: "See Overlap" })).toHaveAttribute("href", OVERLAP_HREF);
  });
});
