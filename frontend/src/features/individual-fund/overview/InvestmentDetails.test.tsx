import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInShell } from "@/shell/testing";
import { IDS, fixture } from "../fixtures";
import type { FolioNumberResponse, SummaryResponse } from "../types";
import { InvestmentDetails } from "./InvestmentDetails";

const api = vi.hoisted(() => ({ folioNumber: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.dev, name: "Dev Rao" }, { id: IDS.meera, name: "Meera Rao" }];
const FOLIO_ID_2 = IDS.folioDev;
const FULL_NUMBER = "4400918/3";

function mount(summary: SummaryResponse = fixture<SummaryResponse>("summary_family"), props: { refreshing?: boolean } = {}, scope = {}) {
  return renderInShell(<InvestmentDetails summary={summary} refreshing={props.refreshing} />, { scope });
}

const writeText = vi.fn();
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  setClipboard({ writeText });
  api.folioNumber.mockImplementation((_scheme: string, folio: string): Promise<FolioNumberResponse> =>
    Promise.resolve({ ...fixture<FolioNumberResponse>("folio_number"), folio_id: folio }));
});

afterEach(() => {
  setClipboard(undefined);
});

describe("InvestmentDetails", () => {
  it("test_rows_and_current_nav_date_caption: nine rows in order with the formatted figures, and the NAV date beside the current NAV", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Your Investment Details" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Investment details" });
    const ids = within(list).getAllByRole("button").map(row => row.getAttribute("data-testid")).filter(id => id?.startsWith("detail-"));
    expect(ids).toEqual([
      "detail-units", "detail-average-nav", "detail-current-nav", "detail-invested", "detail-value", "detail-gain", "detail-xirr",
      "detail-first", "detail-last",
    ]);
    expect(screen.getByTestId("detail-units")).toHaveTextContent("Units");
    expect(screen.getByTestId("detail-units-value")).toHaveTextContent("150.000");
    expect(screen.getByTestId("detail-average-nav")).toHaveTextContent("Average NAV (invested)");
    expect(screen.getByTestId("detail-average-nav-value")).toHaveTextContent("₹10.67");
    expect(screen.getByTestId("detail-current-nav-value")).toHaveTextContent("₹15.00");
    expect(screen.getByTestId("detail-current-nav-asof")).toHaveTextContent("as of 23 Oct 2026");
    expect(screen.getByTestId("detail-invested")).toHaveTextContent("Invested amount");
    expect(screen.getByTestId("detail-invested-value")).toHaveTextContent("₹1,600");
    expect(screen.getByTestId("detail-value")).toHaveTextContent("Current value");
    expect(screen.getByTestId("detail-value-value")).toHaveTextContent("₹2,250");
    expect(screen.getByTestId("detail-gain")).toHaveTextContent("Gain / Loss");
    expect(screen.getByTestId("detail-gain-value")).toHaveTextContent("+₹650 (+40.6%)");
    expect(screen.getByTestId("detail-xirr-value")).toHaveTextContent("12.3%");
    expect(screen.getByTestId("detail-first")).toHaveTextContent("First investment");
    expect(screen.getByTestId("detail-first-value")).toHaveTextContent("01 Jan 2025");
    expect(screen.getByTestId("detail-last")).toHaveTextContent("Last investment");
    expect(screen.getByTestId("detail-last-value")).toHaveTextContent("01 Jun 2025");
  });

  it("the gain is coloured by its direction, and a loss reads with a minus", () => {
    mount();
    const gain = within(screen.getByTestId("detail-gain-value")).getByText(/650/);
    expect(gain).toHaveAttribute("data-direction", "up");
    expect(gain.className).toContain("text-[var(--pos-text)]");
    const loss = fixture<SummaryResponse>("summary_family");
    loss.details.gain = "-120.40";
    loss.details.gain_pct = "-7.5000";
    mount(loss);
    const lossFigure = within(screen.getAllByTestId("detail-gain-value")[1]).getByText(/120/);
    expect(lossFigure).toHaveTextContent("-₹120 (-7.5%)");
    expect(lossFigure).toHaveAttribute("data-direction", "down");
    expect(lossFigure.className).toContain("text-[var(--neg-text)]");
  });

  it("a missing figure reads a dash", () => {
    const cas = fixture<SummaryResponse>("summary_family");
    cas.details.xirr = null;
    cas.details.first_investment = null;
    cas.details.last_investment = null;
    mount(cas);
    expect(screen.getByTestId("detail-xirr-value")).toHaveTextContent("—");
    expect(screen.getByTestId("detail-last-value")).toHaveTextContent("—");
    expect(screen.getByTestId("detail-first-value")).toHaveTextContent("—");
  });

  it("test_update_is_disabled_with_tooltip: a greyed Update button that does nothing", () => {
    mount();
    const update = screen.getByRole("button", { name: "Update" });
    expect(update).toHaveAttribute("aria-disabled", "true");
    expect(update).toHaveAttribute("title", "Coming soon");
    fireEvent.click(update);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("test_folio_masked_until_copy: the masked number is shown, nothing is requested until the click, then the full number goes to the clipboard and is never rendered", async () => {
    mount();
    const folio = screen.getByRole("button", { name: "Copy folio number XXXXX9183" });
    expect(folio).toHaveTextContent("XXXXX9183");
    expect(screen.getByTestId(`folio-${IDS.folioAsha}`)).toHaveTextContent("Folio · ASHA RAO");
    expect(api.folioNumber).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(FULL_NUMBER);
    fireEvent.mouseEnter(folio);
    fireEvent.focus(folio);
    expect(api.folioNumber).not.toHaveBeenCalled();
    fireEvent.click(folio);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    expect(api.folioNumber).toHaveBeenCalledTimes(1);
    expect(api.folioNumber).toHaveBeenCalledWith(IDS.scheme, IDS.folioAsha);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(FULL_NUMBER);
    expect(document.body.textContent).not.toContain(FULL_NUMBER);
  });

  it("the Copied note goes away again after a moment", async () => {
    vi.useFakeTimers();
    try {
      mount();
      fireEvent.click(screen.getByRole("button", { name: "Copy folio number XXXXX9183" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(screen.getByText("Copied")).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(screen.queryByText("Copied")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failed request for the number says so and copies nothing", async () => {
    api.folioNumber.mockRejectedValue(new Error("down"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Copy folio number XXXXX9183" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy the folio number.");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("a clipboard that refuses, or is missing, says so too", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Copy folio number XXXXX9183" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy the folio number.");
    setClipboard(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Copy folio number XXXXX9183" }));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't copy the folio number.");
    expect(document.body.textContent).not.toContain(FULL_NUMBER);
  });

  it("test_family_scope_lists_each_folio_with_member: one row per folio, named by member, each copying its own number", async () => {
    mount();
    const first = screen.getByTestId(`folio-${IDS.folioAsha}`);
    const second = screen.getByTestId(`folio-${FOLIO_ID_2}`);
    expect(first).toHaveTextContent("Folio · ASHA RAO");
    expect(first).toHaveTextContent("XXXXX9183");
    expect(second).toHaveTextContent("Folio · Dev Rao");
    expect(second).toHaveTextContent("XXXXX5678");
    fireEvent.click(within(second).getByRole("button", { name: "Copy folio number XXXXX5678" }));
    await screen.findByText("Copied");
    expect(api.folioNumber).toHaveBeenCalledWith(IDS.scheme, FOLIO_ID_2);
  });

  it("a member view lists only that member's own folio and figures (the real member golden is Dev Rao's)", () => {
    mount(fixture<SummaryResponse>("summary_member"), {}, { members, viewMode: "member", memberId: IDS.dev });
    expect(screen.getByTestId("detail-units-value")).toHaveTextContent("50.000");
    expect(screen.getByTestId("detail-average-nav-value")).toHaveTextContent("₹12.00");
    expect(screen.getByTestId("detail-invested-value")).toHaveTextContent("₹600");
    expect(screen.getByTestId("detail-value-value")).toHaveTextContent("₹750");
    expect(screen.getByTestId("detail-gain-value")).toHaveTextContent("+₹150 (+25.0%)");
    expect(screen.getByTestId("detail-xirr-value")).toHaveTextContent("17.4%");
    expect(screen.getByTestId(`folio-${IDS.folioDev}`)).toHaveTextContent("XXXXX5678");
    expect(screen.queryByTestId(`folio-${IDS.folioAsha}`)).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy folio number XXXXX9183" })).toBeNull();
  });

  it("test_rows_open_matching_drilldown: each row opens the dialog of its tile, with click, Enter and Space, and Escape closes it", () => {
    mount();
    const expected: [string, string][] = [
      ["detail-units", "Current value"], ["detail-average-nav", "Invested"], ["detail-current-nav", "Current value"],
      ["detail-invested", "Invested"], ["detail-value", "Current value"], ["detail-gain", "Total gain"], ["detail-xirr", "XIRR"],
      ["detail-first", "Invested"], ["detail-last", "Invested"],
    ];
    for (const [id, title] of expected) {
      fireEvent.click(screen.getByTestId(id));
      expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    fireEvent.keyDown(screen.getByTestId("detail-xirr"), { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "XIRR" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(screen.getByTestId("detail-gain"), { key: " " });
    expect(screen.getByRole("dialog", { name: "Total gain" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(screen.getByTestId("detail-gain"), { key: "a" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("every row is a focusable button with a dialog popup", () => {
    mount();
    for (const row of within(screen.getByRole("list", { name: "Investment details" })).getAllByRole("button").filter(r => r.getAttribute("data-testid")?.startsWith("detail-"))) {
      expect(row).toHaveAttribute("tabindex", "0");
      expect(row).toHaveAttribute("aria-haspopup", "dialog");
    }
  });

  it("test_not_held: a member who does not hold the fund sees the short message and no figures, and the heading stays", () => {
    mount(fixture<SummaryResponse>("summary_not_held"), {}, { members, viewMode: "member", memberId: IDS.dev });
    expect(screen.getByRole("heading", { name: "Your Investment Details" })).toBeInTheDocument();
    expect(screen.getByTestId("details-not-held")).toHaveTextContent("Not held by Dev Rao.");
    expect(screen.queryByTestId("detail-units")).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy folio number/ })).toBeNull();
  });

  it("while a new member's figures load it shows a loading status instead of the old member's numbers", () => {
    mount(undefined, { refreshing: true });
    expect(screen.getByRole("status", { name: "Loading investment details" })).toBeInTheDocument();
    expect(screen.queryByTestId("detail-units")).toBeNull();
    expect(screen.getByRole("heading", { name: "Your Investment Details" })).toBeInTheDocument();
  });
});
