import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Q3Purpose } from "./Q3Purpose";

const setup = (selected: string[] = []) => {
  const onContinue = vi.fn();
  render(<Q3Purpose selectedValues={selected as never} onBack={vi.fn()} onSkip={vi.fn()} onContinue={onContinue} />);
  return { onContinue };
};
const all = () => screen.getByRole("checkbox", { name: /why choose\? all of it\./i });

it("all of it ticks every goal", () => {
  const { onContinue } = setup();
  fireEvent.click(all());
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  expect(onContinue).toHaveBeenCalledWith(["consolidated_view", "understand_holdings", "family_management", "performance_comparison"]);
});

it("unticking one goal unticks all of it", () => {
  setup();
  fireEvent.click(all());
  fireEvent.click(screen.getByRole("checkbox", { name: /family wealth tracking/i }));
  expect(all()).toHaveAttribute("aria-checked", "false");
});

it("ticking all four by hand lights up all of it", () => {
  setup();
  for (const n of [/consolidated portfolio view/i, /understand true performance/i, /family wealth tracking/i, /compare distributor fees/i])
    fireEvent.click(screen.getByRole("checkbox", { name: n }));
  expect(all()).toHaveAttribute("aria-checked", "true");
});

it("tapping all of it again clears everything", () => {
  setup();
  fireEvent.click(all());
  fireEvent.click(all());
  expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
});
