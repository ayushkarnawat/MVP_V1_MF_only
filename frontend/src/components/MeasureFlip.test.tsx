import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MeasureFlip } from "./MeasureFlip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { within } from "@testing-library/react";
import { describe } from "vitest";

function setup(face: "xirr" | "returns" = "xirr", canFlip = true) {
  const onFlip = vi.fn();
  const view = render(<MeasureFlip face={face} canFlip={canFlip} onFlip={onFlip} labelXirr="XIRR" labelReturns="Returns"><span>41.8%</span></MeasureFlip>);
  return { ...view, onFlip };
}
it("renders_the_children_and_the_title_of_the_current_face", () => {
  const { unmount } = setup();
  expect(screen.getByText("41.8%")).toBeInTheDocument();
  expect(screen.getByTestId("measure-title").textContent).toBe("XIRR");
  unmount(); setup("returns");
  expect(screen.getByTestId("measure-title").textContent).toBe("Returns");
});
it("button_name_is_show_returns_on_the_xirr_face_and_show_xirr_on_the_returns_face", () => {
  const { unmount } = setup();
  expect(screen.getByTestId("measure-flip")).toHaveAccessibleName("Show Returns");
  unmount(); setup("returns");
  expect(screen.getByTestId("measure-flip")).toHaveAccessibleName("Show XIRR");
});
it("calls_onFlip_on_click_enter_and_space", () => {
  const { onFlip } = setup();
  const button = screen.getByRole("button", { name: "Show Returns" });
  expect(button.tagName).toBe("BUTTON");
  fireEvent.click(button);
  expect(onFlip).toHaveBeenCalledTimes(1);
  button.focus();
  // jsdom does not synthesize the native button click from a key event.
  fireEvent.keyDown(button, { key: "Enter" }); fireEvent.click(button);
  expect(onFlip).toHaveBeenCalledTimes(2);
  fireEvent.keyDown(button, { key: " " }); fireEvent.keyUp(button, { key: " " }); fireEvent.click(button);
  expect(onFlip).toHaveBeenCalledTimes(3);
});
it("hides_the_button_when_canFlip_is_false", () => {
  setup("xirr", false);
  expect(screen.queryByTestId("measure-flip")).toBeNull();
  expect(screen.getByText("41.8%")).toBeInTheDocument();
});
it("has_data_clickable_and_a_polite_live_region", () => {
  setup();
  expect(screen.getByTestId("measure-flip")).toHaveAttribute("data-clickable");
  expect(screen.getByText("41.8%").closest('[aria-live="polite"]')).not.toBeNull();
});
it("focus_stays_on_the_button_after_a_flip", () => {
  function Tile() {
    const [face, setFace] = useState<"xirr" | "returns">("xirr");
    return <MeasureFlip face={face} canFlip onFlip={() => setFace(face === "xirr" ? "returns" : "xirr")} labelXirr="XIRR" labelReturns="Returns"><span>41.8%</span></MeasureFlip>;
  }
  render(<Tile />);
  const button = screen.getByTestId("measure-flip"); button.focus(); fireEvent.click(button);
  expect(button).toHaveFocus(); expect(button).toHaveAccessibleName("Show XIRR");
  fireEvent.click(button); expect(button).toHaveFocus(); expect(button).toHaveAccessibleName("Show Returns");
});

describe("summary bar flip polish", () => {
  it("the_flip_button_is_a_ghost_control_with_the_same_words_and_icon", () => {
    const { unmount, onFlip } = setup();
    const button = screen.getByRole("button", { name: "Show Returns" });
    expect(within(button).getByTestId("flip-label").textContent).toBe("Show Returns");
    expect(button.querySelector("svg.lucide-refresh-cw")).toHaveAttribute("aria-hidden", "true");
    const css = readFileSync(resolve("src/components/MeasureFlip.module.css"), "utf8");
    expect(css).toMatch(/background:\s*transparent/);
    expect(css).toMatch(/border:\s*(?:0|none)\s*;/);
    fireEvent.click(button);
    expect(onFlip).toHaveBeenCalledTimes(1);
    unmount();
    setup("returns");
    expect(screen.getByRole("button", { name: "Show XIRR" })).toHaveTextContent("Show XIRR");
  });

  it("reduced_motion_disables_the_turn", () => {
    const css = readFileSync(resolve("src/components/MeasureFlip.module.css"), "utf8");
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.turn\s*\{[^}]*animation:\s*none\s*;/s);
    const { onFlip } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Show Returns" }));
    expect(onFlip).toHaveBeenCalledTimes(1);
  });
});
