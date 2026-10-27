import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeSummary } from "../testData";
import type { ScenarioSummary } from "../types";
import { ScenarioList } from "./ScenarioList";

const curated: ScenarioSummary[] = [
  makeSummary({ scenario_id: "c1", name: "Curated one", scenario_type: "CRASH" }),
  makeSummary({ scenario_id: "c2", name: "Curated two", scenario_type: "BULL_RUN" }),
  makeSummary({ scenario_id: "c3", name: "Curated three", scenario_type: "POLICY_RATE" }),
];
const extras: ScenarioSummary[] = [
  makeSummary({ scenario_id: "e1", name: "Extra crash", scenario_type: "CRASH" }),
  makeSummary({ scenario_id: "e2", name: "Extra bull run", scenario_type: "BULL_RUN" }),
  makeSummary({ scenario_id: "e3", name: "Extra policy", scenario_type: "POLICY_RATE" }),
];
const all = [...curated, ...extras];

const show = (over: Partial<Parameters<typeof ScenarioList>[0]> = {}) => {
  const onSelect = vi.fn();
  const view = render(<ScenarioList curated={curated} all={all} selectedId={null} onSelect={onSelect} isLoading={false} {...over} />);
  return { onSelect, ...view };
};
const more = () => screen.getByRole("button", { name: "More scenarios" });
const pill = (name: string) => within(screen.getByRole("group", { name: "Scenario categories" })).getByRole("button", { name });
const cardIds = (grid: HTMLElement) => within(grid).getAllByRole("button").map(button => button.getAttribute("data-testid"));

