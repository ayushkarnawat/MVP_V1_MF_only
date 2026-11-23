import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { WaitingForCasView } from "./WaitingForCasView";
import * as api from "./api";

vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  const { DOCS } = await import("../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});

describe("H-8 waiting screen checklist integration", () => {
  const response = {
    import_id: "import-h8", household_member_id: "member-h8", status: "waiting_for_user",
    cams_url: "https://cams.example.test/statement", expires_at: "2026-12-01T12:00:00Z",
  };

  function floatingWindow() {
    const events = new EventTarget();
    const floating = {
      document: document.implementation.createHTMLDocument("Unifolio checklist"),
      closed: false, focus: vi.fn(),
      close: vi.fn(() => {
        floating.closed = true;
        events.dispatchEvent(new Event("pagehide"));
      }),
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    };
    return floating;
  }

  afterEach(async () => {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("request completion moves to waiting and keeps the window; early focus holds upload until I have the file closes the checklist", async () => {
    localStorage.clear();
    const floating = floatingWindow();
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn().mockResolvedValue(floating) });
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const { MemoryRouter } = await import("react-router");
    const { TwoPathImportContainer } = await import("./TwoPathImportContainer");
    const { within, act } = await import("@testing-library/react");
    const { getChecklistState } = await import("./casResumeState");
    render(<MemoryRouter><TwoPathImportContainer memberId="member-h8" defaultTab="request" onUploadSubmit={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Request Statement on CAMS" }));
    await screen.findByText("Waiting for CAMS email");
    expect(floating.close).not.toHaveBeenCalled();
    const checklist = within(floating.document.body);
    expect(await checklist.findAllByRole("checkbox")).toHaveLength(5);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(screen.getByText("Waiting for CAMS email")).toBeVisible();
    expect(screen.queryByLabelText(/CAS PDF/i)).not.toBeInTheDocument();
    for (const box of checklist.getAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(checklist.getByRole("button", { name: "I have submitted the form" }));
    expect(getChecklistState("member-h8")?.step).toBe("waiting");
    act(() => window.dispatchEvent(new Event("focus")));
    expect(screen.queryByLabelText(/CAS PDF/i)).not.toBeInTheDocument();
    fireEvent.click(checklist.getByRole("button", { name: "I have the file" }));
    expect(await screen.findByLabelText(/CAS PDF/i)).toBeVisible();
    expect(getChecklistState("member-h8")?.step).toBe("ready");
    expect(floating.close).toHaveBeenCalledTimes(1);
    expect(floating.closed).toBe(true);
  });

  it("panel mode also holds the early return until I have the file shows upload", async () => {
    localStorage.clear();
    Reflect.deleteProperty(window, "documentPictureInPicture");
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const { MemoryRouter } = await import("react-router");
    const { TwoPathImportContainer } = await import("./TwoPathImportContainer");
    const { act } = await import("@testing-library/react");
    render(<MemoryRouter><TwoPathImportContainer memberId="member-h8" defaultTab="request" onUploadSubmit={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Request Statement on CAMS" }));
    await screen.findByText("Waiting for CAMS email");
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(5);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(screen.queryByLabelText(/CAS PDF/i)).not.toBeInTheDocument();
    boxes.forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole("button", { name: "I have submitted the form" }));
    fireEvent.click(screen.getByRole("button", { name: "I have the file" }));
    expect(await screen.findByLabelText(/CAS PDF/i)).toBeVisible();
    expect(screen.queryByText(/of 5 done/)).not.toBeInTheDocument();
  });

  it("reload shows Your checklist closed, Reopen checklist requires a click, and Start over clears ticks and step", async () => {
    localStorage.clear();
    const { setChecklistState, setCasResumeStep2, getChecklistState } = await import("./casResumeState");
    setCasResumeStep2("member-h8");
    setChecklistState("member-h8", { ticks: [true, true, true, true, true], step: "waiting" });
    const floating = floatingWindow();
    const requestWindow = vi.fn().mockResolvedValue(floating);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const { MemoryRouter } = await import("react-router");
    const { TwoPathImportContainer } = await import("./TwoPathImportContainer");
    const { within, act } = await import("@testing-library/react");
    render(<MemoryRouter><TwoPathImportContainer memberId="member-h8" onUploadSubmit={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByText(/Your checklist closed/)).toBeVisible();
    expect(requestWindow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reopen checklist" }));
    expect(requestWindow).toHaveBeenCalledExactlyOnceWith({ width: 320, height: 440 });
    expect(await within(floating.document.body).findByRole("button", { name: "I have the file" })).toBeInTheDocument();
    act(() => floating.close());
    const startOver = screen.queryByRole("button", { name: "Start over" }) ?? screen.getByRole("link", { name: "Start over" });
    fireEvent.click(startOver);
    await waitFor(() => {
      const saved = getChecklistState("member-h8");
      if (saved) expect(saved).toEqual({ ticks: [false, false, false, false, false], step: "form" });
      else expect(saved).toBeFalsy();
    });
  });
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
