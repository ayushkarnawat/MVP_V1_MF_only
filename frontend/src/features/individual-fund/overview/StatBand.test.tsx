import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderInShell } from "@/shell/testing";
import { IDS, fixture } from "../fixtures";
import type { ScoreResponse, SummaryResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { StatBand } from "./StatBand";

const members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.dev, name: "Dev Rao" }, { id: IDS.meera, name: "Meera Rao" }];
const score = (over: Partial<FundSection<ScoreResponse>> = {}): FundSection<ScoreResponse> => ({
  status: "ready", data: fixture<ScoreResponse>("score_stored"), reason: null, error: null, retry: vi.fn(), ...over,
});

function mount(summary: SummaryResponse = fixture<SummaryResponse>("summary_family"), props: { score?: FundSection<ScoreResponse>; refreshing?: boolean } = {}, scope = {}) {
  return renderInShell(<StatBand summary={summary} score={props.score ?? score()} refreshing={props.refreshing} />, { scope });
}

/** The value that sits next to a label in a dialog's definition list. */
function row(dialog: HTMLElement, label: string): string {
  const term = within(dialog).getByText(label, { selector: "dt" });
  return term.nextElementSibling!.textContent!;
}

describe("StatBand", () => {
  it("test_tiles_show_formatted_values", () => {
    mount();
    expect(screen.getByTestId("tile-value")).toHaveTextContent("Current value");
    expect(screen.getByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
    expect(screen.getByTestId("tile-invested")).toHaveTextContent("Invested");
    expect(screen.getByTestId("tile-invested-figure")).toHaveTextContent("₹1,600");
    expect(screen.getByTestId("tile-gain")).toHaveTextContent("Total gain");
    expect(screen.getByTestId("tile-gain-figure")).toHaveTextContent("+₹650");
    expect(screen.getByTestId("tile-gain-sub")).toHaveTextContent("+40.6%");
    expect(screen.getByTestId("tile-xirr")).toHaveTextContent("XIRR");
    expect(screen.getByTestId("tile-xirr-figure")).toHaveTextContent("12.3%");
    expect(screen.getByTestId("tile-ter")).toHaveTextContent("Expense ratio");
    expect(screen.getByTestId("tile-ter-figure")).toHaveTextContent("0.70%");
    expect(screen.getByTestId("tile-ter-sub")).toHaveTextContent("Direct Plan");
  });

  it("the five tiles are in one band, in the order value, invested, gain, XIRR, expense ratio", () => {
    mount();
    const band = screen.getByRole("group", { name: "Key figures" });
    expect(within(band).getAllByRole("button").map(tile => tile.getAttribute("data-testid"))).toEqual(
      ["tile-value", "tile-invested", "tile-gain", "tile-xirr", "tile-ter"],
    );
  });

  it("test_share_of_portfolio_shown_under_the_value_and_hidden_when_null", () => {
    mount();
    expect(screen.getByTestId("tile-value-sub")).toHaveTextContent("94.5% of portfolio");
    // The real member-scope golden has no share (a member's share of the household is not computed): the line is hidden.
    const memberView = fixture<SummaryResponse>("summary_member");
    expect(memberView.tiles.share_of_portfolio_pct).toBeNull();
    mount(memberView);
    expect(screen.getAllByTestId("tile-value")).toHaveLength(2);
    expect(within(screen.getAllByTestId("tile-value")[1]).queryByTestId("tile-value-sub")).toBeNull();
  });

  it("test_xirr_has_no_sub_line, and neither has Invested", () => {
    mount();
    expect(screen.queryByTestId("tile-xirr-sub")).toBeNull();
    expect(screen.queryByTestId("tile-invested-sub")).toBeNull();
  });

  it("a missing XIRR or expense ratio reads a dash", () => {
    // The CAS-only golden has no expense ratio but does have an XIRR (12.9%); the contract also allows a null XIRR, so blank it.
    const cas = fixture<SummaryResponse>("summary_cas_only");
    expect(cas.tiles.xirr).toBe("0.1292258326537757773518355219");
    cas.tiles.xirr = null;
    mount(cas);
    expect(screen.getByTestId("tile-xirr-figure")).toHaveTextContent("—");
    expect(screen.getByTestId("tile-ter-figure")).toHaveTextContent("—");
    expect(screen.queryByTestId("tile-ter-sub")).toBeNull();
  });

  it("test_gain_is_positive_text_colour_and_loss_negative", () => {
    mount();
    expect(screen.getByTestId("tile-gain-figure")).toHaveAttribute("data-direction", "up");
    expect(screen.getByTestId("tile-gain-figure").className).toContain("text-[var(--pos-text)]");
    const loss = fixture<SummaryResponse>("summary_family");
    loss.tiles.total_gain = "-120.40";
    loss.tiles.total_gain_pct = "-7.5000";
    mount(loss);
    const figure = screen.getAllByTestId("tile-gain-figure")[1];
    expect(figure).toHaveTextContent("-₹120");
    expect(figure).toHaveAttribute("data-direction", "down");
    expect(figure.className).toContain("text-[var(--neg-text)]");
    expect(screen.getAllByTestId("tile-gain-sub")[1]).toHaveTextContent("-7.5%");
  });

  it("test_each_tile_opens_its_drilldown_with_enter_and_click, and Escape closes it", () => {
    mount();
    const titles: [string, string][] = [["tile-value", "Current value"], ["tile-invested", "Invested"], ["tile-gain", "Total gain"], ["tile-xirr", "XIRR"], ["tile-ter", "Expense ratio"]];
    for (const [id, title] of titles) {
      fireEvent.click(screen.getByTestId(id));
      expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.keyDown(screen.getByTestId(id), { key: "Enter" });
      expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
      fireEvent.keyDown(screen.getByTestId(id), { key: " " });
      expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    }
  });

  it("every tile is a focusable button with a dialog popup", () => {
    mount();
    for (const tile of within(screen.getByRole("group", { name: "Key figures" })).getAllByRole("button")) {
      expect(tile).toHaveAttribute("tabindex", "0");
      expect(tile).toHaveAttribute("aria-haspopup", "dialog");
    }
  });

  it("other keys do not open a drill-down", () => {
    mount();
    fireEvent.keyDown(screen.getByTestId("tile-value"), { key: "a" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the Current value drill-down lists units, NAV, the NAV date and each folio with its member", () => {
    mount();
    fireEvent.click(screen.getByTestId("tile-value"));
    const dialog = screen.getByRole("dialog");
    expect(row(dialog, "Current value")).toBe("₹2,250");
    expect(row(dialog, "Units")).toBe("150.000");
    expect(row(dialog, "Current NAV")).toBe("₹15.00");
    expect(row(dialog, "NAV as of")).toBe("23 Oct 2026");
    expect(row(dialog, "ASHA RAO")).toBe("XXXXX9183");
    expect(row(dialog, "Dev Rao")).toBe("XXXXX5678");
  });

  it("the Invested, Total gain and Expense ratio drill-downs show their figures", () => {
    mount();
    fireEvent.click(screen.getByTestId("tile-invested"));
    let dialog = screen.getByRole("dialog");
    expect(row(dialog, "Invested amount")).toBe("₹1,600");
    expect(row(dialog, "Average NAV")).toBe("₹10.67");
    expect(row(dialog, "First investment")).toBe("01 Jan 2025");
    expect(row(dialog, "Last investment")).toBe("01 Jun 2025");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

    fireEvent.click(screen.getByTestId("tile-gain"));
    dialog = screen.getByRole("dialog");
    expect(row(dialog, "Total gain")).toBe("+₹650");
    expect(row(dialog, "Return")).toBe("+40.6%");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

    fireEvent.click(screen.getByTestId("tile-ter"));
    dialog = screen.getByRole("dialog");
    expect(row(dialog, "This plan")).toBe("0.70%");
    expect(row(dialog, "Plan")).toBe("Direct");
    expect(row(dialog, "As of")).toBe("30 Sep 2026");
  });

  it("the XIRR drill-down gives the rate, the period and the explanation", () => {
    mount();
    fireEvent.click(screen.getByTestId("tile-xirr"));
    const dialog = screen.getByRole("dialog");
    expect(row(dialog, "Your XIRR")).toBe("12.3%");
    expect(row(dialog, "Period")).toBe("01 Jan 2025 to 23 Oct 2026");
    expect(dialog).toHaveTextContent("XIRR weighs when your money went in, so it differs from the fund's own return table.");
  });

  it("the score card sits beside the band and opens its own dialog", () => {
    mount();
    expect(within(screen.getByTestId("score-card")).getByTestId("score-number")).toHaveTextContent("79");
    fireEvent.click(screen.getByTestId("score-card"));
    expect(screen.getByRole("dialog", { name: "Unifolio Fund Score" })).toBeInTheDocument();
  });

  it("the score is its own section: a loading or failed score leaves the tiles showing", () => {
    mount(undefined, { score: score({ status: "loading", data: null }) });
    expect(screen.getByRole("status", { name: "Loading score" })).toBeInTheDocument();
    expect(screen.getByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
  });

  it("test_not_held_replaces_tiles_with_message_and_link_to_combined (the score card stays)", () => {
    const setAggregate = vi.fn();
    // The real not-held golden is scoped to Dev Rao, and only ASHA RAO holds the fund.
    mount(fixture<SummaryResponse>("summary_not_held"), {}, { members, viewMode: "member", memberId: IDS.dev, setAggregate });
    expect(screen.getByTestId("not-held")).toHaveTextContent("Not held by Dev Rao");
    expect(screen.getByTestId("not-held")).toHaveTextContent("Held by ASHA RAO.");
    expect(screen.queryByTestId("tile-value")).toBeNull();
    expect(screen.getByTestId("score-card")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Family Combined" }));
    expect(setAggregate).toHaveBeenCalledTimes(1);
  });

  it("when two members hold the fund the not-held line names both, in the API order", () => {
    const body = fixture<SummaryResponse>("summary_not_held");
    body.held_by_other_members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.meera, name: "Meera Rao" }];
    mount(body, {}, { members, viewMode: "member", memberId: IDS.dev });
    expect(screen.getByTestId("not-held")).toHaveTextContent("Held by ASHA RAO, Meera Rao.");
  });

  it("while a new member's figures load the tiles show a loading status instead of the old member's numbers", () => {
    mount(undefined, { refreshing: true });
    expect(screen.getByRole("status", { name: "Loading figures" })).toBeInTheDocument();
    expect(screen.queryByTestId("tile-value")).toBeNull();
    expect(screen.getByTestId("score-card")).toBeInTheDocument();
  });
});
