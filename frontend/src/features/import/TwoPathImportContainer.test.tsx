import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TwoPathImportContainer } from "./TwoPathImportContainer";
import { setCasResumeStep2, hasCasResumeStep2, setChecklistState } from "./casResumeState";
import * as api from "./api";

// Keep motion deterministic in jsdom.
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
    vi.unstubAllGlobals();
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


  it("after a request the upload card is shown and no waiting text", async () => {
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

    expect(await screen.findByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.queryByText("CAMS request waiting")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for CAMS email")).not.toBeInTheDocument();
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

  it("uploading closes nothing on the client side and calls onUploadSubmit with source tab upload", async () => {
    const cancel = vi.spyOn(api, "cancelImportRequest").mockRejectedValue(new Error("Unexpected cancellation"));
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
    await screen.findByRole("heading", { name: "Upload your statement" });

    const file = new File(["pdf"], "cas.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/CAS PDF/i), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/PDF Password/i), { target: { value: "pw" } });
    await tickDisclaimer();
    fireEvent.click(screen.getByRole("button", { name: /Upload Statement/i }));

    expect(onUploadSubmit).toHaveBeenCalledExactlyOnceWith(file, "pw", "upload");
    expect(cancel).not.toHaveBeenCalled();
    expect(hasCasResumeStep2("m-1")).toBe(false);
  });
  it("maps the waiting default tab to upload and preserves the file on a password error", () => {
    const onUploadSubmit = vi.fn();
    const { rerender } = render(<TwoPathImportContainer memberId="m-1" defaultTab="waiting" onUploadSubmit={onUploadSubmit} />);
    const file = new File(["pdf"], "waiting.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("CAS PDF"), { target: { files: [file] } });
    rerender(<TwoPathImportContainer memberId="m-1" defaultTab="waiting" onUploadSubmit={onUploadSubmit} errorCode="wrong_password" error="That password didn’t open the file." />);
    expect(screen.getByText("waiting.pdf")).toBeInTheDocument();
    expect(screen.getByText("That password didn’t open the file.")).toBeVisible();
  });


  const pending = { import_id: "server-import-1", household_member_id: "m-1", expires_at: "2099-12-01T12:00:00Z" };

  it("a member with an open request opens on the upload card", async () => {
    setCasResumeStep2("m-1");
    vi.mocked(api.getPendingCamsRequest).mockResolvedValue(pending);
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    expect(screen.queryByText("CAMS request waiting")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for CAMS email")).not.toBeInTheDocument();
    expect(api.getPendingCamsRequest).toHaveBeenCalledWith("m-1");
  });

  it("shows the upload card after a reload without browser notes", async () => {
    vi.mocked(api.getPendingCamsRequest).mockResolvedValue(pending);
    const first = render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    await screen.findByRole("heading", { name: "Upload your statement" });
    first.unmount();
    localStorage.clear();
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /cancel request/i })).not.toBeInTheDocument();
  });

  it("Back from the upload card shows the choice screen even with an open request", async () => {
    vi.mocked(api.getPendingCamsRequest).mockResolvedValue(pending);
    const cancel = vi.spyOn(api, "cancelImportRequest").mockRejectedValue(new Error("Unexpected cancellation"));
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    await screen.findByRole("heading", { name: "Upload your statement" });
    fireEvent.click(screen.getByRole("button", { name: /back to import options/i }));
    const choice = await screen.findByRole("heading", { name: /how would you like to bring in your statement/i });
    await waitFor(() => expect(choice).toBeVisible()); // the screen fades in
    fireEvent(window, new Event("focus"));
    expect(screen.queryByLabelText(/CAS PDF/i)).not.toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    expect(api.getPendingCamsRequest).toHaveBeenCalledTimes(1);
  });

  it("ticking, closing and reopening the checklist and refocusing the tab do not change the screen", async () => {
    const { act, within } = await import("@testing-library/react");
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const events = new EventTarget();
    const floating = {
      document: frame.contentDocument as Document, closed: false, focus: vi.fn(),
      close: vi.fn(() => {
        floating.closed = true;
        events.dispatchEvent(new Event("pagehide"));
      }),
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    };
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn().mockImplementation(async () => {
      floating.closed = false;
      return floating;
    }) });
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue({
      ...pending, status: "waiting_for_user", cams_url: "https://cams.example.test/statement",
    });
    const rendered = render(<TwoPathImportContainer memberId="m-1" defaultTab="request" onUploadSubmit={vi.fn()} />);
    try {
      fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
      await screen.findByRole("heading", { name: "Upload your statement" });
      const checklist = within(floating.document.body);
      const boxes = await checklist.findAllByRole("checkbox");
      fireEvent.click(boxes[0]);
      expect(boxes[0]).toBeChecked();
      expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
      act(() => floating.close());
      expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Reopen checklist" }));
      expect((await checklist.findAllByRole("checkbox"))[0]).toBeChecked();
      fireEvent(window, new Event("focus"));
      expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
      expect(screen.queryByText("CAMS request waiting")).not.toBeInTheDocument();
      expect(screen.queryByText("Waiting for CAMS email")).not.toBeInTheDocument();
    } finally {
      rendered.unmount();
      frame.remove();
    }
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

  it("shows the upload card for an open request on a second device", async () => {
    vi.mocked(api.getPendingCamsRequest).mockResolvedValue(pending);
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.queryByText("CAMS request waiting")).not.toBeInTheDocument();
    expect(hasCasResumeStep2("m-1")).toBe(false);
  });

  it("no_card_when_nothing_is_waiting", async () => {
    setCasResumeStep2("m-1");
    render(<TwoPathImportContainer memberId="m-1" onUploadSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeVisible());
    expect(screen.queryByTestId("cams-waiting-card")).not.toBeInTheDocument();
  });

});
