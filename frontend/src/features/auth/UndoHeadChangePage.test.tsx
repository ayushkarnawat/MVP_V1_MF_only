import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import * as api from "./api";
import UndoHeadChangePage from "./UndoHeadChangePage";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    getMe: vi.fn(),
    undoHeadChange: vi.fn(actual.undoHeadChange),
  };
});

describe("UndoHeadChangePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("does_not_call_the_server_on_load", () => {
    localStorage.setItem("unifolio_session_token", "existing-session");
    window.history.replaceState(null, "", "/undo-head-change#token=secret-undo-tok-1");

    render(<App />);

    expect(
      screen.getByText(
        "The Head of Family on your Unifolio account was changed. If you did not agree to this, you can undo it now.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo the change" })).toBeEnabled();
    expect(api.undoHeadChange).not.toHaveBeenCalled();
    expect(api.getMe).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
  });

  it("the_button_posts_the_token_once", async () => {
    localStorage.setItem("unifolio_session_token", "session-should-not-be-sent");
    let resolveFetch!: (value: Response) => void;
    const fetchSpy = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    window.history.replaceState(null, "", "/undo-head-change#token=secret-undo-tok-2");

    render(<UndoHeadChangePage />);

    const button = screen.getByRole("button", { name: "Undo the change" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(api.undoHeadChange).toHaveBeenCalledTimes(1);
    expect(api.undoHeadChange).toHaveBeenCalledWith("secret-undo-tok-2");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/head-change/undo");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ token: "secret-undo-tok-2" });
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined();

    resolveFetch(new Response(JSON.stringify({ status: "undone" }), { status: 200 }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "The change has been undone. Sign in with your usual email or phone number.",
        ),
      ).toBeInTheDocument(),
    );
    expect(button).toBeDisabled();
  });

  it("the_token_is_removed_from_the_address_bar", () => {
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    window.history.replaceState(null, "", "/undo-head-change#token=secret-undo-tok-3");
    replaceSpy.mockClear();

    render(<UndoHeadChangePage />);

    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("secret-undo-tok-3");
    replaceSpy.mockRestore();
  });

  it("no_token_shows_the_invalid_message", () => {
    window.history.replaceState(null, "", "/undo-head-change");

    render(<UndoHeadChangePage />);

    expect(screen.getByText("This undo link is not valid.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Undo the change" })).not.toBeInTheDocument();
    expect(api.undoHeadChange).not.toHaveBeenCalled();
  });

  it("each_error_message_is_shown", async () => {
    const retryableCases = [
      {
        status: 409,
        code: "undo_contact_taken",
        message: "The previous email or phone has been taken since the change.",
      },
      {
        status: 409,
        code: "request_changed",
        message: "Another Head of Family change happened after this one.",
      },
      {
        status: 403,
        code: "account_pending_deletion",
        message: "This account is scheduled for deletion.",
      },
    ];

    window.history.replaceState(null, "", "/undo-head-change#token=secret-undo-tok-err");
    const { unmount } = render(<UndoHeadChangePage />);
    const button = screen.getByRole("button", { name: "Undo the change" });

    for (const c of retryableCases) {
      vi.mocked(api.undoHeadChange).mockRejectedValueOnce(
        new api.ApiError(c.status, { code: c.code, message: c.message }),
      );
      fireEvent.click(button);
      expect(await screen.findByText(c.message)).toBeInTheDocument();
      expect(button).toBeEnabled();
    }
    unmount();

    const terminalCases = [
      {
        status: 404,
        code: "undo_not_found",
        message: "This undo link is not valid.",
      },
      {
        status: 410,
        code: "undo_expired",
        message: "The 24-hour undo window has closed.",
      },
    ];

    for (const c of terminalCases) {
      window.history.replaceState(null, "", "/undo-head-change#token=secret-undo-tok-term");
      const view = render(<UndoHeadChangePage />);
      const termBtn = screen.getByRole("button", { name: "Undo the change" });
      vi.mocked(api.undoHeadChange).mockRejectedValueOnce(
        new api.ApiError(c.status, { code: c.code, message: c.message }),
      );
      fireEvent.click(termBtn);
      expect(await screen.findByText(c.message)).toBeInTheDocument();
      expect(termBtn).toBeDisabled();
      view.unmount();
    }
  });

  it("success_shows_the_sign_in_link", async () => {
    vi.mocked(api.undoHeadChange).mockResolvedValueOnce({ status: "undone" });
    window.history.replaceState(null, "", "/undo-head-change#token=secret-undo-tok-ok");

    render(<UndoHeadChangePage />);

    const button = screen.getByRole("button", { name: "Undo the change" });
    fireEvent.click(button);

    expect(
      await screen.findByText(
        "The change has been undone. Sign in with your usual email or phone number.",
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/");
    expect(button).toBeDisabled();
  });
});
