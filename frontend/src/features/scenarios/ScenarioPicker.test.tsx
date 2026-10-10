import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScenarioPicker } from "./ScenarioPicker";
import { historical } from "./testFixtures";
import type { ScenarioSummary } from "./types";

const freeze: ScenarioSummary = { ...historical, scenario_id: "f", name: "Freeze event", display_rank: 5, had_redemption_freeze_schemes: ["X"], quick_market_pct: null, quick_equity_pct: null, quick_debt_pct: null };
const ongoing: ScenarioSummary = { ...freeze, scenario_id: "g", name: "Group event", had_redemption_freeze_schemes: null, has_phases: true, is_ongoing: true, end_date: null };
const hypothetical: ScenarioSummary = { ...freeze, scenario_id: "h", name: "Possible event", had_redemption_freeze_schemes: null, scenario_type: "HYPOTHETICAL", start_date: null, end_date: null };
const other: ScenarioSummary = { ...historical, scenario_id: "b", name: "Bull run", scenario_type: "BULL_RUN", display_rank: null };

describe("ScenarioPicker", () => {
  it("shows labelled quick figures, freeze and ongoing states", () => {
    render(<ScenarioPicker curated={[historical, freeze, ongoing, hypothetical]} all={[]} isLoading={false} onSelectScenario={vi.fn()} />);
    expect(screen.getByText("Nifty 50 −38.00% · Equity funds −35.20% · Debt funds +1.10%")).toBeInTheDocument();
    expect(screen.getByText("Freeze")).toBeInTheDocument();
    expect(screen.getByText("ongoing")).toBeInTheDocument();
    expect(screen.getByText("Assumption-based")).toBeInTheDocument();
  });
  it("opens More scenarios and filters the returned library by category", () => {
    render(<ScenarioPicker curated={[historical]} all={[historical, other]} isLoading={false} onSelectScenario={vi.fn()} />);
    expect(screen.queryByText("Bull run")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More scenarios" }));
    expect(screen.getByText("Bull run")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crashes" }));
    expect(screen.queryByText("Bull run")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hypothetical" })).not.toBeInTheDocument();
  });
  it("selects a server id and works with fewer cards when hypotheticals are disabled", () => {
    const select = vi.fn();
    render(<ScenarioPicker curated={[historical]} all={[historical]} isLoading={false} onSelectScenario={select} />);
    fireEvent.click(screen.getByRole("button", { name: /COVID crash/ }));
    expect(select).toHaveBeenCalledWith("c1");
    expect(screen.queryByText("Possible event")).not.toBeInTheDocument();
  });
  it("keeps missing quick stats absent and exposes loading and empty states", () => {
    const { rerender } = render(<ScenarioPicker curated={[]} all={[]} isLoading onSelectScenario={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading scenarios");
    rerender(<ScenarioPicker curated={[]} all={[]} isLoading={false} onSelectScenario={vi.fn()} />);
    expect(screen.getByText("No scenarios are available yet.")).toBeInTheDocument();
    expect(screen.queryByText(/0\.00%/)).not.toBeInTheDocument();
  });
});
