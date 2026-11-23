import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RunningFooter } from "./RunningFooter";
import { RunningHeader } from "./RunningHeader";

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty("--print-footer-left");
  document.documentElement.style.removeProperty("--print-header-scope");
});

describe("RunningHeader", () => {
  it("header shows the title and the scope name", () => {
    render(<RunningHeader scopeName="Rohan Mehta and family" />);
    expect(screen.getByText("Mutual Fund Portfolio Report")).toBeInTheDocument();
    expect(screen.getByText("Rohan Mehta and family")).toBeInTheDocument();
  });
});

describe("RunningFooter", () => {
  it('footer shows "Generated <date>" and the price note, and omits the price note when null', () => {
    render(<RunningFooter generatedOn="17 Nov 2026" priceNote="Prices: 5 Oct 2026" />);
    expect(screen.getByText("Generated 17 Nov 2026 · Prices: 5 Oct 2026")).toBeInTheDocument();

    cleanup();
    render(<RunningFooter generatedOn="17 Nov 2026" priceNote={null} />);
    expect(screen.getByText("Generated 17 Nov 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Prices/)).not.toBeInTheDocument();
  });

  it("footer sets --print-footer-left on the root", () => {
    render(<RunningFooter generatedOn="17 Nov 2026" priceNote="Prices: 5 Oct 2026" />);
    expect(document.documentElement.style.getPropertyValue("--print-footer-left")).toBe(
      '"Generated 17 Nov 2026 · Prices: 5 Oct 2026"',
    );

    cleanup();
    render(<RunningFooter generatedOn="17 Nov 2026" priceNote={null} />);
    expect(document.documentElement.style.getPropertyValue("--print-footer-left")).toBe(
      '"Generated 17 Nov 2026"',
    );
  });
});
