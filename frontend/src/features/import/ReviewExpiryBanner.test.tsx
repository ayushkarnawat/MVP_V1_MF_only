import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewExpiryBanner } from "./ReviewExpiryBanner";

const MESSAGE = "Your review closes in 5 minutes. Confirm imports to save it.";

describe("ReviewExpiryBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("appears at expiresAt minus 5 minutes (the 55-minute mark)", () => {
    render(<ReviewExpiryBanner expiresAt="2026-09-29T11:00:00Z" />);
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(54 * 60 * 1000 + 59_000); });
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
  });

  it("shows straight away when less than 5 minutes remain", () => {
    render(<ReviewExpiryBanner expiresAt="2026-09-29T10:03:00Z" />);
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
  });
});
