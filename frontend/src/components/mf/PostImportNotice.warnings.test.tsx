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
});
