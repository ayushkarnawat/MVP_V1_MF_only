import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MaintenanceBanner, isWithinMaintenanceWindow } from "./maintenance-banner";

describe("isWithinMaintenanceWindow", () => {
  it("is true at 9:00 PM IST (15:30 UTC)", () => {
    expect(isWithinMaintenanceWindow(new Date("2026-01-01T15:30:00Z"))).toBe(true);
  });

  it("is true just before 5:00 AM IST (23:00 UTC)", () => {
    expect(isWithinMaintenanceWindow(new Date("2026-01-01T23:00:00Z"))).toBe(true);
  });

  it("is false at noon IST (06:30 UTC)", () => {
    expect(isWithinMaintenanceWindow(new Date("2026-01-01T06:30:00Z"))).toBe(false);
  });

  it("is false at exactly 5:00 AM IST (23:30 UTC the prior day)", () => {
    expect(isWithinMaintenanceWindow(new Date("2026-01-01T23:30:00Z"))).toBe(false);
  });
});

describe("MaintenanceBanner", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders during the maintenance window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T15:30:00Z")); // 9:00 PM IST
    render(<MaintenanceBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/scheduled maintenance/i);
  });

  it("renders nothing outside the maintenance window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T06:30:00Z")); // noon IST
    render(<MaintenanceBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
