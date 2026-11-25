import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InfoPopover } from "./InfoPopover";
import { INFO_GLYPH_CLASS } from "./infoGlyph";
import { InfoMark } from "../../features/mutual-funds/common/SectionCard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InfoPopover", () => {
  it("opens on hover after a short pause and on focus", () => {
    vi.useFakeTimers();
    render(<InfoPopover label="About returns">Return details</InfoPopover>);
    const trigger = screen.getByRole("button", { name: "About returns" });
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(249); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("dialog")).toHaveTextContent("Return details");
    fireEvent.mouseLeave(trigger);
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => { trigger.focus(); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("click or Enter pins it open and a later hover-out keeps it open", async () => {
    for (const activation of ["click", "Enter", " "]) {
      const view = render(<InfoPopover label="About returns">Return details</InfoPopover>);
      const trigger = screen.getByRole("button", { name: "About returns" });
      act(() => { trigger.focus(); });
      if (activation === "click") fireEvent.click(trigger);
      else fireEvent.keyDown(trigger, { key: activation });
      fireEvent.mouseLeave(trigger);
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(screen.getByRole("dialog")).toHaveTextContent("Return details");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      view.unmount();
    }
  });

  it("Escape and outside click close it and focus returns to the trigger", async () => {
    render(<><InfoPopover label="About returns">Return details</InfoPopover><button data-clickable="">Outside</button></>);
    const trigger = screen.getByRole("button", { name: "About returns" });
    act(() => { trigger.focus(); });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => { expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Radix registers its outside-pointer listener on the next tick after the layer mounts.
    await new Promise(resolve => setTimeout(resolve, 20));
    { const outside = screen.getByRole("button", { name: "Outside" }); fireEvent.pointerDown(outside, { pointerType: "mouse", button: 0 }); fireEvent.mouseDown(outside); fireEvent.click(outside); }
    await waitFor(() => { expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
    expect(trigger).toHaveFocus();
  });

  it("content scrolls and width is capped", async () => {
    render(<InfoPopover label="About returns">Return details</InfoPopover>);
    fireEvent.click(screen.getByRole("button", { name: "About returns" }));
    expect(await screen.findByRole("dialog")).toHaveClass("max-w-[20rem]", "max-h-[60vh]", "overflow-y-auto");
  });

  it("side prop sets the placement attribute", async () => {
    render(<InfoPopover label="About returns" side="top">Return details</InfoPopover>);
    fireEvent.click(screen.getByRole("button", { name: "About returns" }));
    await waitFor(() => { expect(screen.getByRole("dialog")).toHaveAttribute("data-side", "top"); });
  });

  it("a custom trigger is used when given", async () => {
    render(<InfoPopover label="About returns" trigger={<span role="img" tabIndex={0}>Details</span>}>Return details</InfoPopover>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("img", { name: "About returns" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Return details");
  });

  it("the title renders when given", async () => {
    render(<InfoPopover label="About returns" title="Returns">Return details</InfoPopover>);
    fireEvent.click(screen.getByRole("button", { name: "About returns" }));
    expect(await screen.findByRole("heading", { name: "Returns" })).toHaveClass("font-semibold");
  });

  it("no hex colours in the markup", async () => {
    render(<InfoPopover label="About returns" title="Returns">Return details</InfoPopover>);
    fireEvent.click(screen.getByRole("button", { name: "About returns" }));
    await screen.findByRole("dialog");
    expect(document.body.innerHTML).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
});

it("default_trigger_and_infomark_share_the_info_glyph_class", () => {
  render(<><InfoPopover label="About returns">Return details</InfoPopover><InfoMark text="About valuation" /></>);
  for (const trigger of [screen.getByRole("button", { name: "About returns" }), screen.getByRole("img", { name: "About valuation" })]) {
    expect(trigger.className).toContain(INFO_GLYPH_CLASS);
  }
});
