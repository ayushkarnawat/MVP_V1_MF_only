import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { RequestCamsPath } from "./RequestCamsPath";
import * as api from "./api";
import { openChecklistAsChoiceClick } from "./testFixtures";
import { checklistCopy } from "./checklist/checklistCopy";
import { CHECKLIST_OFF_TITLE, CHECKLIST_OFF_BODY, CHECKLIST_TURN_ON } from "./pendingCopy";

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

beforeEach(() => {
  vi.spyOn(api, "getCamsLink").mockResolvedValue("https://cams.example.test/statement");
});

describe("H-8 CAMS checklist request flow", () => {
  const response = {
    import_id: "import-h8", household_member_id: "member-h8", status: "waiting_for_user",
    cams_url: "https://cams.example.test/statement", expires_at: "2026-12-01T12:00:00Z",
  };

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

  it("request_from_cams_is_a_link_to_the_cams_address_with_a_new_tab_target", async () => {
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    render(<RequestCamsPath memberId="member-h8" onRequestInitiated={vi.fn()} />);
    const link = await screen.findByRole("link", { name: "Request Statement on CAMS" });
    expect(api.getCamsLink).toHaveBeenCalledExactlyOnceWith();
    expect(link).toHaveAttribute("href", "https://cams.example.test/statement");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")?.split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    expect(link).toHaveAttribute("data-clickable", "");
    expect(link).toHaveAttribute("data-effect", "open");
    expect(link).not.toHaveAttribute("aria-disabled", "true");
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["refused", "missing"])("a_refused_or_missing_floating_window_still_opens_cams_and_shows_the_panel", async (mode) => {
    localStorage.clear();
    if (mode === "missing") Reflect.deleteProperty(window, "documentPictureInPicture");
    else vi.stubGlobal("documentPictureInPicture", {
      requestWindow: vi.fn().mockRejectedValue(new DOMException("Synthetic refusal", "NotAllowedError")),
    });
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const initiated = vi.fn();
    render(<RequestCamsPath memberId="member-d2-panel" onRequestInitiated={initiated} />);
    const link = await screen.findByRole("link", { name: "Request Statement on CAMS" });
    expect(link).toHaveAttribute("href", "https://cams.example.test/statement");
    expect(link).toHaveAttribute("target", "_blank");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(false);
    expect(await screen.findAllByRole("checkbox")).toHaveLength(5);
    await waitFor(() => expect(initiated).toHaveBeenCalledWith(response.import_id, response.expires_at));
    expect(request).toHaveBeenCalledExactlyOnceWith("member-d2-panel");
    expect(link).toHaveAttribute("href", "https://cams.example.test/statement");
    expect(openTab).not.toHaveBeenCalled();
  });

  it("handler_never_calls_preventDefault_on_the_request_link", async () => {
    localStorage.clear();
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn().mockResolvedValue(floatingWindow()) });
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const initiated = vi.fn();
    render(<RequestCamsPath memberId="member-d2-event" onRequestInitiated={initiated} />);
    const link = await screen.findByRole("link", { name: "Request Statement on CAMS" });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(false);
    await waitFor(() => expect(initiated).toHaveBeenCalledWith(response.import_id, response.expires_at));
    expect(click.defaultPrevented).toBe(false);
    expect(openTab).not.toHaveBeenCalled();
  });

  it("the_link_is_disabled_while_the_address_loads_and_falls_back_when_it_fails", async () => {
    localStorage.clear();
    let rejectAddress!: (error: Error) => void;
    vi.mocked(api.getCamsLink).mockImplementation(() => new Promise<string>((_, reject) => { rejectAddress = reject; }));
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const initiated = vi.fn();
    render(<RequestCamsPath memberId="member-d2-fallback" onRequestInitiated={initiated} />);
    const loading = screen.getByText("Request Statement on CAMS").closest("a, button");
    expect(loading).toHaveAttribute("aria-disabled", "true");
    expect(loading).not.toHaveAttribute("href");
    if (!loading) throw new Error("Missing request control");
    fireEvent.click(loading);
    expect(request).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
    await act(async () => rejectAddress(new Error("Synthetic address read failure")));
    const fallback = await screen.findByRole("button", { name: "Request Statement on CAMS" });
    await waitFor(() => expect(fallback).toBeEnabled());
    expect(fallback).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "Request Statement on CAMS" })).not.toBeInTheDocument();
    fireEvent.click(fallback);
    await waitFor(() => expect(initiated).toHaveBeenCalledWith(response.import_id, response.expires_at));
    expect(request).toHaveBeenCalledExactlyOnceWith("member-d2-fallback");
    expect(openTab).toHaveBeenCalledExactlyOnceWith(response.cams_url, "_blank");
    expect(request.mock.invocationCallOrder[0]).toBeLessThan(openTab.mock.invocationCallOrder[0]);
  });

  it("clicking_request_leaves_the_click_to_the_cams_tab_when_the_floating_window_is_already_open", async () => {
    // Chrome gives one click one permission, shared by a new tab and a floating window (checked in a real Chrome):
    // the floating window opens on the earlier choice-screen click, so this click only opens the CAMS tab.
    localStorage.clear();
    const floating = floatingWindow();
    const requestWindow = vi.fn().mockResolvedValue(floating);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const initiated = vi.fn();
    render(<RequestCamsPath memberId="member-h8" onRequestInitiated={initiated} />);
    await openChecklistAsChoiceClick("member-h8");
    expect(requestWindow).toHaveBeenCalledTimes(1);
    const notCancelled = fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    expect(notCancelled).toBe(true); // the link's own default action opens CAMS
    expect(requestWindow).toHaveBeenCalledTimes(1); // no second request for a floating window in this click
    expect(request).toHaveBeenCalledExactlyOnceWith("member-h8");
    await waitFor(() => expect(initiated).toHaveBeenCalledExactlyOnceWith(response.import_id, response.expires_at));
    const { hasCasResumeStep2 } = await import("./casResumeState");
    expect(hasCasResumeStep2("member-h8")).toBe(true);
    expect(openTab).not.toHaveBeenCalled();
    expect(within(floating.document.body).queryByText("Getting your link ready")).not.toBeInTheDocument();
  });

  it("when_the_floating_window_is_not_open_the_checklist_shows_in_the_page_and_the_click_still_opens_cams", async () => {
    localStorage.clear();
    const requestWindow = vi.fn();
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    render(<RequestCamsPath memberId="member-h8" onRequestInitiated={vi.fn()} />);
    const notCancelled = fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    expect(notCancelled).toBe(true);
    expect(requestWindow).not.toHaveBeenCalled();
    await screen.findByText("0 of 5 done");
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(openTab).not.toHaveBeenCalled();
  });

  it("Continue without it closes the floating window and Turn it back on opens it again", async () => {
    localStorage.clear();
    const floating = floatingWindow();
    const requestWindow = vi.fn().mockResolvedValue(floating);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    render(<RequestCamsPath memberId="member-h8" onRequestInitiated={vi.fn()} />);
    await openChecklistAsChoiceClick("member-h8");
    expect(requestWindow).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole("button", { name: "Continue without it" }));
    expect(floating.close).toHaveBeenCalled();
    floating.closed = false;
    fireEvent.click(await screen.findByRole("button", { name: CHECKLIST_TURN_ON }));
    await waitFor(() => expect(requestWindow).toHaveBeenCalledTimes(2));
  });

  it("the panel shows its title and the amber note", async () => {
    localStorage.clear();
    Reflect.deleteProperty(window, "documentPictureInPicture");
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    render(<RequestCamsPath memberId="member-h9b" onRequestInitiated={vi.fn()} />);
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    expect(await screen.findByRole("heading", { name: "Step 2: Fill the CAMS form" })).toBeInTheDocument();
    expect(screen.getByText("Your browser cannot float the checklist over other tabs, so it stays here. Tick items as you go, and switch between this tab and CAMS.")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
  });

  it("the request screen row keeps the first sentence", () => {
    localStorage.clear();
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn() });
    render(<RequestCamsPath memberId="member-h9b" onRequestInitiated={vi.fn()} />);
    expect(screen.getByTestId("continue-without-row")).toHaveTextContent(`${checklistCopy.introduction.split(".")[0]}.`);
  });

  it("Continue without it is a button in the checklist row", () => {
    localStorage.clear();
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn() });
    render(<RequestCamsPath memberId="member-h9b" onRequestInitiated={vi.fn()} />);
    const row = screen.getByTestId("continue-without-row");
    const button = within(row).getByRole("button", { name: checklistCopy.skip });
    expect(button).toHaveAttribute("data-testid", "continue-without-button");
    expect(button).toHaveAttribute("data-effect", "close");
    expect(within(row).queryByRole("link", { name: checklistCopy.skip })).not.toBeInTheDocument();
  });

  it("the_request_is_sent_after_the_click_and_a_failure_shows_in_the_checklist_with_try_again", async () => {
    localStorage.clear();
    const floating = floatingWindow();
    const requestWindow = vi.fn().mockResolvedValue(floating);
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const request = vi.spyOn(api, "requestCamsStatement")
      .mockRejectedValueOnce(new Error("Failed to initiate CAMS request."))
      .mockResolvedValueOnce(response);
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const initiated = vi.fn();
    const { within } = await import("@testing-library/react");
    render(<RequestCamsPath memberId="member-h8" onRequestInitiated={initiated} />);
    await openChecklistAsChoiceClick("member-h8");
    const link = await screen.findByRole("link", { name: "Request Statement on CAMS" });
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(link);
    const checklist = within(floating.document.body);
    expect(await screen.findByText("Failed to initiate CAMS request.")).toBeInTheDocument();
    expect(await checklist.findByText("Failed to initiate CAMS request.")).toBeInTheDocument();
    expect(initiated).not.toHaveBeenCalled();
    fireEvent.click(checklist.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(initiated).toHaveBeenCalledWith(response.import_id, response.expires_at));
    expect(request).toHaveBeenCalledTimes(2);
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(openTab).not.toHaveBeenCalled();
  });

  it.each(["no support", "throws", "rejects"])("%s: the panel shows and the CAMS link never opens a scripted tab", async (failure) => {
    localStorage.clear();
    if (failure === "no support") {
      Reflect.deleteProperty(window, "documentPictureInPicture");
    } else {
      vi.stubGlobal("documentPictureInPicture", {
        requestWindow: vi.fn(() => {
          const error = new DOMException("Not allowed", "NotAllowedError");
          if (failure === "throws") throw error;
          return Promise.reject(error);
        }),
      });
    }
    let resolveRequest!: (value: typeof response) => void;
    const request = vi.spyOn(api, "requestCamsStatement").mockImplementation(() => new Promise<typeof response>((resolve) => { resolveRequest = resolve; }));
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const initiated = vi.fn();
    const { act } = await import("@testing-library/react");
    render(<RequestCamsPath memberId="member-h8" onRequestInitiated={initiated} />);
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    await screen.findByText("0 of 5 done");
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(openTab).not.toHaveBeenCalled();
    expect(initiated).not.toHaveBeenCalled();
    await act(async () => resolveRequest(response));
    expect(openTab).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledExactlyOnceWith("member-h8");
    expect(initiated).toHaveBeenCalledExactlyOnceWith(response.import_id, response.expires_at);
  });

  it("Continue without it is offered only with the API and bypasses the floating window for this request", async () => {
    localStorage.clear();
    const requestWindow = vi.fn().mockResolvedValue(floatingWindow());
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const initiated = vi.fn();
    const { unmount } = render(<RequestCamsPath memberId="member-h8" onRequestInitiated={initiated} />);
    expect(screen.getByText(/A small checklist will float over the CAMS page/)).toBeInTheDocument();
    const skip = within(screen.getByTestId("continue-without-row")).getByRole("button", { name: checklistCopy.skip });
    fireEvent.click(skip);
    expect(screen.getByTestId("checklist-off-row")).toHaveTextContent(CHECKLIST_OFF_TITLE);
    expect(screen.getByTestId("checklist-turn-on")).toHaveTextContent(CHECKLIST_TURN_ON);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    await waitFor(() => expect(request).toHaveBeenCalledExactlyOnceWith("member-h8"));
    await waitFor(() => expect(initiated).toHaveBeenCalledExactlyOnceWith(response.import_id, response.expires_at));
    expect(openTab).not.toHaveBeenCalled();
    expect(requestWindow).not.toHaveBeenCalled();
    unmount();
    Reflect.deleteProperty(window, "documentPictureInPicture");
    render(<RequestCamsPath memberId="member-h8-next" onRequestInitiated={vi.fn()} />);
    expect(screen.queryByText("Continue without it")).not.toBeInTheDocument();
    expect(screen.queryByText(/A small checklist will float over the CAMS page/)).not.toBeInTheDocument();
  });

  it("request_does_not_wait_for_the_checklist_window", async () => {
    localStorage.clear();
    const floating = floatingWindow();
    let resolveWindow!: (value: typeof floating) => void;
    const requestWindow = vi.fn(() => new Promise<typeof floating>((resolve) => { resolveWindow = resolve; }));
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const initiated = vi.fn();
    render(<RequestCamsPath memberId="member-h8" onRequestInitiated={initiated} />);
    await openChecklistAsChoiceClick("member-h8", { settle: false });
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    try {
      await waitFor(() => expect(initiated).toHaveBeenCalledExactlyOnceWith(response.import_id, response.expires_at));
      expect(requestWindow).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledTimes(1);
      expect(openTab).not.toHaveBeenCalled();
    } finally {
      await act(async () => resolveWindow(floating));
    }
  });

  it("a_failing_checklist_window_never_stops_the_request", async () => {
    localStorage.clear();
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn().mockRejectedValue(new Error("Synthetic window refusal")) });
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const initiated = vi.fn();
    render(<RequestCamsPath memberId="member-h8" onRequestInitiated={initiated} />);
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    await waitFor(() => expect(initiated).toHaveBeenCalledWith(response.import_id, response.expires_at));
    expect(request).toHaveBeenCalledExactlyOnceWith("member-h8");
    expect(openTab).not.toHaveBeenCalled();
    expect(await screen.findAllByRole("checkbox")).toHaveLength(5);
  });

  function renderRow() {
    localStorage.clear();
    const requestWindow = vi.fn().mockResolvedValue(floatingWindow());
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    render(<RequestCamsPath memberId="member-row" onRequestInitiated={vi.fn()} />);
    return requestWindow;
  }

  it("continue_without_it_is_a_visible_button_in_a_row_with_the_checklist_icon", async () => {
    renderRow();
    const row = screen.getByTestId("continue-without-row");
    await waitFor(() => expect(row).toBeVisible());
    await waitFor(() => expect(within(row).getByRole("button", { name: checklistCopy.skip })).toBeVisible());
    expect(row.querySelector("svg")).not.toBeNull();
  });

  it("pressing_it_turns_the_checklist_off_for_this_request_and_shows_turn_it_back_on", async () => {
    const requestWindow = renderRow();
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.click(screen.getByTestId("continue-without-button"));
    const row = screen.getByTestId("checklist-off-row");
    expect(row).toHaveTextContent(CHECKLIST_OFF_TITLE);
    expect(row).toHaveTextContent(CHECKLIST_OFF_BODY);
    await waitFor(() => expect(within(row).getByRole("button", { name: CHECKLIST_TURN_ON })).toBeVisible());
    expect(screen.queryByTestId("continue-without-row")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("member-row"));
    await waitFor(() => expect(screen.getByRole("link", { name: "Request Statement on CAMS" })).not.toHaveAttribute("aria-disabled", "true"));
    expect(openTab).not.toHaveBeenCalled();
    expect(requestWindow).not.toHaveBeenCalled();
  });

  it("turn_it_back_on_restores_the_checklist", async () => {
    const requestWindow = renderRow();
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.click(screen.getByTestId("continue-without-button"));
    fireEvent.click(screen.getByTestId("checklist-turn-on"));
    await waitFor(() => expect(screen.getByTestId("continue-without-row")).toBeVisible());
    expect(screen.queryByTestId("checklist-off-row")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    await waitFor(() => expect(requestWindow).toHaveBeenCalledTimes(1));
  });

  it("the_choice_does_not_cancel_or_start_a_request", () => {
    renderRow();
    const request = vi.spyOn(api, "requestCamsStatement").mockRejectedValue(new Error("Unexpected request"));
    const cancel = vi.spyOn(api, "cancelImportRequest").mockRejectedValue(new Error("Unexpected cancellation"));
    const openTab = vi.spyOn(window, "open");
    fireEvent.click(screen.getByTestId("continue-without-button"));
    fireEvent.click(screen.getByTestId("checklist-turn-on"));
    expect(request).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
  });

  it("every_built_word_in_the_row_is_unchanged", () => {
    renderRow();
    const row = screen.getByTestId("continue-without-row");
    expect(within(row).getByRole("button", { name: checklistCopy.skip })).toHaveTextContent(checklistCopy.skip);
    expect(row.textContent?.replace(checklistCopy.skip, "").trim()).toBe(`${checklistCopy.introduction.split(".")[0]}.`);
  });

  it("row_is_not_shown_on_phones", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("max-width") || query.includes("767"), media: query,
      onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("innerWidth", 390);
    renderRow();
    const row = screen.queryByTestId("continue-without-row");
    if (row) {
      const desktopOnly = row.closest(".hidden.md\\:block, .hidden.md\\:flex, .hidden.md\\:grid");
      expect(desktopOnly).not.toBeNull();
    } else expect(row).not.toBeInTheDocument();
    expect(screen.queryByTestId("checklist-off-row")).not.toBeInTheDocument();
  });

});

