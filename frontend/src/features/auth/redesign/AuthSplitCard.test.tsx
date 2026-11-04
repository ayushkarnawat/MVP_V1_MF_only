import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthSplitCard } from "./AuthSplitCard";

const mount = (over: Partial<Parameters<typeof AuthSplitCard>[0]> = {}) =>
  render(<AuthSplitCard left={<div data-testid="the-left" />} right={<form data-testid="the-form" />} {...over} />);

describe("AuthSplitCard", () => {
  it("is a card with the left panel and a right panel of three rows", () => {
    mount({ step: 2, onBack: vi.fn(), bottom: <p>Already have an account?</p> });
    expect(screen.getByTestId("the-left")).toBeInTheDocument();
    const right = screen.getByTestId("auth-right");
    expect(within(right).getByTestId("auth-topbar")).toBeInTheDocument();
    expect(within(right).getByTestId("auth-content")).toBeInTheDocument();
    expect(within(right).getByTestId("auth-bottom")).toBeInTheDocument();
    expect(right.firstElementChild).toBe(screen.getByTestId("auth-topbar"));
    expect(right.lastElementChild).toBe(screen.getByTestId("auth-bottom"));
  });
  it("centres one 360 px block both ways in the content row", () => {
    mount();
    const content = screen.getByTestId("auth-content");
    expect(content.className).toContain("items-center");
    expect(content.className).toContain("justify-center");
    const block = screen.getByTestId("auth-block");
    expect(block.className).toContain("max-w-[360px]");
    expect(block.className).toContain("w-full");
    expect(within(block).getByTestId("the-form")).toBeInTheDocument();
  });
  it("the top bar and the bottom row keep their 56 px height, with or without content", () => {
    const { unmount } = mount();
    expect(screen.getByTestId("auth-topbar").className).toContain("h-14");
    expect(screen.getByTestId("auth-bottom").className).toContain("h-14");
    unmount();
    mount({ step: 3, onBack: () => {}, bottom: <a href="/">Log in</a> });
    expect(screen.getByTestId("auth-topbar").className).toContain("h-14");
    expect(screen.getByTestId("auth-bottom").className).toContain("h-14");
  });
  it("shows Back on the left and the step on the right, the same on every screen", () => {
    const onBack = vi.fn();
    mount({ step: 3, onBack });
    const bar = screen.getByTestId("auth-topbar");
    expect(bar.firstElementChild).toContainElement(screen.getByRole("button", { name: "Back" }));
    expect(bar.lastElementChild).toHaveTextContent("Step 3 of 5");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it("sign-up screen 1 has no Back and the bar does not move", () => {
    mount({ step: 1 });
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByTestId("auth-topbar")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
  });
  it("shows Done on the last screen", () => {
    mount({ step: 5, done: true });
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
  it("has 40 px padding on both panels, equal heights, and stacks below 1024 px", () => {
    mount();
    const card = screen.getByTestId("auth-card");
    expect(card.className).toContain("grid-cols-1");
    expect(card.className).toMatch(/lg:grid-cols-/);
    expect(screen.getByTestId("auth-right").className).toContain("p-10");
    expect(screen.getByTestId("auth-left-slot").className).toContain("p-10");
  });
});
