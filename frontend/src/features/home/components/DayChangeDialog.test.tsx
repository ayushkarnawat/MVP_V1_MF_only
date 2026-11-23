import { useState } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderInShell as render } from "@/shell/testing";
import { fixture } from "../fixtures";
import type { MoverAllBarOut, MoversAllResponse, MoversResponse } from "../types";
import { DayChangeDialog, type DayChangeDialogProps } from "./DayChangeDialog";

const dialogName = "Everything that changed today";
const loadingCopy = /Loading every fund/i;
const noChange = /^No change\b/i;

function fundRow(id: number, label: string, change: string): MoverAllBarOut {
  const key = `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
  return {
    key,
    label,
    change,
    no_change: change === "0.00",
    funds: [{ scheme_id: key, name: label, change }],
  };
}

const aster = fundRow(1, "Aster Equity Fund", "100.00");
const birch = fundRow(2, "Birch Equity Fund", "60.00");
const clover = fundRow(3, "Clover Gold Fund", "20.00");
const dune = fundRow(4, "Dune Small Cap Fund", "-50.00");
const elm = fundRow(5, "Elm Flexi Cap Fund", "-30.00");
const fern = fundRow(6, "Fern Overnight Fund", "0.00");

const fundCard: MoversResponse = {
  ...fixture<MoversResponse>("movers_fund"),
  net_change: "100.00",
  net_pct: "2.0000",
  previous_value: "5000.00",
  gains: [
    { key: aster.key, label: aster.label, change: aster.change, funds: aster.funds },
    { key: birch.key, label: birch.label, change: birch.change, funds: birch.funds },
  ],
  losses: [
    { key: dune.key, label: dune.label, change: dune.change, funds: dune.funds },
    { key: elm.key, label: elm.label, change: elm.change, funds: elm.funds },
  ],
  others_count: 2,
  others_change: "20.00",
};

const fundAll: MoversAllResponse = {
  ...fundCard,
  rows: [aster, birch, clover, dune, elm, fern],
  waiting_for_price: [],
};

function show(overrides: Partial<DayChangeDialogProps> = {}) {
  const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue(fundAll);
  render(
    <DayChangeDialog
      open
      onClose={vi.fn()}
      initialView="fund"
      card={fundCard}
      loadAll={loadAll}
      hideValues={false}
      {...overrides}
    />,
  );
  return loadAll;
}

function getDialog() {
  return screen.getByRole("dialog", { name: dialogName });
}

function expectFundSummary(dialog: HTMLElement) {
  expect(dialog).toHaveTextContent("+₹100");
  expect(dialog).toHaveTextContent(/\+2(?:\.0+)?%/);
  expect(dialog).toHaveTextContent(/Gained\s*₹180\b/);
  expect(dialog).toHaveTextContent(/Lost\s*₹80\b/);
}

describe("DayChangeDialog", () => {
  it("opens at once with net change and totals copied from the card and a placeholder list", () => {
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>(() => new Promise(() => {}));
    show({ loadAll });

    const dialog = getDialog();
    expectFundSummary(dialog);
    expect(within(dialog).getByText(loadingCopy)).toBeVisible();
    expect(within(dialog).queryByText(aster.label)).toBeNull();
    expect(loadAll).toHaveBeenCalledExactlyOnceWith("fund");
  });

  it('fund view: gainers then losers largest first, collapsed "No change" group', async () => {
    show();
    const dialog = within(getDialog());
    await dialog.findByText(clover.label);

    const orderedNames = [aster.label, birch.label, clover.label, dune.label, elm.label];
    expect(dialog.getAllByText(text => orderedNames.includes(text)).map(node => node.textContent))
      .toEqual(orderedNames);
    expect(dialog.getByRole("button", { name: noChange, expanded: false })).toBeVisible();
    expect(dialog.queryByText(fern.label)).toBeNull();
    expect(dialog.getByText("Rows add up to the net change.")).toBeVisible();
  });

  // Stage 4, decided 20 Nov: the fund rows carry no category, so the FIRST visit to a view asks the route for that
  // view (one `loadAll(view)` each); every later visit to a view already fetched reuses its rows with no new request.
  it("a view is fetched once on its first visit and reused after that", async () => {
    const categoryAll: MoversAllResponse = {
      ...fundAll,
      view: "category",
      requested_view: "category",
      rows: [{ key: "Large Cap", label: "Large Cap", change: "160.00", funds: [...aster.funds, ...birch.funds], no_change: false }],
    };
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>(async view => (view === "category" ? categoryAll : fundAll));
    show({ loadAll });

    const dialog = within(getDialog());
    await dialog.findByText(clover.label);
    const group = dialog.getByRole("group", { name: "Group by" });
    fireEvent.click(within(group).getByRole("button", { name: "Category" }));
    await dialog.findByRole("button", { name: /Large Cap/i });
    fireEvent.click(within(group).getByRole("button", { name: "Fund" }));
    await dialog.findByText(clover.label);
    fireEvent.click(within(group).getByRole("button", { name: "Category" }));
    await dialog.findByRole("button", { name: /Large Cap/i });

    expect(loadAll.mock.calls.map(call => call[0])).toEqual(["fund", "category"]);
  });

  it("category row opens its funds", async () => {
    const largeCap = { key: "Large Cap", label: "Large Cap", change: "160.00", funds: [...aster.funds, ...birch.funds] };
    const categoryCard: MoversResponse = {
      ...fundCard,
      view: "category",
      requested_view: "category",
      gains: [largeCap, { key: "Gold", label: "Gold", change: "20.00", funds: clover.funds }],
      losses: [
        { key: "Small Cap", label: "Small Cap", change: "-50.00", funds: dune.funds },
        { key: "Flexi Cap", label: "Flexi Cap", change: "-30.00", funds: elm.funds },
      ],
      others_count: 1,
      others_change: "0.00",
    };
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue({
      ...categoryCard,
      rows: [
        ...[...categoryCard.gains, ...categoryCard.losses].map(row => ({ ...row, no_change: false })),
        { key: "Overnight", label: "Overnight", change: "0.00", funds: fern.funds, no_change: true },
      ],
      waiting_for_price: [],
    });
    show({ initialView: "category", card: categoryCard, loadAll });

    const dialog = within(getDialog());
    const category = await dialog.findByRole("button", { name: /Large Cap/i, expanded: false });
    expect(dialog.queryByText(aster.label)).toBeNull();
    expect(dialog.queryByText(birch.label)).toBeNull();
    fireEvent.click(category);

    expect(category).toHaveAttribute("aria-expanded", "true");
    expect(dialog.getByText(aster.label)).toBeVisible();
    expect(dialog.getByText(birch.label)).toBeVisible();
    expect(dialog.queryByText(dune.label)).toBeNull();
    expect(loadAll).toHaveBeenCalledExactlyOnceWith("category");
  });

  it("sector view shows the Estimated badge and the estimate footer", async () => {
    const card = fixture<MoversResponse>("movers_sector");
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue({
      ...card,
      rows: card.gains.map(row => ({ ...row, no_change: false })),
      waiting_for_price: [],
    });
    show({ initialView: "sector", card, loadAll });

    const dialog = within(getDialog());
    expect(await dialog.findByText("Banks")).toBeVisible();
    expect(dialog.getByText("Estimated")).toBeVisible();
    expect(dialog.getByText(/each fund.s change is spread over its sectors.*sector gained and lost totals differ from the fund view/i))
      .toHaveTextContent("Rows still add up to the net change.");
    expect(loadAll).toHaveBeenCalledExactlyOnceWith("sector");
  });

  it("waiting funds are listed apart with the clock mark, never as zero, with a Partial badge", async () => {
    const waiting = [
      { fund_id: "00000000-0000-4000-8000-000000000007", name: "Grove Debt Fund", category: "Corporate Bond" },
      { fund_id: "00000000-0000-4000-8000-000000000008", name: "Hazel Hybrid Fund", category: "Hybrid" },
    ];
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue({
      ...fundAll,
      partial: true,
      waiting_for_price: waiting,
    });
    show({ loadAll });

    const dialog = getDialog();
    const contents = within(dialog);
    const heading = await contents.findByText(/Waiting for today.s price/i);
    expect(contents.getByText(/^Partial\b/)).toBeVisible();
    for (const fund of waiting) {
      const name = contents.getByText(fund.name);
      expect(name).toBeVisible();
      expect(heading.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const clockMarks = dialog.querySelectorAll("svg[class*='lucide-clock']");
    const clockGlyphs = contents.queryAllByText("◷");
    expect(clockMarks.length + clockGlyphs.length).toBe(waiting.length);
    expect(dialog).not.toHaveTextContent(/₹\s*0\b/);
    expect(contents.queryByText(fern.label)).toBeNull();
  });

  it("a fund priced only from a statement is worded as that, not as a late price, and is not a Partial reason", async () => {
    const waiting = [
      { fund_id: "00000000-0000-4000-8000-000000000007", name: "Grove Debt Fund", category: "Corporate Bond", reason: "no_new_price" as const },
      { fund_id: "00000000-0000-4000-8000-000000000009", name: "Ivy Unlisted Fund", category: "Other", reason: "statement_priced" as const },
    ];
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue({ ...fundAll, partial: false, waiting_for_price: waiting });
    show({ loadAll });

    const contents = within(getDialog());
    const late = await contents.findByText(/Waiting for today.s price/i);
    expect(late).toHaveTextContent(/1 fund\b/);
    const statement = contents.getByTestId("statement-priced-block");
    expect(statement).toHaveTextContent(/Priced from your statement only/i);
    expect(statement).toHaveTextContent(/no daily price/i);
    expect(within(statement).getByText("Ivy Unlisted Fund")).toBeVisible();
    expect(statement).not.toHaveTextContent(/price expected later today/i);
    // Partial names only the late fund; the statement-priced fund is never a reason for it.
    expect(contents.getByLabelText(/^Partial data\. Missing: Grove Debt Fund$/)).toBeVisible();
  });

  it("on a day with no new price it lists the last price day's rows with a one-line note, not an empty list", async () => {
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue({
      ...fundAll,
      computed_at: "2026-10-24T13:00:00Z",
      nav_as_of: "2026-10-23",
    });
    show({ card: { ...fundCard, computed_at: "2026-10-24T13:00:00Z" }, loadAll });

    const contents = within(getDialog());
    expect(await contents.findByText(aster.label)).toBeVisible();
    expect(contents.getByTestId("price-day-note")).toHaveTextContent(/Prices as on Friday,? 23 Oct 2026\./);
    expect(contents.queryByText(/Markets were closed today/i)).toBeNull();
  });

  it("when every fund is waiting for a price the waiting funds are listed, not a markets-closed message", async () => {
    // Review, 20 Nov: empty rows with a flat net change used to read as "markets were closed" and hide the waiting list.
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue({
      ...fundAll,
      net_change: "0.00",
      net_pct: "0.0000",
      rows: [],
      waiting_for_price: [
        { fund_id: "00000000-0000-4000-8000-000000000007", name: "Grove Debt Fund", category: "Corporate Bond", reason: "no_new_price" as const },
        { fund_id: "00000000-0000-4000-8000-000000000009", name: "Ivy Unlisted Fund", category: "Other", reason: "statement_priced" as const },
      ],
    });
    show({ loadAll });

    const contents = within(getDialog());
    expect(await contents.findByText("Grove Debt Fund")).toBeVisible();
    expect(contents.getByText("Ivy Unlisted Fund")).toBeVisible();
    expect(contents.queryByText(/Markets were closed today/i)).toBeNull();
  });

  it("the price-day note follows the server's date, and is absent when the prices are from that day", async () => {
    // 05:00 UTC on 24 Oct is 10:30 IST on 24 Oct: prices dated 24 Oct are from today, so no note.
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue({
      ...fundAll,
      computed_at: "2026-10-24T05:00:00Z",
      nav_as_of: "2026-10-24",
    });
    show({ card: { ...fundCard, computed_at: "2026-10-24T05:00:00Z" }, loadAll });

    const contents = within(getDialog());
    expect(await contents.findByText(aster.label)).toBeVisible();
    expect(contents.queryByTestId("price-day-note")).toBeNull();
  });

  it("on an earlier price day a late fund is not described as expected later today", async () => {
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue({
      ...fundAll,
      computed_at: "2026-10-24T13:00:00Z",
      nav_as_of: "2026-10-23",
      partial: true,
      waiting_for_price: [
        { fund_id: "00000000-0000-4000-8000-000000000007", name: "Grove Debt Fund", category: "Corporate Bond", reason: "no_new_price" as const },
      ],
    });
    show({ card: { ...fundCard, computed_at: "2026-10-24T13:00:00Z" }, loadAll });

    const contents = within(getDialog());
    expect(await contents.findByText("Grove Debt Fund")).toBeVisible();
    expect(contents.getByText(/^Waiting for a price/i)).toBeVisible();
    expect(contents.queryByText(/today.s price/i)).toBeNull();
    expect(contents.queryByText(/expected later today/i)).toBeNull();
  });

  it("the no-change group opens", async () => {
    const loadAll = show();
    const dialog = within(getDialog());
    const toggle = await dialog.findByRole("button", { name: noChange, expanded: false });
    expect(dialog.queryByText(fern.label)).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(dialog.getByText(fern.label)).toBeVisible();
    expect(loadAll).toHaveBeenCalledExactlyOnceWith("fund");
  });

  it("markets closed shows the message with the latest price date", async () => {
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue({
      ...fundAll,
      computed_at: "2026-10-24T13:00:00Z",
      nav_as_of: "2026-10-23",
      net_change: "0.00",
      net_pct: "0.0000",
      gains: [],
      losses: [],
      others_count: 0,
      others_change: "0.00",
      rows: [],
    });
    show({ card: { ...fundCard, computed_at: "2026-10-24T13:00:00Z" }, loadAll });

    const dialog = within(getDialog());
    expect(await dialog.findByText("Markets were closed today")).toBeVisible();
    expect(dialog.getByText(/No fund had a new price\. Prices as on Friday,? 23 Oct 2026\./)).toBeVisible();
  });

  it("an error keeps the summary and offers Try again, which repeats the fetch", async () => {
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>()
      .mockRejectedValueOnce(new Error("Full list failed"))
      .mockResolvedValueOnce(fundAll);
    show({ loadAll });

    const dialog = getDialog();
    const contents = within(dialog);
    expect(await contents.findByText(/We couldn.t load the full list/i)).toBeVisible();
    expectFundSummary(dialog);
    expect(loadAll).toHaveBeenCalledExactlyOnceWith("fund");

    fireEvent.click(contents.getByRole("button", { name: "Try again" }));

    expect(contents.getByText(loadingCopy)).toBeVisible();
    expectFundSummary(dialog);
    expect(await contents.findByText(clover.label)).toBeVisible();
    expect(contents.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(loadAll.mock.calls).toEqual([["fund"], ["fund"]]);
  });

  it("hide values turns rupees into dots and leaves percentages", async () => {
    show({ hideValues: true });
    const dialog = getDialog();
    expect(await within(dialog).findByText(clover.label)).toBeVisible();
    expect(dialog).not.toHaveTextContent("₹");
    expect(dialog).toHaveTextContent(/Gained\s*•{5,}/);
    expect(dialog).toHaveTextContent(/Lost\s*•{5,}/);
    expect((dialog.textContent ?? "").match(/•{5,}/g)?.length).toBeGreaterThanOrEqual(8);
    expect(dialog).toHaveTextContent(/\+2(?:\.0+)?%/);
  });

  it("Escape, the cross and an outside click close it; focus is trapped inside and returns to the link", async () => {
    const onClose = vi.fn();
    const loadAll = vi.fn<DayChangeDialogProps["loadAll"]>().mockResolvedValue(fundAll);

    function DialogOpener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>View all by day's change</button>
          <DayChangeDialog open={open} onClose={() => { onClose(); setOpen(false); }}
            initialView="fund" card={fundCard} loadAll={loadAll} hideValues={false} />
        </>
      );
    }
    render(<DialogOpener />);
    const link = screen.getByRole("button", { name: "View all by day's change" });
    const openDialog = async () => {
      act(() => link.focus());
      fireEvent.click(link);
      const dialog = getDialog();
      await within(dialog).findByText(clover.label);
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      return dialog;
    };
    const expectClosed = async (calls: number) => {
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
        expect(link).toHaveFocus();
      });
      expect(onClose).toHaveBeenCalledTimes(calls);
    };

    const dialog = await openDialog();
    const focusables = dialog.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]");
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    act(() => last.focus());
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Escape" });
    await expectClosed(1);

    const reopened = await openDialog();
    const cross = within(reopened).getAllByRole("button", { name: "Close" })
      .find(button => button.querySelector("svg") || /[×✕]/.test(button.textContent ?? ""));
    expect(cross).toBeDefined();
    fireEvent.click(cross!);
    await expectClosed(2);

    await openDialog();
    await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); });
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    await expectClosed(3);
  });
});
