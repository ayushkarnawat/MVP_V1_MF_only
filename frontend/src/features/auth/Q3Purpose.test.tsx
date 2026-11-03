import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Q3Purpose } from "./Q3Purpose";

const SIX = ["wealth_creation", "retirement", "childrens_education", "buy_home", "financial_freedom", "tax_planning"];
const NAMES = [/build my wealth/i, /plan for retirement/i, /fund my children's education/i, /buy a home/i, /achieve financial freedom/i, /plan my taxes/i];

const setup = (selected: string[] = []) => {
  const onContinue = vi.fn();
  const onSkip = vi.fn();
  render(<Q3Purpose selectedValues={selected as never} onBack={vi.fn()} onSkip={onSkip} onContinue={onContinue} />);
  return { onContinue, onSkip };
};
const all = () => screen.getByRole("checkbox", { name: /why choose\? all of it\./i });

it("shows the six life goals, with no subtitles", () => {
  setup();
  for (const name of NAMES) expect(screen.getByRole("checkbox", { name })).toBeInTheDocument();
  expect(screen.queryByText(/across every broker/i)).toBeNull();
  expect(screen.queryByText(/compare returns and costs/i)).toBeNull();
});

it("all of it ticks every goal and sends only the six new codes", () => {
  const { onContinue } = setup();
  fireEvent.click(all());
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  expect(onContinue).toHaveBeenCalledWith(SIX);
});

it("unticking one goal unticks all of it", () => {
  setup();
  fireEvent.click(all());
  fireEvent.click(screen.getByRole("checkbox", { name: /fund my children's education/i }));
  expect(all()).toHaveAttribute("aria-checked", "false");
});

it("ticking all six by hand lights up all of it", () => {
  setup();
  for (const name of NAMES) fireEvent.click(screen.getByRole("checkbox", { name }));
  expect(all()).toHaveAttribute("aria-checked", "true");
});

it("tapping all of it again clears everything", () => {
  setup();
  fireEvent.click(all());
  fireEvent.click(all());
  expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
});

it("sends exactly the goals that were ticked", () => {
  const { onContinue } = setup();
  fireEvent.click(screen.getByRole("checkbox", { name: /buy a home/i }));
  fireEvent.click(screen.getByRole("checkbox", { name: /plan my taxes/i }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  expect(onContinue).toHaveBeenCalledWith(["buy_home", "tax_planning"]);
});

it("ignores an old stored goal code: nothing looks ticked, Continue sends only the new codes", () => {
  const { onContinue } = setup(["consolidated_view", "buy_home"]);
  expect(screen.getAllByRole("checkbox").filter(box => (box as HTMLInputElement).checked || box.getAttribute("aria-checked") === "true")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  expect(onContinue).toHaveBeenCalledWith(["buy_home"]);
});

it("Skip still works", () => {
  const { onSkip, onContinue } = setup();
  fireEvent.click(screen.getByRole("button", { name: /skip/i }));
  expect(onSkip).toHaveBeenCalledTimes(1);
  expect(onContinue).not.toHaveBeenCalled();
});
