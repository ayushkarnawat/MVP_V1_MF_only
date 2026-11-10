import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ me: { user_id: "u-1" } as { user_id: string } | null }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

import { PostImportNotice } from "./PostImportNotice";

function Probe() {
  const location = useLocation();
  return <span data-testid="loc" data-state={JSON.stringify(location.state)}>{location.pathname}</span>;
}
function mount(state: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/portfolio/mutual-funds", state }]}>
      <PostImportNotice />
      <Probe />
    </MemoryRouter>,
  );
}

const BASE_FUND = {
  scheme_id: "s1", scheme_name: "Alpha Flexi Cap Fund", amc_name: "Alpha Mutual Fund", invested_amount: "150000.00",
  latest_transaction_date: "2026-10-28", transaction_count: 1,
  transactions: [{ date: "2026-10-28", type: "PURCHASE", amount: "150000.00", units: "1000.0000" }],
};
const FUNDS = ["HDFC Children's Fund", "HDFC Flexi Cap Fund", "UTI Nifty 50 Index Fund", "SBI Large Cap Fund", "Axis Bluechip Fund", "Kotak Emerging Equity Fund"]
  .map((name, index) => ({ ...BASE_FUND, scheme_id: `s${index}`, scheme_name: name }));
const CARD_NOTICE = {
  text: "Import complete · 6 new funds, 448 transactions added",
  details: ["Suresh Raman Iyer: 289 added", "Lakshmi Suresh Iyer: 159 added", "New funds: HDFC Children's Fund, HDFC Flexi Cap Fund and 4 more"],
  newFunds: FUNDS,
  counts: { newFunds: 6, added: 448, skipped: 0 },
  members: [{ name: "Suresh Raman Iyer", added: 289, skipped: 0 }, { name: "Lakshmi Suresh Iyer", added: 159, skipped: 2 }],
  warnings: ["One fund needs a price"],
};

beforeEach(() => { auth.me = { user_id: "u-1" }; });

