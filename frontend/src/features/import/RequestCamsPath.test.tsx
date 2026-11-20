import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { RequestCamsPath } from "./RequestCamsPath";
import * as api from "./api";

vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  const { DOCS } = await import("../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
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
