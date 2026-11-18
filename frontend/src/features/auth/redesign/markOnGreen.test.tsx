import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChipCheckbox } from "./ChipCheckbox";
import { StatusRow } from "./StatusRow";

// Owner decision 19 Nov 2026 (Codex whole-batch review of B, finding 4): a white mark on #22C55E is 2.28:1; the dark mark is 8.29:1.
describe("marks drawn on the brand green", () => {
  it("a ticked chip's check mark is dark, not white", () => {
    render(<ChipCheckbox label="Build my wealth" checked onToggle={() => {}} />);
    const mark = screen.getByTestId("chip-box").querySelector("svg") as SVGElement;
    expect(mark.getAttribute("class")).toContain("text-[#111111]");
    expect(mark.getAttribute("class")).not.toContain("text-white");
  });
  it("a finished status row's tick is dark, not white", () => {
    render(<StatusRow label="Done" state="done" />);
    const disc = screen.getByTestId("status-row").querySelector("span > span") as HTMLElement;
    expect(disc.className).toContain("text-[#111111]");
    expect(disc.className).not.toContain("text-white");
  });
});