describe("RequestCamsPath", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows Watch how it works as a secondary text link on the Request from CAMS screen", async () => {
    render(<RequestCamsPath memberId="m-1" onBack={vi.fn()} onRequestInitiated={vi.fn()} />);

    const name = "Watch how it works, 53 seconds";
    const link = screen.queryByRole("link", { name }) ?? screen.getByRole("button", { name });
    const request = await screen.findByRole("link", { name: "Request Statement on CAMS" });
    const actions = [...screen.queryAllByRole("button"), ...screen.queryAllByRole("link")];
    const filledActions = actions.filter((action) =>
      /(?:^|\s)bg-(?!transparent(?:\s|$))\S+/.test(action.className)
    );

    await waitFor(() => expect(link).toBeVisible());
    expect(filledActions).toEqual([request]);
  });

  it("pressing the link opens the dialog and does not call the CAMS request, open a tab or navigate", async () => {
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue({
      import_id: "imp-tutorial",
      household_member_id: "m-1",
      status: "waiting_for_user",
      cams_url: "https://cams.example.test/statement",
      expires_at: "2026-12-01T12:00:00Z",
    });
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const onRequestInitiated = vi.fn();
    const onBack = vi.fn();
    const initialUrl = window.location.href;
    render(<RequestCamsPath memberId="m-1" onBack={onBack} onRequestInitiated={onRequestInitiated} />);

    const name = "Watch how it works, 53 seconds";
    fireEvent.click(screen.queryByRole("link", { name }) ?? screen.getByRole("button", { name }));

    expect(await screen.findByRole("dialog", { name: "How to request your statement from CAMS" })).toBeVisible();
    expect(request).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
    expect(onRequestInitiated).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialUrl);
  });

  it("at the end the green action uses the address-read fallback and closes the pop-up", async () => {
    vi.mocked(api.getCamsLink).mockRejectedValue(new Error("Synthetic address read failure"));
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue({
      import_id: "imp-tutorial",
      household_member_id: "m-1",
      status: "waiting_for_user",
      cams_url: "https://cams.example.test/statement",
      expires_at: "2026-12-01T12:00:00Z",
    });
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const onRequestInitiated = vi.fn();
    render(<RequestCamsPath memberId="m-1" onRequestInitiated={onRequestInitiated} />);

    const name = "Watch how it works, 53 seconds";
    fireEvent.click(screen.queryByRole("link", { name }) ?? screen.getByRole("button", { name }));

    const dialog = await screen.findByRole("dialog", { name: "How to request your statement from CAMS" });
    const video = dialog.querySelector("video");
    if (!video) throw new Error("The tutorial dialog has no video player");

    const actionName = "Request Statement on CAMS";
    expect(screen.queryAllByRole("button", { name: actionName }).filter((button) => dialog.contains(button))).toHaveLength(0);
    video.currentTime = 53;
    vi.spyOn(video, "ended", "get").mockReturnValue(true);
    fireEvent.ended(video);
    const endAction = screen.getAllByRole("button", { name: actionName }).find((button) => dialog.contains(button));
    if (!endAction) throw new Error("The tutorial dialog has no end-of-video CAMS action");
    fireEvent.click(endAction);

    await waitFor(() => {
      expect(request).toHaveBeenCalledExactlyOnceWith("m-1");
      expect(openTab).toHaveBeenCalledExactlyOnceWith("https://cams.example.test/statement", "_blank");
      expect(onRequestInitiated).toHaveBeenCalledExactlyOnceWith("imp-tutorial", "2026-12-01T12:00:00Z");
      expect(dialog).not.toBeInTheDocument();
    });
  });

  it("renders steps, reference card and back button, then requests through the CAMS link without consent", async () => {
    const mockOpen = vi.fn();
    vi.stubGlobal("open", mockOpen);

    vi.spyOn(api, "requestCamsStatement").mockResolvedValue({
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "waiting_for_user",
      cams_url: "https://cams.example.test/statement",
      expires_at: "2026-08-12T12:00:00Z",
    });

    const onRequestInitiated = vi.fn();
    const onBack = vi.fn();

    render(
      <RequestCamsPath
        memberId="m-1"
        onBack={onBack}
        onRequestInitiated={onRequestInitiated}
      />
    );

    // Verify back button
    const backBtn = screen.getByText(/back to import options/i);
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();

    // Verify reference card and steps
    expect(screen.getByText(/on the cams form, select these three options/i)).toBeInTheDocument();
    expect(screen.getByText(/detailed statement/i)).toBeInTheDocument();
    expect(screen.getByText(/10-year duration/i)).toBeInTheDocument();
    expect(screen.getByText(/with zero folios/i)).toBeInTheDocument();

    expect(screen.getByText(/tapping below opens the official cams site in a new tab/i)).toBeInTheDocument();
    expect(screen.getByText(/select the above three options on the form/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your email and set a password for your cas file/i)).toBeInTheDocument();

    // Verify CTA and submission
    const requestBtn = await screen.findByRole("link", { name: /request statement on cams/i });
    // 2026-10-07: no PAN consent on a CAMS request -- no box, no line, enabled straight away.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/you agree to our/i)).not.toBeInTheDocument();
    expect(requestBtn).toHaveAttribute("href", "https://cams.example.test/statement");
    expect(requestBtn).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(requestBtn);

    await waitFor(() => {
      expect(api.requestCamsStatement).toHaveBeenCalledWith("m-1");
      expect(mockOpen).not.toHaveBeenCalled();
      expect(onRequestInitiated).toHaveBeenCalledWith("imp-req-1", "2026-08-12T12:00:00Z");
    });
  });
});
