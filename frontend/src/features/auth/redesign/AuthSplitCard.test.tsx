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
  it("centres one 440 px block both ways in the content row (auto margins, so a tall block scrolls instead of clipping)", () => {
    mount();
    const block = screen.getByTestId("auth-block");
    expect(block.className).toContain("m-auto");
    expect(block.className).toContain("max-w-[440px]");
    expect(block.className).toContain("w-full");
    expect(screen.getByTestId("auth-content").className).toContain("overflow-y-auto");
    expect(within(block).getByTestId("the-form")).toBeInTheDocument();
  });
  it("the top bar is the same height on every screen; the bottom row only exists when given, with a hairline unless switched off", () => {
    const { unmount } = mount();
    expect(screen.getByTestId("auth-topbar").className).toContain("h-10");
    expect(screen.queryByTestId("auth-bottom")).toBeNull();
    unmount();
    const second = mount({ step: 3, onBack: () => {}, bottom: <a href="/">Log in</a> });
    expect(screen.getByTestId("auth-topbar").className).toContain("h-10");
    expect(screen.getByTestId("auth-bottom").className).toContain("border-t");
    second.unmount();
    mount({ bottom: <a href="/">Log in</a>, bottomRule: false });
    expect(screen.getByTestId("auth-bottom").className).not.toContain("border-t");
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
  it("is as tall as the window allows (the height budget), and stacks below 1024 px", () => {
    mount();
    const card = screen.getByTestId("auth-card");
    expect(card.className).toContain("grid-cols-1");
    expect(card.className).toMatch(/lg:grid-cols-/);
    expect(card.className).toContain("lg:h-[var(--auth-card-h)]");
  });
  it("tells the left panel which layout and tone it has, as data attributes (wide for sign-up 1 and log-in 1)", () => {
    const { unmount } = mount();
    expect(screen.getByTestId("auth-card")).toHaveAttribute("data-layout", "stacked");
    expect(screen.getByTestId("auth-card")).toHaveAttribute("data-tone", "mint");
    unmount();
    mount({ layout: "wide", tone: "white" });
    expect(screen.getByTestId("auth-card")).toHaveAttribute("data-layout", "wide");
    expect(screen.getByTestId("auth-card")).toHaveAttribute("data-tone", "white");
    expect(screen.getByTestId("auth-left-slot").className).toContain("auth-left-white");
  });
});
