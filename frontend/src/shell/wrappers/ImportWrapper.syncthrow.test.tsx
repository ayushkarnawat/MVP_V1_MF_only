import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import ImportWrapper from "./ImportWrapper";

// Independent review of C-9, finding 5: a refreshMembers that throws synchronously (a double that is not async) must not stop the
// page from navigating back. The real provider is async; this guards the wrapper itself.
vi.mock("../../features/auth/AuthContext", () => ({ useAuth: () => ({ me: { user_id: "account-a" } }) }));
vi.mock("../scope/ScopeContext", () => ({
  useScope: () => ({
    members: [{ id: "a", name: "Alice" }], memberId: "a", viewMode: "member",
    refreshMembers: () => { throw new Error("boom"); }, setMember: vi.fn(), setAggregate: vi.fn(),
  }),
}));
vi.mock("../../features/import/ImportFlow", () => ({
  ImportFlow: ({ onDone }: { onDone?: (notice?: unknown) => void }) => <button onClick={() => onDone?.({ text: "done" })}>Finish import</button>,
}));

describe("ImportWrapper: a refresh that throws at once", () => {
  it("still navigates back to Mutual Funds", async () => {
    render(
      <MemoryRouter initialEntries={["/import"]}>
        <Routes>
          <Route path="/import" element={<ImportWrapper />} />
          <Route path="/portfolio/mutual-funds" element={<output data-testid="landing">landed</output>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish import" }));
    await waitFor(() => expect(screen.getByTestId("landing")).toBeInTheDocument());
  });
});