describe("PostImportNotice: the structured card (QA fixes, A1)", () => {
  it("is a status card with a title, a summary line and an icon-only close button", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
    const card = screen.getByTestId("import-notice-card");
    expect(card).toHaveAttribute("role", "status");
    expect(within(card).getByTestId("import-notice-title")).toHaveTextContent("Import complete");
    expect(within(card).getByTestId("import-notice-summary").textContent).toBe("6 new funds · 448 transactions added");
    expect(within(card).getByTestId("import-notice-summary").querySelector("b")?.textContent).toBe("6 new funds");
    const close = within(card).getByRole("button", { name: "Dismiss import notice" });
    expect(close.textContent).toBe("");
    expect(close.querySelector("svg")).not.toBeNull();
  });
  it("uses singular words for one new fund and one transaction", () => {
    mount({ importNotice: { ...CARD_NOTICE, newFunds: [FUNDS[0]], counts: { newFunds: 1, added: 1, skipped: 0 }, members: undefined, details: undefined }, importNoticeUser: "u-1" });
    expect(screen.getByTestId("import-notice-summary").textContent).toBe("1 new fund · 1 transaction added");
  });
  it("adds the skipped count to the summary line only when something was skipped", () => {
    mount({ importNotice: { ...CARD_NOTICE, counts: { newFunds: 6, added: 448, skipped: 12 } }, importNoticeUser: "u-1" });
    expect(screen.getByTestId("import-notice-summary").textContent).toBe("6 new funds · 448 transactions added · 12 duplicates skipped");
    expect(screen.getByTestId("import-notice-skipped").textContent).toBe("12 duplicates skipped");
  });
  it("says '1 duplicate skipped' for one, and adds no line of its own", () => {
    const { container } = mount({ importNotice: { ...CARD_NOTICE, counts: { newFunds: 6, added: 448, skipped: 1 } }, importNoticeUser: "u-1" });
    expect(screen.getByTestId("import-notice-skipped").textContent).toBe("1 duplicate skipped");
    expect(container.querySelectorAll("[data-testid='import-notice-summary']")).toHaveLength(1);
  });
  it("leaves the summary line unchanged when nothing was skipped", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
    expect(screen.queryByTestId("import-notice-skipped")).toBeNull();
  });
  it("does not put a skipped line in the View new funds pop-up", () => {
    mount({ importNotice: { ...CARD_NOTICE, counts: { newFunds: 6, added: 448, skipped: 12 } }, importNoticeUser: "u-1" });
    fireEvent.click(screen.getByRole("button", { name: "View new funds" }));
    expect(within(screen.getByRole("dialog")).queryByText(/skipped/)).toBeNull();
  });
  it("lets a very long fund name wrap inside the pop-up instead of cutting it off or stretching the list", () => {
    const LONG = "ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund) - Direct Plan - Growth Option";
    mount({ importNotice: { ...CARD_NOTICE, newFunds: [{ ...BASE_FUND, scheme_name: LONG }] }, importNoticeUser: "u-1" });
    fireEvent.click(screen.getByRole("button", { name: "View new funds" }));
    const name = within(screen.getByRole("dialog")).getByText(LONG);
    expect(name.className).not.toMatch(/truncate/);
    expect(name.className).toMatch(/break-words/);
    expect(name.closest("ul")?.className).toMatch(/min-w-0/);
  });
  it("shows one row per person with a count chip, and the already-saved count when there is one", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
    const rows = screen.getAllByTestId("import-notice-member");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Suresh Raman Iyer")).toBeInTheDocument();
    expect(within(rows[0]).getByText("289 added")).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/already saved/)).toBeNull();
    expect(within(rows[1]).getByText("159 added")).toBeInTheDocument();
    expect(within(rows[1]).getByText("2 already saved")).toBeInTheDocument();
  });
  it("shows no person rows for a single-person notice, and not the old per-person text lines either", () => {
    mount({ importNotice: { ...CARD_NOTICE, members: undefined }, importNoticeUser: "u-1" });
    expect(screen.queryByTestId("import-notice-members")).toBeNull();
    expect(screen.queryByText(/Suresh Raman Iyer: 289 added/)).toBeNull();
  });
  it("shows at most three fund chips under a New funds label, and counts the rest", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
    const chips = screen.getByTestId("import-notice-fund-chips");
    expect(within(chips).getByText("New funds")).toBeInTheDocument();
    const names = within(chips).getAllByTestId("import-notice-fund-chip").map(chip => chip.textContent);
    expect(names).toEqual(["HDFC Children's Fund", "HDFC Flexi Cap Fund", "UTI Nifty 50 Index Fund"]);
    expect(within(chips).getByText("+3 more")).toBeInTheDocument();
    expect(screen.queryByText(/New funds: /)).toBeNull();
  });
  it("shows every chip and no '+N more' for three funds or fewer", () => {
    mount({ importNotice: { ...CARD_NOTICE, newFunds: FUNDS.slice(0, 3), counts: { newFunds: 3, added: 5, skipped: 0 } }, importNoticeUser: "u-1" });
    expect(screen.getAllByTestId("import-notice-fund-chip")).toHaveLength(3);
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
  });
  it("gives a chip the full fund name as its tooltip", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
    expect(screen.getAllByTestId("import-notice-fund-chip")[0]).toHaveAttribute("title", "HDFC Children's Fund");
  });
  it("View new funds and Dismiss are two separate buttons that do not run together", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
    const view = screen.getByRole("button", { name: "View new funds" });
    const close = screen.getByRole("button", { name: "Dismiss import notice" });
    expect(view).not.toBe(close);
    expect(view.parentElement).not.toBe(close.parentElement);
    expect(screen.getByTestId("import-notice-card").textContent).not.toContain("View new fundsDismiss");
    expect(close).not.toHaveTextContent(/dismiss/i);
  });
  it("View new funds still opens the list pop-up", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
    fireEvent.click(screen.getByRole("button", { name: "View new funds" }));
    expect(screen.getByRole("dialog", { name: "New funds in this statement" })).toBeInTheDocument();
  });
  it("the close button clears the notice and keeps the address", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss import notice" }));
    expect(screen.queryByTestId("import-notice-card")).toBeNull();
    expect(screen.getByTestId("loc")).toHaveTextContent("/portfolio/mutual-funds");
    expect(screen.getByTestId("loc")).toHaveAttribute("data-state", "null");
  });
  it("lists the warnings as lines of their own", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
    expect(screen.getByText("One fund needs a price")).toBeInTheDocument();
  });
  it("a notice with several people and no new funds has the rows but no chips and no View new funds button", () => {
    mount({ importNotice: { text: "5 transactions added", details: ["Asha: 2 added", "Dev: 3 added"], members: [{ name: "Asha", added: 2, skipped: 0 }, { name: "Dev", added: 3, skipped: 0 }] }, importNoticeUser: "u-1" });
    expect(screen.getByTestId("import-notice-title")).toHaveTextContent("5 transactions added");
    expect(screen.getAllByTestId("import-notice-member")).toHaveLength(2);
    expect(screen.queryByTestId("import-notice-fund-chips")).toBeNull();
    expect(screen.queryByRole("button", { name: "View new funds" })).toBeNull();
    expect(screen.queryByText("Asha: 2 added")).toBeNull();
  });
  it("an older notice already in the history state (no counts, no members) still shows its text and its detail lines", () => {
    mount({ importNotice: { text: "Import complete · 1 new fund, 1 transaction added", details: ["Asha: 1 added", "New funds: Alpha Flexi Cap Fund"], newFunds: [BASE_FUND] }, importNoticeUser: "u-1" });
    expect(screen.getByTestId("import-notice-title")).toHaveTextContent("Import complete · 1 new fund, 1 transaction added");
    expect(screen.getByText("Asha: 1 added")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View new funds" })).toBeInTheDocument();
    expect(screen.queryByTestId("import-notice-summary")).toBeNull();
  });
  it("a text-only notice is still exactly one paragraph, inside the card", () => {
    const { container } = mount({ importNotice: { text: "This statement was already imported" }, importNoticeUser: "u-1" });
    expect(screen.getByTestId("import-notice-card")).toBeInTheDocument();
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
  it("is still shown only to the user it was written for", () => {
    mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-2" });
    expect(screen.queryByTestId("import-notice-card")).toBeNull();
  });
  it("never dismisses by itself", () => {
    vi.useFakeTimers();
    try {
      mount({ importNotice: CARD_NOTICE, importNoticeUser: "u-1" });
      act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
      expect(screen.getByTestId("import-notice-card")).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
});
