import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { benchmarkColor } from "./benchmarkColors";
import type { WealthBenchmarkOption } from "./types";
import { MAX_BENCHMARKS } from "./benchmarkChoice";
import { BenchmarkChecklist } from "./BenchmarkChecklist";

const OPTIONS: WealthBenchmarkOption[] = [
  { index: "nifty_50", label: "Nifty 50", recommended: false },
  { index: "nifty_500", label: "Nifty 500", recommended: true },
  { index: "nifty_largemidcap_250", label: "Nifty LargeMidcap 250", recommended: false },
  { index: "nifty_midcap_150", label: "Nifty Midcap 150", recommended: false },
  { index: "nifty_smallcap_250", label: "Nifty Smallcap 250", recommended: false },
];

describe("BenchmarkChecklist", () => {
  it('allows at most MAX_BENCHMARKS and a fourth shows "Choose up to 3"', () => {
    expect(MAX_BENCHMARKS).toBe(3);
    const onChange = vi.fn();
    render(
      <BenchmarkChecklist
        options={OPTIONS}
        values={["nifty_50", "nifty_500", "nifty_largemidcap_250"]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: /3 benchmarks/i });
    fireEvent.click(trigger);

    const group = screen.getByRole("group", { name: /benchmark/i });
    expect(within(group).queryByText("Choose up to 3")).toBeNull();

    const fourth = within(group).getByRole("checkbox", { name: "Nifty Midcap 150" });
    expect(fourth).not.toBeChecked();

    fireEvent.click(fourth);
    expect(onChange).not.toHaveBeenCalled();
    expect(fourth).not.toBeChecked();
    expect(within(group).getByText("Choose up to 3")).toBeInTheDocument();
  });

  it("the last checked benchmark cannot be unchecked", () => {
    const onChange = vi.fn();
    render(
      <BenchmarkChecklist
        options={OPTIONS}
        values={["nifty_500"]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Nifty 500/i });
    fireEvent.click(trigger);

    const group = screen.getByRole("group", { name: /benchmark/i });
    const onlyChecked = within(group).getByRole("checkbox", { name: "Nifty 500 (recommended)" });
    expect(onlyChecked).toBeChecked();

    fireEvent.click(onlyChecked);
    expect(onChange).not.toHaveBeenCalled();
    expect(onlyChecked).toBeChecked();
  });

  it("onChange gets the new list in the order checked", () => {
    const onChange = vi.fn();

    function Controlled() {
      const [values, setValues] = useState<string[]>(["nifty_500"]);
      return (
        <BenchmarkChecklist
          options={OPTIONS}
          values={values}
          onChange={(next) => {
            onChange(next);
            setValues(next);
          }}
        />
      );
    }

    render(<Controlled />);
    fireEvent.click(screen.getByRole("button", { name: /Nifty 500/i }));

    const group = screen.getByRole("group", { name: /benchmark/i });
    fireEvent.click(within(group).getByRole("checkbox", { name: "Nifty Smallcap 250" }));
    expect(onChange).toHaveBeenLastCalledWith(["nifty_500", "nifty_smallcap_250"]);

    fireEvent.click(within(group).getByRole("checkbox", { name: "Nifty 50" }));
    expect(onChange).toHaveBeenLastCalledWith(["nifty_500", "nifty_smallcap_250", "nifty_50"]);

    fireEvent.click(within(group).getByRole("checkbox", { name: "Nifty Smallcap 250" }));
    expect(onChange).toHaveBeenLastCalledWith(["nifty_500", "nifty_50"]);
  });

  it("the recommended option keeps its suffix", () => {
    render(
      <BenchmarkChecklist
        options={OPTIONS}
        values={["nifty_50"]}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Nifty 50/i }));
    const group = screen.getByRole("group", { name: /benchmark/i });

    expect(within(group).getByRole("checkbox", { name: "Nifty 500 (recommended)" })).toBeInTheDocument();
    expect(within(group).getByRole("checkbox", { name: "Nifty 50" })).toBeInTheDocument();
    expect(within(group).getByRole("checkbox", { name: "Nifty LargeMidcap 250" })).toBeInTheDocument();
    expect(within(group).getByRole("checkbox", { name: "Nifty Midcap 150" })).toBeInTheDocument();
    expect(within(group).getByRole("checkbox", { name: "Nifty Smallcap 250" })).toBeInTheDocument();
  });

  it("disabled when there are no options", () => {
    const { rerender } = render(
      <BenchmarkChecklist options={[]} values={[]} onChange={() => {}} />,
    );

    const trigger = screen.getByRole("button", { name: /benchmark/i });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole("group")).toBeNull();

    rerender(
      <BenchmarkChecklist options={OPTIONS} values={["nifty_50"]} disabled onChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /Nifty 50/i })).toBeDisabled();
  });

  it("each option shows the colour of its benchmark", () => {
    render(
      <BenchmarkChecklist
        options={OPTIONS}
        values={["nifty_50"]}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Nifty 50/i }));
    const group = screen.getByRole("group", { name: /benchmark/i });

    for (const option of OPTIONS) {
      const swatch = within(group).getByTestId(`benchmark-swatch-${option.index}`);
      expect(swatch.style.backgroundColor).toBe(benchmarkColor(option.index));
    }
  });

  it("works with the keyboard (Tab, Space)", () => {
    const onChange = vi.fn();
    render(
      <BenchmarkChecklist
        options={OPTIONS}
        values={["nifty_500"]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Nifty 500/i });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Space opens the checklist
    fireEvent.keyDown(trigger, { key: " " });
    const group = screen.getByRole("group", { name: /benchmark/i });

    // Every checkbox is keyboard reachable in the Tab order
    const checkboxes = within(group).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(OPTIONS.length);
    for (const box of checkboxes) {
      expect(box.tabIndex).toBeGreaterThanOrEqual(0);
    }

    // Tab to Nifty 50 and toggle with Space
    const nifty50 = within(group).getByRole("checkbox", { name: "Nifty 50" });
    nifty50.focus();
    expect(document.activeElement).toBe(nifty50);
    fireEvent.keyDown(nifty50, { key: " " });
    expect(onChange).toHaveBeenCalledWith(["nifty_500", "nifty_50"]);

    // Escape closes the checklist and restores focus to the trigger
    fireEvent.keyDown(nifty50, { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
