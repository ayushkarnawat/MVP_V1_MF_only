import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataDateLabel } from "./DataDateLabel";

describe("DataDateLabel", () => {
  it("renders the formatted phrase inside a span", () => {
    render(<DataDateLabel kind="prices" iso="2026-11-12" />);
    const el = screen.getByText("Prices as on 12 Nov 2026");
    expect(el.tagName).toBe("SPAN");
  });

  it("renders nothing for an invalid or empty date", () => {
    const { container } = render(<DataDateLabel kind="holdings" iso="" />);
    expect(container.firstChild).toBeNull();

    const { container: invalidContainer } = render(<DataDateLabel kind="holdings" iso="2026-02-30" />);
    expect(invalidContainer.firstChild).toBeNull();
  });

  it("passes className to the span", () => {
    render(<DataDateLabel kind="holdings" iso="2026-09-30" className="text-xs text-muted" />);
    const el = screen.getByText("Holdings as on September 2026");
    expect(el).toHaveClass("text-xs", "text-muted");
  });
});
