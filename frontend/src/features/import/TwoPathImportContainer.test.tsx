import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TwoPathImportContainer } from "./TwoPathImportContainer";
import { setCasResumeStep2, hasCasResumeStep2, setChecklistState } from "./casResumeState";
import * as api from "./api";

// jsdom cannot complete the height animation; keep the waiting disclosure visible.
vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  return { ...actual, useReducedMotion: () => true };
});

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

describe("TwoPathImportContainer", () => {
  beforeEach(() => {
    vi.spyOn(api, "getCamsLink").mockResolvedValue("https://cams.example.test/statement");
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(api, "getPendingCamsRequest").mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders entry choice screen with both options and navigates into Request view", async () => {
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Entry Choice Screen (the first screen waits for the server's answer about a waiting request)
    expect(await screen.findByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
    expect(screen.getByText("Request from CAMS")).toBeInTheDocument();
    expect(screen.getByText("Already have a statement")).toBeInTheDocument();

    // Click Request from CAMS
    const requestChoice = screen.getByRole("button", { name: /request from cams/i });
    fireEvent.click(requestChoice);

    // Detail view is shown with back button
    expect(screen.getByRole("heading", { name: /^request from cams$/i })).toBeInTheDocument();
    expect(screen.getByText(/back to import options/i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /request statement on cams/i })).toHaveAttribute("href", "https://cams.example.test/statement");

    // Click back to options
    fireEvent.click(screen.getByText(/back to import options/i));
    expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
  });

  it("navigates into Upload view from choice screen and supports back navigation", async () => {
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Click Already have a statement
    const uploadChoice = await screen.findByRole("button", { name: /already have a statement/i });
    fireEvent.click(uploadChoice);

    // Upload form is shown with back button
    expect(screen.getByRole("heading", { name: /upload your statement/i })).toBeInTheDocument();
    expect(screen.getByText(/back to import options/i)).toBeInTheDocument();
    expect(screen.getByText(/click to choose file or drag & drop pdf here/i)).toBeInTheDocument();

    // Click back
    fireEvent.click(screen.getByText(/back to import options/i));
    expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
  });


  it("transitions to waiting view and persists resume state when Request on CAMS is clicked", async () => {
    const mockOpen = vi.fn();
    vi.stubGlobal("open", mockOpen);

    vi.spyOn(api, "requestCamsStatement").mockResolvedValue({
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "waiting_for_user",
      cams_url: "https://cams.example.test/statement",
      expires_at: "2026-08-12T12:00:00Z",
    });

    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Go to Request from CAMS
    await screen.findByRole("button", { name: /request from cams/i });
    fireEvent.click(screen.getByRole("button", { name: /request from cams/i }));

    const requestBtn = await screen.findByRole("link", { name: /request statement on cams/i });
    // No PAN consent on a CAMS request (2026-10-07).
    fireEvent.click(requestBtn);

    await waitFor(() => {
      expect(api.requestCamsStatement).toHaveBeenCalledWith("m-1");
      expect(mockOpen).not.toHaveBeenCalled();
      expect(hasCasResumeStep2("m-1")).toBe(true);
    });

    // Waiting view is displayed
    expect(await screen.findByText(/waiting for cams email/i)).toBeInTheDocument();
    expect(screen.getByText(/already got the email\? upload it now/i)).toBeInTheDocument();
  });


  it("clears resume state on upload submission so subsequent flow starts at choice view", async () => {
    setCasResumeStep2("m-1");
    const onUploadSubmit = vi.fn();

    const { unmount } = render(
      <TwoPathImportContainer
        memberId="m-1"
        defaultTab="upload"
        onUploadSubmit={onUploadSubmit}
      />
    );

    const fileInput = screen.getByLabelText(/cas pdf/i);
    const mockFile = new File(["dummy pdf"], "cas.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    const passwordInput = screen.getByLabelText(/pdf password/i);
    fireEvent.change(passwordInput, { target: { value: "pass123" } });

    const submitBtn = screen.getByRole("button", { name: /upload statement/i });
    await tickDisclaimer();
    fireEvent.click(submitBtn);

    expect(onUploadSubmit).toHaveBeenCalled();
    expect(hasCasResumeStep2("m-1")).toBe(false);

    unmount();

    // Next fresh import starts at choice screen
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    expect(await screen.findByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
  });

  it("waiting view hands the file to the review flow", async () => {
    setCasResumeStep2("m-1");
    const onUploadSubmit = vi.fn();
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue({
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "waiting_for_user",
      cams_url: "https://cams.example.test/statement",
      expires_at: "2026-08-12T12:00:00Z",
    });
    vi.stubGlobal("open", vi.fn());
    localStorage.clear();

    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={onUploadSubmit} />);
    fireEvent.click(await screen.findByRole("button", { name: /request from cams/i }));
    fireEvent.click(await screen.findByRole("link", { name: /request statement on cams/i }));
    await screen.findByText(/waiting for cams email/i);
    fireEvent.click(screen.getByRole("button", { name: /already got the email\? upload it now/i }));

    const file = new File(["pdf"], "cas.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/CAS PDF/i), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/PDF Password/i), { target: { value: "pw" } });
    await tickDisclaimer();
    fireEvent.click(screen.getByRole("button", { name: /Upload Statement/i }));

    expect(onUploadSubmit).toHaveBeenCalledWith(file, "pw", "request");
  });
  it("forwards a password error to the waiting upload without losing the file", () => {
    const onUploadSubmit = vi.fn();
    const { rerender } = render(<TwoPathImportContainer memberId="m-1" defaultTab="waiting" onUploadSubmit={onUploadSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /already got the email/i }));
    const file = new File(["pdf"], "waiting.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("CAS PDF"), { target: { files: [file] } });
    rerender(<TwoPathImportContainer memberId="m-1" defaultTab="waiting" onUploadSubmit={onUploadSubmit} errorCode="wrong_password" error="That password didn’t open the file." />);
    expect(screen.getByText("waiting.pdf")).toBeInTheDocument();
    expect(screen.getByText("That password didn’t open the file.")).toBeVisible();
  });


  const pending = { import_id: "server-import-1", household_member_id: "m-1", expires_at: "2099-12-01T12:00:00Z" };

  it("chooses_the_waiting_view_from_the_server_not_from_browser_notes", async () => {
    setCasResumeStep2("m-1");
    vi.mocked(api.getPendingCamsRequest).mockResolvedValue(pending);
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    expect(await screen.findByTestId("cams-waiting-card")).toBeVisible();
    expect(screen.getByText("Waiting for CAMS email")).toBeVisible();
    expect(screen.queryByLabelText(/CAS PDF/i)).not.toBeInTheDocument();
    expect(api.getPendingCamsRequest).toHaveBeenCalledWith("m-1");
  });

  it("shows_the_waiting_card_after_a_reload_with_the_real_import_id", async () => {
    vi.mocked(api.getPendingCamsRequest).mockResolvedValue(pending);
    const first = render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    await screen.findByTestId("cams-waiting-card");
    first.unmount();
    localStorage.clear();
    const cancel = vi.spyOn(api, "cancelImportRequest").mockRejectedValue(new Error("Synthetic cancel failure"));
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    expect(await screen.findByTestId("cams-waiting-card")).toBeVisible();
    fireEvent.click(screen.getByTestId("cams-waiting-cancel"));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(pending.import_id));
    expect(cancel).not.toHaveBeenCalledWith("pending-import");
  });

  it("cancel_uses_the_id_the_server_gave", async () => {
    vi.mocked(api.getPendingCamsRequest).mockResolvedValue(pending);
    const cancel = vi.spyOn(api, "cancelImportRequest").mockImplementation(async () => {
      vi.mocked(api.getPendingCamsRequest).mockResolvedValue(null);
      return { import_id: pending.import_id, household_member_id: "m-1", status: "expired",
        error_code: null, error_message: null, new_transactions_count: null, duplicate_transactions_count: null,
        statement_from_date: null, statement_to_date: null, source_cas_type: null,
        uploaded_at: "2026-11-25T00:00:00Z", confirmed_at: null };
    });
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("cams-waiting-cancel"));
    await screen.findByRole("heading", { name: /how would you like to bring in your statement/i });
    expect(cancel).toHaveBeenCalledExactlyOnceWith(pending.import_id);
    expect(api.getPendingCamsRequest).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("cams-waiting-card")).not.toBeInTheDocument();
  });

  it("coming_back_to_the_tab_does_not_change_the_screen", async () => {
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    await screen.findByRole("heading", { name: /how would you like to bring in your statement/i });
    setCasResumeStep2("m-1");
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeVisible());
    expect(screen.queryByLabelText(/CAS PDF/i)).not.toBeInTheDocument();
  });

  it("the_checklist_state_does_not_choose_the_screen", async () => {
    setChecklistState("m-1", { ticks: [true, false, false, false, false], step: "form" });
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeVisible());
    expect(screen.queryByRole("heading", { name: /^request from cams$/i })).not.toBeInTheDocument();
  });

  it("shows_the_card_when_the_server_says_a_request_waits_on_a_second_device", async () => {
    vi.mocked(api.getPendingCamsRequest).mockResolvedValue(pending);
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    expect(await screen.findByTestId("cams-waiting-card")).toBeVisible();
    expect(screen.getByText("CAMS request waiting")).toBeVisible();
    expect(hasCasResumeStep2("m-1")).toBe(false);
  });

  it("no_card_when_nothing_is_waiting", async () => {
    setCasResumeStep2("m-1");
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeVisible());
    expect(screen.queryByTestId("cams-waiting-card")).not.toBeInTheDocument();
  });

});
