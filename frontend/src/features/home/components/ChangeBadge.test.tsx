import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChangeBadge } from "./ChangeBadge";

function badge() {
  return screen.getByTestId("change-badge");
}

describe("ChangeBadge", () => {
  it("shows an up arrow, the signed amount and the signed percentage for a gain", () => {
    render(<ChangeBadge amount="38400.00" pct="0.6012" />);
    expect(badge().textContent).toBe("▲ +₹38,400 (+0.60%)");
    expect(badge().getAttribute("data-direction")).toBe("up");
  });

  it("shows a down arrow and keeps the minus before the rupee sign for a loss", () => {
    render(<ChangeBadge amount="-38400.00" pct="-0.6012" />);
    expect(badge().textContent).toBe("▼ -₹38,400 (-0.60%)");
    expect(badge().getAttribute("data-direction")).toBe("down");
  });

  it("shows a dash and no signs for no change", () => {
    render(<ChangeBadge amount="0.00" pct="0.0000" />);
    expect(badge().textContent).toBe("– ₹0 (0.00%)");
    expect(badge().getAttribute("data-direction")).toBe("flat");
  });

  it("leaves out the percentage when it is not known", () => {
    render(<ChangeBadge amount="12.00" pct={null} />);
    expect(badge().textContent).toBe("▲ +₹12");
  });

  it("treats a change that rounds to zero rupees as neutral, not a green gain", () => {
    render(<ChangeBadge amount="0.30" pct="0.0010" />);
    expect(badge().textContent).toBe("– ₹0 (0.00%)");
    expect(badge().getAttribute("data-direction")).toBe("flat");
    expect(badge().className).not.toContain("pos-text");
  });

  it("treats a small loss that rounds to zero rupees as neutral too", () => {
    render(<ChangeBadge amount="-0.40" pct={null} />);
    expect(badge().getAttribute("data-direction")).toBe("flat");
  });

  it("shows only a dash when there is no amount", () => {
    render(<ChangeBadge amount={null} pct={null} />);
    expect(badge().textContent).toBe("—");
    expect(badge().getAttribute("data-direction")).toBe("flat");
  });

  it("masks the figures when values are hidden, and keeps the direction", () => {
    render(<ChangeBadge amount="38400.00" pct="0.6012" hidden />);
    expect(badge().textContent).toBe("••••••");
    expect(badge().textContent).not.toContain("38");
    expect(badge().getAttribute("data-direction")).toBe("up");
  });

  it("colours through the palette variables only", () => {
    const { container } = render(<ChangeBadge amount="1.00" pct="0.1" />);
    expect(container.innerHTML).toContain("var(--pos-text)");
    expect(container.innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it("uses the negative text colour for a loss and the muted colour for no change", () => {
    const loss = render(<ChangeBadge amount="-1.00" pct="-0.1" />);
    expect(loss.container.innerHTML).toContain("var(--neg-text)");
    loss.unmount();
    const flat = render(<ChangeBadge amount="0" pct="0" />);
    expect(flat.container.innerHTML).toContain("var(--ui-text-muted)");
  });
});
