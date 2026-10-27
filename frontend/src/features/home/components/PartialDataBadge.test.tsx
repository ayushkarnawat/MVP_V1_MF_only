import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PartialDataBadge } from "./PartialDataBadge";

describe("PartialDataBadge", () => {
  it("renders nothing when no fund is missing", () => {
    const { container } = render(<PartialDataBadge missingFunds={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the badge with the missing funds in its title and accessible name", () => {
    render(<PartialDataBadge missingFunds={[
      { scheme_id: "a", name: "Dev Gold Fund" },
      { scheme_id: "b", name: "Asha Flexi Cap" },
    ]} />);
    const badge = screen.getByRole("note");
    expect(badge.textContent).toContain("Partial data");
    expect(badge.getAttribute("title")).toBe("Missing: Dev Gold Fund, Asha Flexi Cap");
    expect(badge.getAttribute("aria-label")).toBe("Partial data. Missing: Dev Gold Fund, Asha Flexi Cap");
  });

  it("keeps the order it was given", () => {
    render(<PartialDataBadge missingFunds={[{ scheme_id: "z", name: "Zeta" }, { scheme_id: "a", name: "Alpha" }]} />);
    expect(screen.getByRole("note").getAttribute("title")).toBe("Missing: Zeta, Alpha");
  });

  it("uses the warning palette variables", () => {
    const { container } = render(<PartialDataBadge missingFunds={[{ scheme_id: "a", name: "A" }]} />);
    expect(container.innerHTML).toContain("var(--warn-bg)");
    expect(container.innerHTML).toContain("var(--warn-text)");
  });
});
