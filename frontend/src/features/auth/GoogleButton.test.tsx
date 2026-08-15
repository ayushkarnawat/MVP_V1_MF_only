import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleButton } from "./GoogleButton";
import { loadedScripts } from "./useOAuthScript";

function mockGoogleGlobal() {
  const initialize = vi.fn();
  const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };
  return { initialize, renderButton };
}

describe("GoogleButton", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    delete (window as { google?: unknown }).google;
    loadedScripts.clear();
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
});
