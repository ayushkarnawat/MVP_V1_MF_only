import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeSummary } from "../testData";
import type { ScenarioSummary } from "../types";
import { ScenarioCard } from "./ScenarioCard";

const show = (over: Partial<ScenarioSummary> = {}, selected = false, onSelect = vi.fn()) => {
  const scenario = makeSummary(over);
  render(<ScenarioCard scenario={scenario} selected={selected} onSelect={onSelect} />);
  return { id: scenario.scenario_id, onSelect };
};

describe("ScenarioCard: content", () => {
  it("is one button named by its text: name, dates, description and the Nifty line", () => {
    show();
    const button = screen.getByRole("button", { name: /Scenario X/ });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAccessibleName(/1 January 2020 – 31 December 2020/);
    expect(button).toHaveAccessibleName(/A description\./);
    expect(button).toHaveAccessibleName(/Nifty 50: −30\.2%/);
  });

  it("shows the name clamped to two lines and wrapping a very long word", () => {
    show({ name: "W".repeat(200) });
    const name = screen.getByTestId("card-name-s-x");
    expect(name).toHaveTextContent("W".repeat(200));
    expect(name).toHaveClass("line-clamp-2");
    expect(name).toHaveClass("break-words");
  });

  it("shows the dates through formatDateRange, with ongoing for an open event", () => {
    show({ is_ongoing: true, end_date: null });
    expect(screen.getByTestId("card-dates-s-x")).toHaveTextContent("1 January 2020 – ongoing");
  });

  it("has no dates line when the scenario has no dates, and never prints null", () => {
    show({ start_date: null, end_date: null });
    expect(screen.queryByTestId("card-dates-s-x")).toBeNull();
    expect(screen.getByRole("button").textContent).not.toMatch(/null|undefined|NaN/);
  });

  it("shows the description clamped to two lines with the full text in its title", () => {
    const text = "A long description. ".repeat(20).trim();
    show({ description: text });
    const description = screen.getByTestId("card-desc-s-x");
    expect(description).toHaveTextContent(text);
    expect(description).toHaveAttribute("title", text);
    expect(description).toHaveClass("line-clamp-2");
  });

  it("leaves the description element out when the description is empty", () => {
    show({ description: "" });
    expect(screen.queryByTestId("card-desc-s-x")).toBeNull();
  });
});

describe("ScenarioCard: the Nifty 50 stat", () => {
  it.each([
    ["-30.20", "Nifty 50: −30.2%", "loss", "text-[var(--neg-text)]"],
    ["12.50", "Nifty 50: +12.5%", "gain", "text-[var(--pos-text)]"],
    ["0.00", "Nifty 50: 0.0%", "neutral", "text-[var(--ui-text-muted)]"],
  ])("shows %s as %s in the matching text colour", (pct, text, tone, className) => {
    show({ quick_market_pct: pct });
    const stat = screen.getByTestId("card-stat-s-x");
    expect(stat).toHaveTextContent(text);
    expect(stat).toHaveAttribute("data-tone", tone);
    expect(stat).toHaveClass(className);
  });

  it.each([
    ["a hypothetical scenario", { scenario_type: "HYPOTHETICAL" as const }],
    ["a redemption-freeze scenario", { had_redemption_freeze_schemes: ["Some Debt Fund"] }],
    ["a multi-phase scenario", { has_phases: true }],
    ["a scenario without a figure", { quick_market_pct: null }],
  ])("shows no stat for %s", (_label, over) => {
    show(over);
    expect(screen.queryByTestId("card-stat-s-x")).toBeNull();
    expect(screen.getByRole("button").textContent).not.toMatch(/Nifty 50|null|NaN/);
  });

  it("still shows the stat for a child phase scenario (it has a parent)", () => {
    show({ has_phases: true, parent_scenario_id: "parent" });
    expect(screen.getByTestId("card-stat-s-x")).toHaveTextContent("Nifty 50: −30.2%");
  });
});

describe("ScenarioCard: badges", () => {
  it("shows Freeze with the warning colours for a freeze scenario", () => {
    show({ had_redemption_freeze_schemes: ["Some Debt Fund"] });
    const badge = screen.getByTestId("card-badge-freeze-s-x");
    expect(badge).toHaveTextContent("Freeze");
    expect(badge).toHaveClass("border-[var(--warn)]", "bg-[var(--warn-bg)]", "text-[var(--warn-text)]");
    expect(badge.querySelector("svg.lucide-snowflake")).not.toBeNull();
  });

  it("shows ongoing with a red dot for an open event, and no Freeze badge", () => {
    show({ is_ongoing: true, end_date: null });
    const badge = screen.getByTestId("card-badge-ongoing-s-x");
    expect(badge).toHaveTextContent("ongoing");
    expect(badge.querySelector("span.bg-\\[var\\(--neg\\)\\]")).not.toBeNull();
    expect(screen.queryByTestId("card-badge-freeze-s-x")).toBeNull();
  });

  it("shows Assumption-based for a hypothetical scenario in the indigo tint", () => {
    show({ scenario_type: "HYPOTHETICAL" });
    const badge = screen.getByTestId("card-badge-assumption-s-x");
    expect(badge).toHaveTextContent("Assumption-based");
    expect(badge.className).toContain("var(--c4)");
  });

  it("shows no badge for an ordinary finished scenario", () => {
    show();
    expect(screen.queryByTestId("card-badge-freeze-s-x")).toBeNull();
    expect(screen.queryByTestId("card-badge-ongoing-s-x")).toBeNull();
    expect(screen.queryByTestId("card-badge-assumption-s-x")).toBeNull();
  });
});

describe("ScenarioCard: icon, selection and click", () => {
  it.each([
    ["CRASH", "lucide-trending-down", "bg-[var(--neg-bg)]", "text-[var(--neg)]"],
    ["BULL_RUN", "lucide-trending-up", "bg-[color-mix(in_srgb,var(--c2)_14%,transparent)]", "text-[var(--c2)]"],
    ["POLICY_RATE", "lucide-percent", "bg-[color-mix(in_srgb,var(--c4)_14%,transparent)]", "text-[var(--c4)]"],
    ["HYPOTHETICAL", "lucide-sparkles", "bg-[color-mix(in_srgb,var(--c4)_14%,transparent)]", "text-[var(--c4)]"],
  ] as const)("draws the %s icon on its tinted 40 px tile", (type, iconClass, background, colour) => {
    show({ scenario_type: type });
    const tile = screen.getByTestId("card-icon-s-x");
    expect(tile).toHaveAttribute("data-type", type);
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveClass("h-10", "w-10", background, colour);
    expect(tile.querySelector(`svg.${iconClass}`)).not.toBeNull();
  });

  it("ends with a decorative chevron", () => {
    show();
    const chevron = screen.getByRole("button").querySelector("svg.lucide-chevron-right");
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveAttribute("aria-hidden", "true");
  });

  it("outlines the selected card in green, the only green on the list", () => {
    show({}, true);
    const card = screen.getByTestId("card-s-x");
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).toHaveClass("border-2", "border-[var(--pos)]", "bg-[var(--pos-bg)]");
  });

  it("uses the plain card colours when not selected", () => {
    show();
    const card = screen.getByTestId("card-s-x");
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(card).not.toHaveClass("border-[var(--pos)]");
    expect(card).not.toHaveClass("bg-[var(--pos-bg)]");
    expect(card).toHaveClass("border-[var(--ui-divider)]", "bg-[var(--ui-card)]");
  });

  it("calls onSelect with the scenario id when clicked", () => {
    const { id, onSelect } = show();
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(id);
  });
});
