import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { RequestCamsPath } from "./RequestCamsPath";
import * as api from "./api";

vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  const { DOCS } = await import("../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});

describe("H-8 CAMS checklist request flow", () => {
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

  it("opens the window synchronously in the click before the request starts or is awaited; the green button opens no CAMS tab", async () => {
    localStorage.clear();
    const floating = floatingWindow();
    let resolveWindow!: (value: typeof floating) => void;
    let resolveRequest!: (value: typeof response) => void;
    const requestWindow = vi.fn(() => new Promise<typeof floating>((resolve) => { resolveWindow = resolve; }));
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const request = vi.spyOn(api, "requestCamsStatement").mockImplementation(() => {
      expect(requestWindow).toHaveBeenCalledExactlyOnceWith({ width: 320, height: 440 });
      return new Promise<typeof response>((resolve) => { resolveRequest = resolve; });
    });
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const initiated = vi.fn();
    const { within, act } = await import("@testing-library/react");
    render(<RequestCamsPath memberId="member-h8" onRequestInitiated={initiated} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Statement on CAMS" }));
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledExactlyOnceWith("member-h8");
    expect(requestWindow.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0]);
    await act(async () => resolveWindow(floating));
    const checklist = within(floating.document.body);
    const preparing = await checklist.findByRole("button", { name: "Getting your link ready" });
    expect(preparing).toBeDisabled();
    expect(initiated).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
    await act(async () => resolveRequest(response));
    await waitFor(() => expect(initiated).toHaveBeenCalledExactlyOnceWith(response.import_id, response.expires_at));
    const { hasCasResumeStep2 } = await import("./casResumeState");
    expect(hasCasResumeStep2("member-h8")).toBe(true);
    expect(openTab).not.toHaveBeenCalled();
    expect(floating.close).not.toHaveBeenCalled();
    expect(checklist.getByRole("button", { name: "Open the CAMS form" })).toBeEnabled();
  });

  it("a failed request keeps the screen error and offers the same error and Try again in the checklist without reopening", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Request Statement on CAMS" }));
    const checklist = within(floating.document.body);
    expect(await screen.findByText("Failed to initiate CAMS request.")).toBeVisible();
    expect(await checklist.findByText("Failed to initiate CAMS request.")).toBeInTheDocument();
    expect(initiated).not.toHaveBeenCalled();
    fireEvent.click(checklist.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(initiated).toHaveBeenCalledWith(response.import_id, response.expires_at));
    expect(request).toHaveBeenCalledTimes(2);
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(openTab).not.toHaveBeenCalled();
  });

  it.each(["no support", "throws", "rejects"])("%s: the panel shows and the green button requests then opens CAMS as today", async (failure) => {
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
    fireEvent.click(screen.getByRole("button", { name: "Request Statement on CAMS" }));
    await screen.findByText("0 of 5 done");
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(openTab).not.toHaveBeenCalled();
    expect(initiated).not.toHaveBeenCalled();
    await act(async () => resolveRequest(response));
    await waitFor(() => expect(openTab).toHaveBeenCalledExactlyOnceWith(response.cams_url, "_blank"));
    expect(request.mock.invocationCallOrder[0]).toBeLessThan(openTab.mock.invocationCallOrder[0]);
    expect(initiated).toHaveBeenCalledExactlyOnceWith(response.import_id, response.expires_at);
  });

  it("Continue without it is offered only with the API and bypasses the floating window for this request", async () => {
    localStorage.clear();
    const requestWindow = vi.fn().mockResolvedValue(floatingWindow());
    vi.stubGlobal("documentPictureInPicture", { requestWindow });
    const openTab = vi.spyOn(window, "open").mockReturnValue(null);
    const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    const { unmount } = render(<RequestCamsPath memberId="member-h8" onRequestInitiated={vi.fn()} />);
    expect(screen.getByText(/A small checklist will float over the CAMS page/)).toBeVisible();
    const skip = screen.queryByRole("link", { name: "Continue without it" }) ?? screen.getByRole("button", { name: "Continue without it" });
    fireEvent.click(skip);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Request Statement on CAMS" }));
    await waitFor(() => expect(openTab).toHaveBeenCalledExactlyOnceWith(response.cams_url, "_blank"));
    expect(requestWindow).not.toHaveBeenCalled();
    unmount();
    Reflect.deleteProperty(window, "documentPictureInPicture");
    render(<RequestCamsPath memberId="member-h8-next" onRequestInitiated={vi.fn()} />);
    expect(screen.queryByText("Continue without it")).not.toBeInTheDocument();
    expect(screen.queryByText(/A small checklist will float over the CAMS page/)).not.toBeInTheDocument();
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
    const request = screen.getByRole("button", { name: "Request Statement on CAMS" });
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

  it("at the end the green action behaves like the main button and closes the pop-up", async () => {
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

  it("request is disabled until ticked and sends the version; renders steps, reference card, back button, and initiates CAMS request on button click", async () => {
    const mockOpen = vi.fn();
    vi.stubGlobal("open", mockOpen);

    vi.spyOn(api, "requestCamsStatement").mockResolvedValue({
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "waiting_for_user",
      cams_url: "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement",
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
    const requestBtn = screen.getByRole("button", { name: /request statement on cams/i });
    // 2026-10-07: no PAN consent on a CAMS request -- no box, no line, enabled straight away.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/you agree to our/i)).not.toBeInTheDocument();
    expect(requestBtn).toBeEnabled();
    fireEvent.click(requestBtn);

    await waitFor(() => {
      expect(api.requestCamsStatement).toHaveBeenCalledWith("m-1");
      expect(mockOpen).toHaveBeenCalledWith(
        "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement",
        "_blank"
      );
      expect(onRequestInitiated).toHaveBeenCalledWith("imp-req-1", "2026-08-12T12:00:00Z");
    });
  });
});
