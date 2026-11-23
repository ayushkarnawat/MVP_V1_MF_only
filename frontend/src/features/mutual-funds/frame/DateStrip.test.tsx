import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateStrip } from "./DateStrip";
import type { OlderMarker, StripEntry } from "./stripEntries";

const entries: StripEntry[] = [
  {
    kind: "prices",
    iso: "2026-11-12",
    explain: "Prices: the latest day on which most of your funds have a price. Changes every trading day.",
  },
  {
    kind: "holdings",
    iso: "2026-09-30",
    explain: "Holdings: what each fund held at its last monthly disclosure. Changes once a month.",
  },
];
const olderMarkers: OlderMarker[] = [{
  label: "2 funds have older holdings",
  items: ["Example Growth Fund", "Example Equity Fund"],
}];

describe("DateStrip", () => {
  it("renders one line with the dates joined by a dot (prices and holdings, holdings as a month)", () => {
    render(<DateStrip entries={entries} olderMarkers={[]} />);
    const strip = screen.getByTestId("date-strip");
    const lines = within(strip).getAllByTestId("date-strip-line");
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe("Prices as on 12 Nov 2026 · Holdings as on September 2026");
  });

  it("renders nothing without entries", () => {
    const { container } = render(<DateStrip entries={[]} olderMarkers={olderMarkers} />);
    expect(container.firstChild).toBeNull();
  });

  it("the info mark carries all explain sentences", () => {
    render(<DateStrip entries={entries} olderMarkers={[]} />);
    const info = screen.getByTestId("date-strip-info");
    const text = "Prices: the latest day on which most of your funds have a price. Changes every trading day. Holdings: what each fund held at its last monthly disclosure. Changes once a month.";
    expect(info).toHaveAttribute("role", "img");
    expect(info).toHaveAttribute("aria-label", text);
    expect(info).toHaveAttribute("data-tooltip", text);
  });

  it("an older marker shows its label and its info names the funds", () => {
    render(<DateStrip entries={entries} olderMarkers={olderMarkers} />);
    const lines = screen.getAllByTestId("date-strip-older");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent("2 funds have older holdings");
    const info = within(lines[0]).getByTestId("date-strip-older-info");
    expect(info).toHaveAttribute("role", "img");
    expect(info).toHaveAttribute("aria-label", "Example Growth Fund, Example Equity Fund");
    expect(info).toHaveAttribute("data-tooltip", "Example Growth Fund, Example Equity Fund");
  });

  it("no older line when no marker is passed", () => {
    render(<DateStrip entries={entries} olderMarkers={[]} />);
    expect(screen.queryByTestId("date-strip-older")).not.toBeInTheDocument();
    expect(screen.queryByTestId("date-strip-older-info")).not.toBeInTheDocument();
  });

  it("the strip has no button and no header-slot wrapper", () => {
    const { container } = render(<DateStrip entries={entries} olderMarkers={olderMarkers} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector('button, header, [role="banner"], [data-slot="search"], [data-slot="actions"]')).toBeNull();
  });

  it("dark mode: only token colours", () => {
    const hadDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.add("dark");
    try {
      const { container } = render(<DateStrip entries={entries} olderMarkers={olderMarkers} />);
      expect(screen.getByTestId("date-strip")).toBeInTheDocument();
      expect(container.innerHTML).not.toContain("#");
      for (const element of container.querySelectorAll("[style]")) {
        expect(element.getAttribute("style")).not.toMatch(/(?:color|background|fill|stroke)\s*:/i);
      }
    } finally {
      if (!hadDark) document.documentElement.classList.remove("dark");
    }
  });
});
