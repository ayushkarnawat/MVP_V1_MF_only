import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileView } from "./ProfileView";

describe("ProfileView", () => {
  it("keeps logout above the final danger zone and invokes logout", () => {
    const logout = vi.fn();
    render(
      <ProfileView
        name="Alice"
        email="alice@example.com"
        phoneNumber="+919999999999"
        logout={logout}
      />,
    );

    const logoutButton = screen.getByRole("button", { name: /logout/i });
    const dangerZone = screen.getByText("Danger Zone");
    expect(
      logoutButton.compareDocumentPosition(dangerZone) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(logoutButton);
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.getAllByLabelText("Toggle theme")).toHaveLength(1);
  });

  it("collects one exit reason then shows the single five-day confirmation", async () => {
    const requestAccountDeletion = vi.fn().mockResolvedValue(undefined);
    render(
      <ProfileView
        name="Alice"
        email="alice@example.com"
        phoneNumber="+919999999999"
        logout={vi.fn()}
        requestAccountDeletion={requestAccountDeletion}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    expect(screen.getByRole("dialog", { name: /why are you leaving/i })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Missing a feature"));
    fireEvent.change(screen.getByLabelText(/anything else/i), {
      target: { value: "Capital-gains reports" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText(
      "Your account and all household data will be permanently deleted in 5 days. You can cancel anytime before then.",
    )).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^confirm deletion$/i }));

    expect(requestAccountDeletion).toHaveBeenCalledWith("missing_feature", "Capital-gains reports");
  });

  it("keeps account deletion retryable and visible when scheduling fails", async () => {
    const requestAccountDeletion = vi.fn().mockRejectedValue(new Error("network"));
    render(<ProfileView name="Alice" email="alice@example.com" phoneNumber="+919999999999" logout={vi.fn()} requestAccountDeletion={requestAccountDeletion} />);
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    fireEvent.click(screen.getByLabelText("Other"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm deletion$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not schedule account deletion. Please try again.");
    expect(screen.getByRole("button", { name: /^confirm deletion$/i })).toBeEnabled();
    expect(screen.getByRole("dialog", { name: /confirm account deletion/i })).toBeInTheDocument();
  });

  it("changes email only after sending and verifying an OTP to the new address", async () => {
    const requestContactChange = vi.fn().mockResolvedValue({ otp: "123456" });
    const verifyContactChange = vi.fn().mockResolvedValue(undefined);
    render(
      <ProfileView
        name="Alice"
        email="alice@example.com"
        phoneNumber="+919999999999"
        logout={vi.fn()}
        requestContactChange={requestContactChange}
        verifyContactChange={verifyContactChange}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]);
    fireEvent.change(screen.getByLabelText("New email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(requestContactChange).toHaveBeenCalledWith("email", "new@example.com");

    fireEvent.change(await screen.findByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify change" }));
    expect(verifyContactChange).toHaveBeenCalledWith("email", "new@example.com", "123456");
  });

  it("shows a retryable error when requesting a contact-change code fails", async () => {
    const requestContactChange = vi.fn().mockRejectedValue(new Error("network"));
    render(<ProfileView name="Alice" email="alice@example.com" phoneNumber="+919999999999" logout={vi.fn()} requestContactChange={requestContactChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]);
    fireEvent.change(screen.getByLabelText("New email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the verification code. Please try again.");
    expect(screen.getByRole("button", { name: "Send code" })).toBeEnabled();
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
  });

  it("keeps contact verification retryable when verification fails", async () => {
    const requestContactChange = vi.fn().mockResolvedValue({ otp: "123456" });
    const verifyContactChange = vi.fn().mockRejectedValue(new Error("invalid"));
    render(<ProfileView name="Alice" email="alice@example.com" phoneNumber="+919999999999" logout={vi.fn()} requestContactChange={requestContactChange} verifyContactChange={verifyContactChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]);
    fireEvent.change(screen.getByLabelText("New email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    fireEvent.change(await screen.findByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify change" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not verify the contact change. Please try again.");
    expect(screen.getByRole("button", { name: "Verify change" })).toBeEnabled();
    expect(screen.getByRole("dialog", { name: /change email/i })).toBeInTheDocument();
  });

  it("lists household imports and explains dashboard versus analytics timing before deletion", async () => {
    const loadImportHistory = vi.fn().mockResolvedValue([
      {
        import_id: "import-1",
        household_member_id: "member-1",
        uploaded_at: "2026-09-10T10:30:00Z",
        statement_from_date: "2025-04-01",
        statement_to_date: "2026-03-31",
        status: "import_successful",
        new_transactions_count: 12,
      },
    ]);
    const deleteImport = vi.fn().mockResolvedValue({ deleted_transactions_count: 12 });
    render(
      <ProfileView
        name="Alice"
        email="alice@example.com"
        phoneNumber="+919999999999"
        logout={vi.fn()}
        loadImportHistory={loadImportHistory}
        deleteImport={deleteImport}
      />,
    );

    expect(await screen.findByText("1 Apr 2025 – 31 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("12 transactions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete import from 10 Sep 2026" }));

    expect(screen.getByText("This removes 12 transactions tied to this import from your holdings.")).toBeInTheDocument();
    expect(screen.getByText(/Dashboard updates on your next refresh/i)).toBeInTheDocument();
    expect(screen.getByText(/Analytics will recompute in the background/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete import" }));

    expect(deleteImport).toHaveBeenCalledWith("import-1");
    expect(await screen.findByText("No imports yet.")) .toBeInTheDocument();
  });

  it("keeps an import and its confirmation open when deletion fails", async () => {
    const loadImportHistory = vi.fn().mockResolvedValue([{
      import_id: "import-1", household_member_id: "member-1", uploaded_at: "2026-09-10T10:30:00Z",
      statement_from_date: "2025-04-01", statement_to_date: "2026-03-31", status: "import_successful",
      new_transactions_count: 12,
    }]);
    const deleteImport = vi.fn().mockRejectedValue(new Error("network"));
    render(<ProfileView name="Alice" email="alice@example.com" phoneNumber="+919999999999" logout={vi.fn()} loadImportHistory={loadImportHistory} deleteImport={deleteImport} />);
    await screen.findByText("1 Apr 2025 – 31 Mar 2026");
    fireEvent.click(screen.getByRole("button", { name: "Delete import from 10 Sep 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete import" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete this import. Please try again.");
    expect(screen.getByText("1 Apr 2025 – 31 Mar 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete import" })).toBeEnabled();
  });
});
