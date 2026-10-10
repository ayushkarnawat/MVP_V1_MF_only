import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./api";
import { ScenariosScreen } from "./ScenariosScreen";
import { historical, historicalResult } from "./testFixtures";
import type { ScenarioResult } from "./types";

vi.mock("./api", () => ({ listScenarios: vi.fn(), getScenarioResult: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listScenarios).mockResolvedValue([historical]);
  vi.mocked(api.getScenarioResult).mockResolvedValue(historicalResult);
});

it("loads server lists, selects a real result and returns to the picker", async () => {
  render(<ScenariosScreen />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: /COVID crash/ }));
  expect(await screen.findByLabelText("Portfolio impact")).toHaveTextContent("-32.50%");
  expect(api.listScenarios).toHaveBeenCalledWith(true, expect.any(AbortSignal));
  expect(api.listScenarios).toHaveBeenCalledWith(false, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole("button", { name: /Back to scenarios/ }));
  expect(screen.getByRole("button", { name: /COVID crash/ })).toBeInTheDocument();
});

it("dispatches a hypothetical with null fields to the assumptions-not-set state", async () => {
  const scenario = { ...historical, scenario_type: "HYPOTHETICAL" as const };
  vi.mocked(api.getScenarioResult).mockResolvedValue({ ...historicalResult, scenario, assumptions_not_set: true,
    portfolio_impact_pct: null, rupee_impact: null, covered_value: null, total_value: null, no_data_funds: null });
  render(<ScenariosScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /COVID crash/ }));
  expect(await screen.findByText("We haven't set an assumption for this scenario yet — check back soon.")).toBeInTheDocument();
  expect(screen.queryByText(/₹|0\.00%/)).not.toBeInTheDocument();
});

it("keeps Back usable after a result error and supports retry", async () => {
  vi.mocked(api.getScenarioResult).mockRejectedValueOnce(new Error("Unavailable"));
  render(<ScenariosScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /COVID crash/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Portfolio impact")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Back to scenarios/ }));
  expect(screen.getByRole("button", { name: /COVID crash/ })).toBeInTheDocument();
});

it("aborts a pending result when going Back and ignores its late response", async () => {
  let resolve!: (result: ScenarioResult) => void;
  vi.mocked(api.getScenarioResult).mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ScenariosScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /COVID crash/ }));
  const signal = vi.mocked(api.getScenarioResult).mock.calls[0][1]!;
  fireEvent.click(screen.getByRole("button", { name: /Back to scenarios/ }));
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve(historicalResult); });
  expect(screen.getByRole("button", { name: /COVID crash/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("Portfolio impact")).not.toBeInTheDocument();
});

it("retries a failed list and aborts list requests on unmount", async () => {
  vi.mocked(api.listScenarios).mockRejectedValueOnce(new Error("List unavailable"));
  const { unmount } = render(<ScenariosScreen />);
  expect(await screen.findByRole("alert")).toHaveTextContent("List unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: /COVID crash/ })).toBeInTheDocument();
  const signal = vi.mocked(api.listScenarios).mock.calls.at(-1)![1]!;
  unmount();
  expect(signal.aborted).toBe(true);
});

it("moves keyboard focus to the page heading when the view changes", async () => {
  // Opening a scenario or going back removes the focused button; focus must not fall to <body>.
  render(<ScenariosScreen />);
  fireEvent.click(await screen.findByRole("button", { name: /COVID crash/ }));
  expect(screen.getByRole("heading", { level: 1, name: "Scenarios" })).toHaveFocus();
  fireEvent.click(await screen.findByRole("button", { name: /Back to scenarios/ }));
  expect(screen.getByRole("heading", { level: 1, name: "Scenarios" })).toHaveFocus();
});
