import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BenchmarkOptionOut } from "../types";
import { BenchmarkSelect } from "./BenchmarkSelect";

const OPTIONS: BenchmarkOptionOut[] = [
  { index: "nifty_50", label: "Nifty 50", recommended: false },
  { index: "nifty_500", label: "Nifty 500", recommended: true },
  { index: "nifty_largemidcap_250", label: "Nifty LargeMidcap 250", recommended: false },
  { index: "nifty_midcap_150", label: "Nifty Midcap 150", recommended: false },
  { index: "nifty_smallcap_250", label: "Nifty Smallcap 250", recommended: false },
];

describe("BenchmarkSelect", () => {
  it("is a labelled select listing every option in order, with the recommended one marked", () => {
    render(<BenchmarkSelect options={OPTIONS} value="nifty_50" onChange={() => {}} />);
    const select = screen.getByRole("combobox", { name: "Benchmark" });
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.map(option => option.value)).toEqual(OPTIONS.map(option => option.index));
    expect(options.map(option => option.textContent)).toEqual([
      "Nifty 50",
      "Nifty 500 (recommended)",
      "Nifty LargeMidcap 250",
      "Nifty Midcap 150",
      "Nifty Smallcap 250",
    ]);
  });

  it("shows the current value as selected", () => {
    render(<BenchmarkSelect options={OPTIONS} value="nifty_midcap_150" onChange={() => {}} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("nifty_midcap_150");
  });

  it("calls onChange with the chosen index", () => {
    const onChange = vi.fn();
    render(<BenchmarkSelect options={OPTIONS} value="nifty_50" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "nifty_smallcap_250" } });
    expect(onChange).toHaveBeenCalledWith("nifty_smallcap_250");
  });

  it("can be disabled", () => {
    render(<BenchmarkSelect options={OPTIONS} value="nifty_50" disabled onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("renders a disabled, empty select when there are no options", () => {
    render(<BenchmarkSelect options={[]} value={null} onChange={() => {}} />);
    const select = screen.getByRole("combobox", { name: "Benchmark" });
    expect(select).toBeDisabled();
    expect(select.querySelectorAll("option")).toHaveLength(0);
  });
});
