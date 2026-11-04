import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthLeftPanel } from "./AuthLeftPanel";

const ROWS = [{ text: "All your accounts in one place." }, { text: "Your family, together." }, { text: "Private by design." }];
const mount = (over: Partial<Parameters<typeof AuthLeftPanel>[0]> = {}) =>
  render(<AuthLeftPanel sketch="laptop" headline={<>One dashboard for your family&apos;s <b>financial life</b></>} paragraph="Pick up where you left off." rows={ROWS} {...over} />);

describe("AuthLeftPanel", () => {
  it("has the logo at the top left", () => {
    mount();
    expect(screen.getByRole("img", { name: "Unifolio" })).toHaveAttribute("src", "/illustrations/auth/unifolio-logo.webp");
  });
  it("draws the sketch with the motion class and the motion of its table row", () => {
    mount({ sketch: "phone" });
    const sketch = screen.getByTestId("auth-sketch");
    expect(sketch).toHaveAttribute("src", "/illustrations/auth/phone-code.webp");
    expect(sketch).toHaveClass("auth-sketch");
    expect(sketch).toHaveAttribute("data-motion", "tilt");
    expect(sketch.style.getPropertyValue("--auth-float-distance")).toBe("5px");
    expect(sketch.style.getPropertyValue("--auth-float-duration")).toBe("6.5s");
    expect(sketch).toHaveAttribute("alt", "");
  });
  it("uses breathe for the person", () => {
    mount({ sketch: "person" });
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("data-motion", "breathe");
  });
  it("keeps the headline, the paragraph and the rows in one left-aligned block", () => {
    mount();
    const block = screen.getByTestId("auth-left-text");
    expect(block.className).toContain("text-left");
    expect(within(block).getByRole("heading", { level: 2 })).toHaveTextContent("One dashboard for your family's financial life");
    expect(within(block).getByText("Pick up where you left off.")).toBeInTheDocument();
    expect(within(block).getAllByRole("listitem").map(item => item.textContent)).toEqual(ROWS.map(row => row.text));
  });
  it("shows an info card or status rows instead of the plain rows when given", () => {
    mount({ rows: undefined, infoCard: <div data-testid="the-info-card" />, status: <div data-testid="the-status" /> });
    expect(screen.getByTestId("the-info-card")).toBeInTheDocument();
    expect(screen.getByTestId("the-status")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("is the mint panel", () => {
    mount();
    expect(screen.getByTestId("auth-left").className).toContain("auth-left-panel");
  });
});
