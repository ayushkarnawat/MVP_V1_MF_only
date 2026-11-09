import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ me: { user_id: "u-1" } }) }));

import { PostImportNotice } from "./PostImportNotice";

describe("PostImportNotice: a warning is shown once (QA fixes, A1)", () => {
  it("a single-person import with only a warning shows the warning once, not as a detail line and again as a warning", () => {
    const notice = { text: "3 transactions added", details: ["One fund needs a price"], warnings: ["One fund needs a price"] };
    render(<MemoryRouter initialEntries={[{ pathname: "/x", state: { importNotice: notice, importNoticeUser: "u-1" } }]}><PostImportNotice /></MemoryRouter>);
    expect(screen.getAllByText("One fund needs a price")).toHaveLength(1);
  });
  it("an older notice without a warnings field still shows its detail lines", () => {
    const notice = { text: "3 transactions added", details: ["One fund needs a price"] };
    render(<MemoryRouter initialEntries={[{ pathname: "/x", state: { importNotice: notice, importNoticeUser: "u-1" } }]}><PostImportNotice /></MemoryRouter>);
    expect(screen.getAllByText("One fund needs a price")).toHaveLength(1);
  });
  const many = (count: number) => ({
    text: "Import complete · 3 new funds, 9 transactions added",
    counts: { newFunds: 3, added: 9, skipped: 0 },
    warnings: Array.from({ length: count }, (_, index) => `Skipped transaction ${index + 1}`),
  });
  const show = (notice: object) =>
    render(<MemoryRouter initialEntries={[{ pathname: "/x", state: { importNotice: notice, importNoticeUser: "u-1" } }]}><PostImportNotice /></MemoryRouter>);

  it("shows at most two warnings and counts the rest, so a long list does not fill the page", () => {
    show(many(7));
    expect(screen.getByText("Skipped transaction 1")).toBeInTheDocument();
    expect(screen.getByText("Skipped transaction 2")).toBeInTheDocument();
    expect(screen.queryByText("Skipped transaction 3")).toBeNull();
    expect(screen.getByText("+5 more notes")).toBeInTheDocument();
  });
  it("says '+1 more note' for exactly three warnings", () => {
    show(many(3));
    expect(screen.getByText("+1 more note")).toBeInTheDocument();
    expect(screen.queryByText("Skipped transaction 3")).toBeNull();
  });
  it("shows two warnings or fewer in full with no counter", () => {
    show(many(2));
    expect(screen.getByText("Skipped transaction 2")).toBeInTheDocument();
    expect(screen.queryByText(/more note/)).toBeNull();
  });
});
