import { openChecklistAsChoiceClick } from "./testFixtures";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { WaitingForCasView } from "./WaitingForCasView";
import * as api from "./api";

// The floating window's document must have a window (testing-library needs one to compute roles and styles), so it is the
// document of a hidden iframe, not a bare document made with createHTMLDocument.
function floatingDocument(): Document {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  document.body.append(frame);
  const doc = frame.contentDocument as Document;
  doc.title = "Unifolio checklist";
  return doc;
}


vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  const { DOCS } = await import("../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});

describe("H-8 desktop upload screen checklist integration", () => {
  const response = {
    import_id: "import-h8", household_member_id: "member-h8", status: "waiting_for_user",
    cams_url: "https://cams.example.test/statement", expires_at: "2026-12-01T12:00:00Z",
  };

  beforeEach(() => {
    vi.spyOn(api, "getCamsLink").mockResolvedValue("https://cams.example.test/statement");
    vi.spyOn(api, "getPendingCamsRequest").mockImplementation(async (memberId) => ({
      import_id: "server-waiting", household_member_id: memberId, expires_at: "2099-12-01T12:00:00Z",
    }));
  });

  function floatingWindow() {
    const events = new EventTarget();
    const floating = {
      document: floatingDocument(),
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

  it("request completion keeps the window; ready, focus and Close never change the upload screen", async () => {
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
    await openChecklistAsChoiceClick("member-h8");
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    await screen.findByRole("heading", { name: "Upload your statement" });
    expect(floating.close).not.toHaveBeenCalled();
    const checklist = within(floating.document.body);
    expect(await checklist.findAllByRole("checkbox")).toHaveLength(5);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    for (const box of checklist.getAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(checklist.getByRole("button", { name: "I have submitted the form" }));
    expect(getChecklistState("member-h8")?.step).toBe("waiting");
    act(() => window.dispatchEvent(new Event("focus")));
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    fireEvent.click(checklist.getByRole("button", { name: "I have the file" }));
    expect(getChecklistState("member-h8")).toEqual({ ticks: [true, true, true, true, true], step: "ready" });
    expect(checklist.getByRole("heading", { name: "You have the file" })).toBeInTheDocument();
    expect(floating.close).not.toHaveBeenCalled();
    expect(floating.closed).toBe(false);
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    expect(floating.close).not.toHaveBeenCalled();
    fireEvent.click(checklist.getByRole("button", { name: "Close this checklist" }));
    expect(getChecklistState("member-h8")).toBeFalsy();
    expect(floating.close).toHaveBeenCalledTimes(1);
    expect(floating.closed).toBe(true);
    expect(screen.queryByText("Your checklist is closed. Add the file and type the password you set on CAMS.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
  });

  it("panel mode keeps ready until Close without changing the upload screen or showing a banner", async () => {
    localStorage.clear();
    Reflect.deleteProperty(window, "documentPictureInPicture");
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const { MemoryRouter } = await import("react-router");
    const { TwoPathImportContainer } = await import("./TwoPathImportContainer");
    const { act } = await import("@testing-library/react");
    const { getChecklistState } = await import("./casResumeState");
    render(<MemoryRouter><TwoPathImportContainer memberId="member-h8" defaultTab="request" onUploadSubmit={vi.fn()} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    await screen.findByRole("heading", { name: "Upload your statement" });
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(5);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    boxes.forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole("button", { name: "I have submitted the form" }));
    fireEvent.click(screen.getByRole("button", { name: "I have the file" }));
    expect(screen.getByRole("heading", { name: "Step 4: You have the file" })).toBeInTheDocument();
    expect(getChecklistState("member-h8")).toEqual({ ticks: [true, true, true, true, true], step: "ready" });
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close this checklist" }));
    expect(getChecklistState("member-h8")).toBeNull();
    expect(screen.queryByText("Your checklist is closed. Add the file and type the password you set on CAMS.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    expect(screen.queryByText(/of 5 done/)).not.toBeInTheDocument();
  });

  async function renderReadyChecklist() {
    localStorage.clear();
    const { setChecklistState, setCasResumeStep2 } = await import("./casResumeState");
    setCasResumeStep2("member-h9b");
    setChecklistState("member-h9b", { ticks: [true, true, true, true, true], step: "ready" });
    const floating = floatingWindow();
    const requestWindow = vi.fn().mockResolvedValue(floating);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const { MemoryRouter } = await import("react-router");
    const { TwoPathImportContainer } = await import("./TwoPathImportContainer");
    const { within } = await import("@testing-library/react");
    const onUploadSubmit = vi.fn();
    render(<MemoryRouter><TwoPathImportContainer memberId="member-h9b" onUploadSubmit={onUploadSubmit} /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Upload your statement" });
    return { floating, requestWindow, checklist: within(floating.document.body), onUploadSubmit };
  }

  it("reload on ready shows the closed card naming step 4 and reopens W3 on a click", async () => {
    const { requestWindow, checklist } = await renderReadyChecklist();
    // The step name is set in bold inside the sentence (H-10), so the sentence is read from the banner's whole text.
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "Your checklist closed when this page reloaded. You were on step 4: You have the file.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(requestWindow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reopen checklist" }));
    expect(requestWindow).toHaveBeenCalledExactlyOnceWith({ width: 320, height: 440 });
    expect(await checklist.findByRole("heading", { name: "You have the file" })).toBeInTheDocument();
    expect(checklist.queryByRole("button", { name: "Open the CAMS form" })).not.toBeInTheDocument();
  });

  it("finish clears the saved state without navigating or showing a banner; upload is immediately available", async () => {
    const { checklist, onUploadSubmit } = await renderReadyChecklist();
    const { getChecklistState } = await import("./casResumeState");
    fireEvent.click(screen.getByRole("button", { name: "Reopen checklist" }));
    fireEvent.click(await checklist.findByRole("button", { name: "Close this checklist" }));
    expect(getChecklistState("member-h9b")).toBeNull();
    const banner = "Your checklist is closed. Add the file and type the password you set on CAMS.";
    expect(screen.queryByText(banner)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    const file = new File(["synthetic pdf"], "synthetic-h9b.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/CAS PDF/i), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/PDF Password/i), { target: { value: "MF@123" } });
    await tickDisclaimer();
    fireEvent.click(screen.getByRole("button", { name: "Upload Statement" }));
    expect(onUploadSubmit).toHaveBeenCalledWith(file, "MF@123", "upload");
    expect(screen.queryByText(banner)).not.toBeInTheDocument();
  });

  it("closing the floating window on ready finishes without changing the upload screen", async () => {
    const { floating, checklist } = await renderReadyChecklist();
    const { act } = await import("@testing-library/react");
    const { getChecklistState } = await import("./casResumeState");
    fireEvent.click(screen.getByRole("button", { name: "Reopen checklist" }));
    await checklist.findByRole("heading", { name: "You have the file" });
    act(() => floating.close());
    expect(getChecklistState("member-h9b")).toBeNull();
    expect(screen.queryByText("Your checklist is closed. Add the file and type the password you set on CAMS.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
  });

  it("closing the checklist never shows an upload banner before or after history navigation, and Back to import shows the choice screen", async () => {
    const { checklist } = await renderReadyChecklist();
    fireEvent.click(screen.getByRole("button", { name: "Reopen checklist" }));
    fireEvent.click(await checklist.findByRole("button", { name: "Close this checklist" }));
    const banner = "Your checklist is closed. Add the file and type the password you set on CAMS.";
    expect(screen.queryByText(banner)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    vi.spyOn(api, "getMemberImportHistory").mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Import History" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to import" }));
    expect(screen.queryByText(banner)).not.toBeInTheDocument();
    // Back to import from Import History shows the choice screen (the upload options), even with a request open.
    expect(await screen.findByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/CAS PDF/i)).not.toBeInTheDocument();
    expect(screen.queryByText(banner)).not.toBeInTheDocument();
  });

  it("reload shows Your checklist closed, Reopen checklist requires a click, and Reset checklist clears ticks and step", async () => {
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
    const startOver = screen.queryByRole("button", { name: "Reset checklist" }) ?? screen.getByRole("link", { name: "Reset checklist" });
    fireEvent.click(startOver);
    await waitFor(() => {
      const saved = getChecklistState("member-h8");
      if (saved) expect(saved).toEqual({ ticks: [false, false, false, false, false], step: "form" });
      else expect(saved).toBeFalsy();
    });
  });

  it("reset_checklist_does_not_touch_the_request", async () => {
    localStorage.clear();
    const { setChecklistState } = await import("./casResumeState");
    setChecklistState("member-reset", { ticks: [true, false, false, false, false], step: "form" });
    const cancel = vi.spyOn(api, "cancelImportRequest").mockRejectedValue(new Error("Unexpected cancellation"));
    const request = vi.spyOn(api, "requestCamsStatement").mockRejectedValue(new Error("Unexpected request"));
    const { TwoPathImportContainer } = await import("./TwoPathImportContainer");
    render(<TwoPathImportContainer memberId="member-reset" onUploadSubmit={vi.fn()} />);
    await screen.findByRole("heading", { name: "Upload your statement" });
    fireEvent.click(screen.getByRole("button", { name: "Reset checklist" }));
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(api.getPendingCamsRequest).toHaveBeenCalledTimes(1);
  });

  it("closing_the_checklist_does_not_touch_the_request", async () => {
    const { floating, checklist } = await renderReadyChecklist();
    const cancel = vi.spyOn(api, "cancelImportRequest").mockRejectedValue(new Error("Unexpected cancellation"));
    const request = vi.spyOn(api, "requestCamsStatement").mockRejectedValue(new Error("Unexpected request"));
    fireEvent.click(screen.getByRole("button", { name: "Reopen checklist" }));
    await checklist.findByRole("heading", { name: "You have the file" });
    const { act } = await import("@testing-library/react");
    act(() => floating.close());
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    expect(screen.getByLabelText(/CAS PDF/i)).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(api.getPendingCamsRequest).toHaveBeenCalledTimes(1);
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