describe("ScenarioList: curated cards and the More toggle", () => {
  it("shows the curated cards first, in the given order, and none of the others", () => {
    show();
    expect(cardIds(screen.getByTestId("curated-grid"))).toEqual(["card-c1", "card-c2", "card-c3"]);
    expect(screen.queryByText("Extra crash")).toBeNull();
    expect(screen.queryByRole("group", { name: "Scenario categories" })).toBeNull();
  });

  it("puts the cards in a grid of 1, 2 (small), 3 (1024 px) and 5 (1280 px) columns", () => {
    show();
    expect(screen.getByTestId("curated-grid")).toHaveClass("grid", "grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-3", "min-[1280px]:grid-cols-5");
  });

  it("opens with More scenarios (aria-expanded) and closes with Hide", () => {
    show();
    expect(more()).toHaveAttribute("aria-expanded", "false");
    expect(more()).toHaveAttribute("aria-controls", "more-scenarios");
    fireEvent.click(more());
    const hide = screen.getByRole("button", { name: "Hide" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("more-scenarios")).not.toBeNull();
    expect(cardIds(screen.getByTestId("more-grid"))).toEqual(["card-e1", "card-e2", "card-e3"]);
    fireEvent.click(hide);
    expect(screen.queryByText("Extra crash")).toBeNull();
    expect(more()).toHaveAttribute("aria-expanded", "false");
  });

  it("shows each curated card once even though the full list contains it too", () => {
    show();
    fireEvent.click(more());
    expect(screen.getAllByText("Curated one")).toHaveLength(1);
  });

  it("has no More button when nothing remains beyond the curated cards", () => {
    show({ all: curated });
    expect(screen.queryByRole("button", { name: /More scenarios|Hide/ })).toBeNull();
    expect(cardIds(screen.getByTestId("curated-grid"))).toHaveLength(3);
  });

  it("has no More button when the full list is empty", () => {
    show({ all: [] });
    expect(screen.queryByRole("button", { name: /More scenarios|Hide/ })).toBeNull();
  });
});

describe("ScenarioList: category pills", () => {
  it("shows All, Crashes, Bull Runs and Policy / Rate, with All pressed, and no Hypothetical pill", () => {
    show();
    fireEvent.click(more());
    const group = screen.getByRole("group", { name: "Scenario categories" });
    expect(within(group).getAllByRole("button").map(button => button.textContent)).toEqual(["All", "Crashes", "Bull Runs", "Policy / Rate"]);
    expect(pill("All")).toHaveAttribute("aria-pressed", "true");
    expect(pill("Crashes")).toHaveAttribute("aria-pressed", "false");
  });

  it("filters only the remaining cards and moves the pressed state", () => {
    show();
    fireEvent.click(more());
    fireEvent.click(pill("Crashes"));
    expect(cardIds(screen.getByTestId("more-grid"))).toEqual(["card-e1"]);
    expect(cardIds(screen.getByTestId("curated-grid"))).toEqual(["card-c1", "card-c2", "card-c3"]);
    expect(pill("Crashes")).toHaveAttribute("aria-pressed", "true");
    expect(pill("All")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pill("Bull Runs"));
    expect(cardIds(screen.getByTestId("more-grid"))).toEqual(["card-e2"]);
    fireEvent.click(pill("Policy / Rate"));
    expect(cardIds(screen.getByTestId("more-grid"))).toEqual(["card-e3"]);
    fireEvent.click(pill("All"));
    expect(cardIds(screen.getByTestId("more-grid"))).toHaveLength(3);
  });

  it("adds a Hypothetical pill only when the full list has a hypothetical scenario, and it filters", () => {
    const hypothetical = makeSummary({ scenario_id: "h1", name: "What if", scenario_type: "HYPOTHETICAL" });
    show({ all: [...all, hypothetical] });
    fireEvent.click(more());
    fireEvent.click(pill("Hypothetical"));
    expect(cardIds(screen.getByTestId("more-grid"))).toEqual(["card-h1"]);
  });

  it("keeps the chosen category when the list is hidden and opened again", () => {
    show();
    fireEvent.click(more());
    fireEvent.click(pill("Crashes"));
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.click(more());
    expect(pill("Crashes")).toHaveAttribute("aria-pressed", "true");
    expect(cardIds(screen.getByTestId("more-grid"))).toEqual(["card-e1"]);
  });
});

describe("ScenarioList: selection", () => {
  it("marks only the selected card", () => {
    show({ selectedId: "c2" });
    expect(screen.getByTestId("card-c2")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("card-c1")).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onSelect with the id of the clicked card, curated or not", () => {
    const { onSelect } = show();
    fireEvent.click(screen.getByTestId("card-c3"));
    expect(onSelect).toHaveBeenLastCalledWith("c3");
    fireEvent.click(more());
    fireEvent.click(screen.getByTestId("card-e2"));
    expect(onSelect).toHaveBeenLastCalledWith("e2");
  });

  it("keeps a selected card selected when a pill hides it, and never clears the selection (L38)", () => {
    const { onSelect, rerender } = show({ selectedId: "e1" });
    fireEvent.click(more());
    expect(screen.getByTestId("card-e1")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(pill("Bull Runs"));
    expect(screen.queryByTestId("card-e1")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<ScenarioList curated={curated} all={all} selectedId="e1" onSelect={onSelect} isLoading={false} />);
    fireEvent.click(pill("Crashes"));
    expect(screen.getByTestId("card-e1")).toHaveAttribute("aria-pressed", "true");
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("ScenarioList: loading and empty", () => {
  it("shows eight skeleton cards in a status region while loading, and no real cards", () => {
    show({ isLoading: true });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading scenarios");
    expect(screen.getAllByTestId("card-skeleton")).toHaveLength(8);
    expect(screen.queryByTestId("card-c1")).toBeNull();
    expect(screen.queryByRole("button", { name: "More scenarios" })).toBeNull();
  });

  it("shows the empty text when both lists are empty", () => {
    show({ curated: [], all: [] });
    expect(screen.getByText("No scenarios are available yet.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the curated cards when only the full list is empty", () => {
    show({ all: [] });
    expect(screen.getByTestId("card-c1")).toBeInTheDocument();
    expect(screen.queryByText("No scenarios are available yet.")).toBeNull();
  });
});
