import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ me: { user_id: "u-1" } as { user_id: string } | null }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

import { PostImportNotice } from "./PostImportNotice";

function Probe() {
  const location = useLocation();
  return <span data-testid="loc" data-state={JSON.stringify(location.state)}>{location.pathname + location.search + location.hash}</span>;
}

function mount(state: unknown, path = { pathname: "/portfolio/mutual-funds", search: "?sort=value&dir=asc", hash: "#holdings" }) {
  return render(<MemoryRouter initialEntries={[{ ...path, state }]}><PostImportNotice /><Probe /></MemoryRouter>);
}

const NOTICE = { text: "Ramesh: 9 transactions added", details: ["2 duplicates skipped", "1 fund needs a price"] };

beforeEach(() => { auth.me = { user_id: "u-1" }; });

describe("PostImportNotice", () => {
  it("shows the text and every detail line for the user it was written for", () => {
    mount({ importNotice: NOTICE, importNoticeUser: "u-1" });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Ramesh: 9 transactions added")).toBeInTheDocument();
    expect(screen.getByText("2 duplicates skipped")).toBeInTheDocument();
    expect(screen.getByText("1 fund needs a price")).toBeInTheDocument();
  });
  it("works without detail lines", () => {
    const { container } = mount({ importNotice: { text: "Ramesh: 9 transactions added" }, importNoticeUser: "u-1" });
    expect(screen.getByText("Ramesh: 9 transactions added")).toBeInTheDocument();
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
  it("shows nothing for another user's notice", () => {
    mount({ importNotice: NOTICE, importNoticeUser: "u-2" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Ramesh: 9 transactions added")).not.toBeInTheDocument();
  });
  it("shows nothing for a notice with no user attached", () => {
    mount({ importNotice: NOTICE });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("shows nothing while the signed-in user is not known", () => {
    auth.me = null;
    mount({ importNotice: NOTICE, importNoticeUser: "u-1" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("shows nothing for a null notice, an empty state or no state", () => {
    const first = mount({ importNotice: null, importNoticeUser: "u-1" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    first.unmount();
    const second = mount({});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    second.unmount();
    mount(null);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("dismisses by clearing the state and keeping the address", () => {
    mount({ importNotice: NOTICE, importNoticeUser: "u-1" });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss import notice" }));
    expect(screen.queryByText("Ramesh: 9 transactions added")).not.toBeInTheDocument();
    expect(screen.getByTestId("loc")).toHaveTextContent("/portfolio/mutual-funds?sort=value&dir=asc#holdings");
    expect(screen.getByTestId("loc")).toHaveAttribute("data-state", "null");
  });
});
const NEW_FUND = {
  scheme_id: "s1", scheme_name: "Alpha Flexi Cap Fund", amc_name: "Alpha Mutual Fund", invested_amount: "150000.00",
  latest_transaction_date: "2026-10-28", transaction_count: 1,
  transactions: [{ date: "2026-10-28", type: "PURCHASE", amount: "150000.00", units: "1000.0000" }],
};

describe("PostImportNotice: new funds (UI round 2, change 8)", () => {
  const WITH = { text: "Import complete · 1 new fund, 1 transaction added", details: ["New funds: Alpha Flexi Cap Fund"], newFunds: [NEW_FUND] };
  it("shows a View new funds button only when the notice carries new funds", () => {
    const { unmount } = mount({ importNotice: WITH, importNoticeUser: "u-1" });
    expect(screen.getByRole("button", { name: "View new funds" })).toBeInTheDocument();
    unmount();
    mount({ importNotice: NOTICE, importNoticeUser: "u-1" });
    expect(screen.queryByRole("button", { name: "View new funds" })).toBeNull();
  });
  it("opens the list in a pop-up and Esc closes it, leaving the notice", () => {
    mount({ importNotice: WITH, importNoticeUser: "u-1" });
    fireEvent.click(screen.getByRole("button", { name: "View new funds" }));
    const dialog = screen.getByRole("dialog", { name: "New funds in this statement" });
    expect(within(dialog).getByRole("button", { name: /Alpha Flexi Cap Fund/ })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Import complete · 1 new fund, 1 transaction added")).toBeInTheDocument();
  });
  it("the pop-up offers View all in Import History for a fund with more transactions than listed", () => {
    mount({ importNotice: { ...WITH, newFunds: [{ ...NEW_FUND, transaction_count: 30 }] }, importNoticeUser: "u-1" });
    fireEvent.click(screen.getByRole("button", { name: "View new funds" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Alpha Flexi Cap Fund/ }));
    expect(screen.getByRole("link", { name: "View all in Import History" })).toHaveAttribute("href", "/profile/settings/import-history");
  });
  it("Dismiss still clears the notice and its state", () => {
    mount({ importNotice: WITH, importNoticeUser: "u-1" });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss import notice" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
