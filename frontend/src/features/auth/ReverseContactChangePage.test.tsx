import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import * as api from "./api";
import ReverseContactChangePage from "./ReverseContactChangePage";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    getMe: vi.fn(),
    reverseContactChange: vi.fn(actual.reverseContactChange),
  };
});

describe("ReverseContactChangePage", () => {
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
    window.history.replaceState(null, "", "/reverse-contact-change#token=secret-reverse-tok-1");

    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "The sign-in email or phone on your account was changed",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "If this was you, you can close this page. If it was not you, you can undo the change now. Everyone will be signed out.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "This was not me, undo the change" }),
    ).toBeEnabled();
    expect(api.reverseContactChange).not.toHaveBeenCalled();
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
    window.history.replaceState(null, "", "/reverse-contact-change#token=secret-reverse-tok-2");

    render(<ReverseContactChangePage />);

    const button = screen.getByRole("button", { name: "This was not me, undo the change" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(api.reverseContactChange).toHaveBeenCalledTimes(1);
    expect(api.reverseContactChange).toHaveBeenCalledWith("secret-reverse-tok-2");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/contact-change/reverse");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ token: "secret-reverse-tok-2" });
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined();

    resolveFetch(new Response(JSON.stringify({ status: "reversed" }), { status: 200 }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "The change has been undone and everyone has been signed out. Sign in with your usual email or phone number.",
        ),
      ).toBeInTheDocument(),
    );
    expect(button).toBeDisabled();
  });

  it("the_token_is_removed_from_the_address_bar", () => {
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    window.history.replaceState(null, "", "/reverse-contact-change#token=secret-reverse-tok-3");
    replaceSpy.mockClear();

    render(<ReverseContactChangePage />);

    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("secret-reverse-tok-3");
    replaceSpy.mockRestore();
  });

  it("no_token_shows_the_invalid_message", () => {
    window.history.replaceState(null, "", "/reverse-contact-change");

    render(<ReverseContactChangePage />);

    // Changed from the bare "This link is not valid.": a refreshed page has lost its token, so say what to do.
    expect(
      screen.getByText(
        "This link is not valid. If you refreshed this page, open the link in your email again.",
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/");
    expect(
      screen.queryByRole("button", { name: "This was not me, undo the change" }),
    ).not.toBeInTheDocument();
    expect(api.reverseContactChange).not.toHaveBeenCalled();
  });

  it("a_refresh_after_the_token_was_removed_shows_the_open-the-link-again_message_and_stores_nothing", () => {
    window.history.replaceState(null, "", "/reverse-contact-change#token=secret-reverse-tok-r");
    const first = render(<ReverseContactChangePage />);
    expect(window.location.hash).toBe("");
    first.unmount();

    render(<ReverseContactChangePage />);

    expect(screen.getByRole("alert")).toHaveTextContent("If you refreshed this page, open the link in your email again.");
    expect(JSON.stringify({ ...localStorage })).not.toContain("secret-reverse-tok-r");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("secret-reverse-tok-r");
  });

  it("the_green_button_has_white_text", () => {
    window.history.replaceState(null, "", "/reverse-contact-change#token=secret-reverse-tok-w");
    render(<ReverseContactChangePage />);

    const button = screen.getByRole("button", { name: "This was not me, undo the change" });
    expect(button.className).toContain("text-white");
    expect(button.className).not.toContain("text-black");
  });

  it("errors_use_the_negative_text_token_and_sign_in_links_the_positive_one", async () => {
    window.history.replaceState(null, "", "/reverse-contact-change#token=secret-reverse-tok-c");
    const view = render(<ReverseContactChangePage />);
    vi.mocked(api.reverseContactChange).mockRejectedValueOnce(
      new api.ApiError(409, { code: "reverse_changed", message: "This was changed again since." }),
    );
    fireEvent.click(screen.getByRole("button", { name: "This was not me, undo the change" }));
    const alert = await screen.findByRole("alert");
    expect(alert.className).toContain("text-[var(--neg-text)]");
    expect(alert.className).not.toContain("text-red-500");

    vi.mocked(api.reverseContactChange).mockResolvedValueOnce({ status: "reversed" });
    fireEvent.click(screen.getByRole("button", { name: "This was not me, undo the change" }));
    expect(await screen.findByRole("link", { name: /sign in/i })).toHaveClass("text-[var(--pos-text)]");
    view.unmount();

    window.history.replaceState(null, "", "/reverse-contact-change");
    render(<ReverseContactChangePage />);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveClass("text-[var(--pos-text)]");
  });

  it("each_error_message_is_shown", async () => {
    const retryableCases = [
      {
        status: 409,
        code: "reverse_changed",
        message: "This was changed again since. Please contact support@unifolio.in.",
      },
      {
        status: 409,
        code: "reverse_contact_taken",
        message:
          "The old email or phone has been taken since the change, so it cannot be put back. Please contact support@unifolio.in.",
      },
    ];

    window.history.replaceState(null, "", "/reverse-contact-change#token=secret-reverse-tok-err");
    const { unmount } = render(<ReverseContactChangePage />);
    const button = screen.getByRole("button", { name: "This was not me, undo the change" });

    for (const c of retryableCases) {
      vi.mocked(api.reverseContactChange).mockRejectedValueOnce(
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
        code: "reverse_not_found",
        message: "This link is not valid.",
      },
      {
        status: 410,
        code: "reverse_expired",
        message: "The 7-day window to undo this has closed.",
      },
    ];

    for (const c of terminalCases) {
      window.history.replaceState(
        null,
        "",
        "/reverse-contact-change#token=secret-reverse-tok-term",
      );
      const view = render(<ReverseContactChangePage />);
      const termBtn = screen.getByRole("button", { name: "This was not me, undo the change" });
      vi.mocked(api.reverseContactChange).mockRejectedValueOnce(
        new api.ApiError(c.status, { code: c.code, message: c.message }),
      );
      fireEvent.click(termBtn);
      expect(await screen.findByText(c.message)).toBeInTheDocument();
      expect(termBtn).toBeDisabled();
      view.unmount();
    }
  });

  it("success_shows_the_sign_in_link", async () => {
    vi.mocked(api.reverseContactChange).mockResolvedValueOnce({ status: "reversed" });
    window.history.replaceState(null, "", "/reverse-contact-change#token=secret-reverse-tok-ok");

    render(<ReverseContactChangePage />);

    const button = screen.getByRole("button", { name: "This was not me, undo the change" });
    fireEvent.click(button);

    expect(
      await screen.findByText(
        "The change has been undone and everyone has been signed out. Sign in with your usual email or phone number.",
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/");
    expect(button).toBeDisabled();
  });
});
