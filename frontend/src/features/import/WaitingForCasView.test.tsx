import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { WaitingForCasView } from "./WaitingForCasView";
import * as api from "./api";

vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  const { DOCS } = await import("../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});

/** Ticks the PAN disclaimer once the legal documents have loaded. */
/** No tick box since 2026-10-07: waits until the PAN policy has loaded, which
 * is what enables Upload (its version is sent with the click). */
async function tickDisclaimer() {
  await waitFor(() => expect(screen.getByRole("button", { name: "privacy policy" })).toBeEnabled());
  await waitFor(() => expect(screen.getByRole("button", { name: /upload statement/i })).toBeEnabled());
}

describe("WaitingForCasView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the same link opens the same dialog from the waiting screen, and the waiting screen does not navigate", async () => {
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const onCancelled = vi.fn();
    const onUploadSubmit = vi.fn();
    const initialUrl = window.location.href;
    render(<WaitingForCasView importId="imp-tutorial" onCancelled={onCancelled} onUploadSubmit={onUploadSubmit} />);

    const name = "Watch how it works, 53 seconds";
    const link = screen.queryByRole("link", { name }) ?? screen.getByRole("button", { name });
    const upload = screen.getByRole("button", { name: /already got the email\? upload it now/i });
    const uploadCard = upload.parentElement;
    expect(link).toBeVisible();
    expect(link.className).not.toMatch(/(?:^|\s)bg-(?!transparent(?:\s|$))\S+/);
    expect(
      uploadCard?.contains(link) ||
      uploadCard?.previousElementSibling?.contains(link) ||
      uploadCard?.nextElementSibling?.contains(link)
    ).toBe(true);

    fireEvent.click(link);

    const dialog = await screen.findByRole("dialog", { name: "How to request your statement from CAMS" });
    expect(dialog).toBeVisible();
    expect(dialog.querySelector("video")).toBeInTheDocument();
    expect(openTab).not.toHaveBeenCalled();
    expect(onCancelled).not.toHaveBeenCalled();
    expect(onUploadSubmit).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialUrl);
  });

  it("renders waiting state and triggers cancellation", async () => {
    vi.spyOn(api, "cancelImportRequest").mockResolvedValue({
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "expired",
      error_code: null,
      error_message: null,
      new_transactions_count: null,
      duplicate_transactions_count: null,
      statement_from_date: null,
      statement_to_date: null,
      source_cas_type: null,
      uploaded_at: "2026-08-10T12:00:00Z",
      confirmed_at: null,
    });

    const onCancelled = vi.fn();

    render(
      <WaitingForCasView
        importId="imp-req-1"
        onCancelled={onCancelled}
        onUploadSubmit={vi.fn()}
      />
    );

    expect(screen.getByText(/waiting for cams email/i)).toBeInTheDocument();
    expect(screen.getByText(/already got the email\? upload it now/i)).toBeInTheDocument();

    const cancelBtn = screen.getByRole("button", { name: /cancel request/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(api.cancelImportRequest).toHaveBeenCalledWith("imp-req-1");
      expect(onCancelled).toHaveBeenCalled();
    });
  });

  it("expands upload disclosure and calls onUploadSubmit when file is uploaded", async () => {
    const onUploadSubmit = vi.fn();
    render(
      <WaitingForCasView
        importId="imp-req-1"
        onCancelled={vi.fn()}
        onUploadSubmit={onUploadSubmit}
      />
    );

    // Click disclosure trigger to expand
    const disclosureBtn = screen.getByRole("button", { name: /already got the email\? upload it now/i });
    expect(disclosureBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(disclosureBtn);
    expect(disclosureBtn).toHaveAttribute("aria-expanded", "true");

    // Form is now accessible
    const fileInput = screen.getByLabelText(/CAS PDF/i);
    const mockFile = new File(["dummy pdf content"], "CAS_statement.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [mockFile] } });
    const passwordInput = screen.getByLabelText(/PDF Password/i);
    fireEvent.change(passwordInput, { target: { value: "SECRET123" } });

    const submitBtn = screen.getByRole("button", { name: /Upload Statement/i });
    await tickDisclaimer();
    fireEvent.click(submitBtn);

    expect(onUploadSubmit).toHaveBeenCalledWith(mockFile, "SECRET123");
  });

  it("requires onUploadSubmit so there is no one-step upload fallback", () => {
    // Type-level guard: omitting the prop must be a compile error (M18).
    // @ts-expect-error onUploadSubmit is required
    const el = <WaitingForCasView importId="i" onCancelled={vi.fn()} />;
    expect(el).toBeTruthy();
  });
});
