import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleButton } from "./GoogleButton";
import { loadedScripts } from "./useOAuthScript";

function mockGoogleGlobal() {
  const initialize = vi.fn();
  const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };
  return { initialize, renderButton };
}

describe("GoogleButton", () => {
  beforeEach(() => {
    // No .env is committed, so VITE_GOOGLE_OAUTH_CLIENT_ID is undefined under
    // vitest — stub it so the "not configured" guard doesn't short-circuit the
    // happy-path cases.
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
  });

  afterEach(() => {
    document.head.innerHTML = "";
    delete (window as { google?: unknown }).google;
    loadedScripts.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("initializes GIS and renders the button once the script loads", async () => {
    const { initialize, renderButton } = mockGoogleGlobal();
    render(<GoogleButton onCredential={vi.fn()} />);

    const script = document.head.querySelector("script")!;
    fireEvent.load(script);

    await waitFor(() => expect(initialize).toHaveBeenCalled());
    expect(renderButton).toHaveBeenCalled();
  });

  it("calls onCredential with the returned id_token", async () => {
    const onCredential = vi.fn();
    const { initialize } = mockGoogleGlobal();
    render(<GoogleButton onCredential={onCredential} />);
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(initialize).toHaveBeenCalled());

    const { callback } = initialize.mock.calls[0][0] as { callback: (r: { credential: string }) => void };
    callback({ credential: "fake-id-token" });

    expect(onCredential).toHaveBeenCalledWith("fake-id-token");
  });

  it("shows an inline error if the GIS script fails to load", async () => {
    render(<GoogleButton onCredential={vi.fn()} />);
    const script = document.head.querySelector("script")!;
    fireEvent.error(script);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("sizes the rendered button to its container rather than a hardcoded width", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(288);
    const { initialize, renderButton } = mockGoogleGlobal();
    render(<GoogleButton onCredential={vi.fn()} />);
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(initialize).toHaveBeenCalled());

    expect(renderButton).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ width: 288 }));
  });

  it("clamps the measured width to the GIS maximum on wide containers", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(900);
    const { initialize, renderButton } = mockGoogleGlobal();
    render(<GoogleButton onCredential={vi.fn()} />);
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(initialize).toHaveBeenCalled());

    expect(renderButton).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ width: 320 }));
  });
});
