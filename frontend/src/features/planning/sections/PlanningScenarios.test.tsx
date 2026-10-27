import { useState } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInShell } from "@/shell/testing";
import { getScenarioResult, listScenarios } from "../api";
import { ASHA_ID, DEV_ID, curatedList, makeSummary, memberDevResult, noHoldingsResult, standardResult } from "../testData";
import type { ScenarioResult, ScenarioSummary } from "../types";
import { PlanningScenarios } from "./PlanningScenarios";

vi.mock("../api", () => ({ listScenarios: vi.fn(), getScenarioResult: vi.fn() }));

const A = "44eed64c-8dde-52f4-98d7-344b76762d11";
const B = "30891762-ed34-5787-b5f1-2e9281cc5371";
const curated = curatedList();
const all: ScenarioSummary[] = [...curated, makeSummary({ scenario_id: "extra-1", name: "Extra scenario", scenario_type: "BULL_RUN" })];
const resultFor = (id: string, member: string | undefined): ScenarioResult => {
  const base = member ? memberDevResult() : standardResult();
  const summary = all.find(item => item.scenario_id === id) ?? base.scenario;
  return { ...base, scenario: { ...base.scenario, ...summary } };
};

interface Deferred<T> { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void }
function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const spies = { onSelect: vi.fn(), onImport: vi.fn(), onLearnMore: vi.fn() };
function Harness({ initial = null }: { initial?: string | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  return <PlanningScenarios selectedId={selectedId} onSelect={id => { spies.onSelect(id); setSelectedId(id); }} onImport={spies.onImport} onLearnMore={spies.onLearnMore} />;
}
const mount = (initial: string | null = null) => renderInShell(<Harness initial={initial} />);
const card = (id: string) => screen.getByTestId(`card-${id}`);
const flush = () => act(async () => { await Promise.resolve(); });
const reducedMotion = (matches: boolean) => vi.spyOn(window, "matchMedia").mockImplementation(query => ({
  matches: matches && query.includes("prefers-reduced-motion"), media: query, onchange: null,
  addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
}) as MediaQueryList);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listScenarios).mockImplementation(async curatedOnly => (curatedOnly ? curated : all));
  vi.mocked(getScenarioResult).mockImplementation(async (id, _signal, member) => resultFor(id, member));
});
afterEach(() => { vi.restoreAllMocks(); });

describe("PlanningScenarios: the lists", () => {
  it("loads the curated and the full list on mount with an abort signal", async () => {
    mount();
    await screen.findByTestId(`card-${A}`);
    expect(listScenarios).toHaveBeenCalledWith(true, expect.any(AbortSignal));
    expect(listScenarios).toHaveBeenCalledWith(false, expect.any(AbortSignal));
    expect(getScenarioResult).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "More scenarios" })).toBeInTheDocument();
  });

  it("shows loading skeleton cards until the lists arrive", async () => {
    const pending = defer<ScenarioSummary[]>();
    vi.mocked(listScenarios).mockReturnValue(pending.promise);
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading scenarios");
    expect(screen.getAllByTestId("card-skeleton")).toHaveLength(8);
    await act(async () => { pending.resolve(curated); });
    expect(await screen.findByTestId(`card-${A}`)).toBeInTheDocument();
    expect(screen.queryByTestId("card-skeleton")).toBeNull();
  });

  it("shows an alert with the message and Try again when the lists fail, then recovers", async () => {
    vi.mocked(listScenarios).mockRejectedValueOnce(new Error("Gateway timeout")).mockRejectedValueOnce(new Error("Gateway timeout"));
    mount();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Scenarios aren't available right now.");
    expect(alert).toHaveTextContent("Gateway timeout");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId(`card-${A}`)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PlanningScenarios: opening a scenario", () => {
  it("tells the flow which card was chosen and fetches the family result without a member", async () => {
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    expect(spies.onSelect).toHaveBeenCalledWith(A);
    await screen.findByTestId("scenario-detail");
    expect(getScenarioResult).toHaveBeenCalledTimes(1);
    expect(getScenarioResult).toHaveBeenCalledWith(A, expect.any(AbortSignal), undefined);
    expect(card(A)).toHaveAttribute("aria-pressed", "true");
  });

  it("fetches straight away when a scenario is already selected on mount", async () => {
    mount(B);
    await screen.findByTestId("scenario-detail");
    expect(getScenarioResult).toHaveBeenCalledWith(B, expect.any(AbortSignal), undefined);
  });

  it("shows the heading from the list and skeleton tiles and charts during the first load", async () => {
    const pending = defer<ScenarioResult>();
    vi.mocked(getScenarioResult).mockReturnValue(pending.promise);
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    expect(screen.getByRole("heading", { level: 2, name: "Fixture scenario A" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("detail-loading")).toHaveTextContent("Loading scenario result");
    expect(screen.getAllByTestId("skeleton-tile")).toHaveLength(4);
    expect(screen.getAllByTestId("skeleton-chart")).toHaveLength(2);
    expect(screen.queryByTestId("scenario-detail")).toBeNull();
    await act(async () => { pending.resolve(resultFor(A, undefined)); });
    await screen.findByTestId("scenario-detail");
    expect(screen.queryByTestId("detail-loading")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2, name: "Fixture scenario A" })).toHaveLength(1);
  });

  it("derives the member list once from the family result, keeping only members that hold funds", async () => {
    const result = resultFor(A, undefined);
    result.by_member.push({ household_member_id: "m-empty", member_name: "No Funds", rupee_impact: "0.00", pct: null, funds: [] });
    vi.mocked(getScenarioResult).mockResolvedValue(result);
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    const select = await screen.findByLabelText("Member");
    expect(within(select).getAllByRole("option").map(option => option.textContent)).toEqual(["Family combined", "Asha Rao", "Dev Rao"]);
  });

  it("ignores a late answer for a scenario that is no longer selected", async () => {
    const first = defer<ScenarioResult>();
    vi.mocked(getScenarioResult).mockImplementationOnce(() => first.promise);
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    fireEvent.click(screen.getByTestId(`card-${B}`));
    await screen.findByTestId("scenario-detail");
    expect(screen.getByRole("heading", { level: 2, name: "Fixture scenario B" })).toBeInTheDocument();
    await act(async () => { first.resolve(resultFor(A, undefined)); });
    await flush();
    expect(screen.queryByRole("heading", { level: 2, name: "Fixture scenario A" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Fixture scenario B" })).toBeInTheDocument();
  });

  it("hides the detail when nothing is selected any more", async () => {
    const { rerender } = renderInShell(<PlanningScenarios selectedId={A} onSelect={() => {}} onImport={() => {}} onLearnMore={() => {}} />);
    await screen.findByTestId("scenario-detail");
    rerender(<PlanningScenarios selectedId={null} onSelect={() => {}} onImport={() => {}} onLearnMore={() => {}} />);
    expect(screen.queryByTestId("scenario-detail")).toBeNull();
    expect(screen.getByTestId(`card-${A}`)).toHaveAttribute("aria-pressed", "false");
  });

  it("passes the import and Learn more actions to the detail", async () => {
    vi.mocked(getScenarioResult).mockResolvedValueOnce(noHoldingsResult());
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    fireEvent.click(await screen.findByRole("button", { name: "Import a statement" }));
    expect(spies.onImport).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId(`card-${B}`));
    fireEvent.click(await screen.findByRole("button", { name: "Learn more" }));
    expect(spies.onLearnMore).toHaveBeenCalledTimes(1);
  });
});

describe("PlanningScenarios: the member dropdown", () => {
  async function openStandard() {
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
  }

  it("fetches the chosen member's result and keeps the old numbers, dimmed, while it loads", async () => {
    await openStandard();
    const pending = defer<ScenarioResult>();
    vi.mocked(getScenarioResult).mockReturnValueOnce(pending.promise);
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: DEV_ID } });
    expect(getScenarioResult).toHaveBeenLastCalledWith(A, expect.any(AbortSignal), DEV_ID);
    const numbers = screen.getByTestId("detail-numbers");
    expect(numbers).toHaveClass("opacity-60");
    expect(screen.getByTestId("tile-return-value")).toHaveTextContent("−12.6%");
    expect(screen.getByLabelText("Member")).toHaveValue(DEV_ID);
    expect(screen.getByRole("heading", { level: 3, name: "By family member" })).toBeInTheDocument();
    await act(async () => { pending.resolve(resultFor(A, DEV_ID)); });
    await waitFor(() => expect(screen.getByTestId("tile-return-value")).toHaveTextContent("+3.4%"));
    expect(screen.getByTestId("detail-numbers")).not.toHaveClass("opacity-60");
    expect(screen.getByRole("heading", { level: 3, name: "Funds for Dev Rao" })).toBeInTheDocument();
  });

  it("keeps the same members in the dropdown while a single member's result is shown", async () => {
    await openStandard();
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: DEV_ID } });
    await screen.findByRole("heading", { level: 3, name: "Funds for Dev Rao" });
    expect(within(screen.getByLabelText("Member")).getAllByRole("option")).toHaveLength(3);
  });

  it("goes back to Family combined without asking for a member", async () => {
    await openStandard();
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: DEV_ID } });
    await screen.findByRole("heading", { level: 3, name: "Funds for Dev Rao" });
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: "family" } });
    await screen.findByRole("heading", { level: 3, name: "By family member" });
    expect(getScenarioResult).toHaveBeenLastCalledWith(A, expect.any(AbortSignal), undefined);
  });

  it("keeps the chosen member when another scenario is opened", async () => {
    await openStandard();
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: DEV_ID } });
    await screen.findByRole("heading", { level: 3, name: "Funds for Dev Rao" });
    fireEvent.click(screen.getByTestId(`card-${B}`));
    await screen.findByRole("heading", { level: 2, name: "Fixture scenario B" });
    expect(getScenarioResult).toHaveBeenLastCalledWith(B, expect.any(AbortSignal), DEV_ID);
    await screen.findByRole("heading", { level: 3, name: "Funds for Dev Rao" });
    expect(screen.getByLabelText("Member")).toHaveValue(DEV_ID);
  });

  it("puts the dropdown back and shows the error in the detail when a member fetch fails", async () => {
    await openStandard();
    vi.mocked(getScenarioResult).mockRejectedValueOnce(new Error("Member lookup failed"));
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: ASHA_ID } });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Scenarios aren't available right now.");
    expect(alert).toHaveTextContent("Member lookup failed");
    expect(screen.getByLabelText("Member")).toHaveValue("family");
    expect(screen.getByTestId("tile-return-value")).toHaveTextContent("−12.6%");
    expect(screen.getByTestId("detail-numbers")).not.toHaveClass("opacity-60");
  });

  it("retries the failed member with Try again", async () => {
    await openStandard();
    vi.mocked(getScenarioResult).mockRejectedValueOnce(new Error("Member lookup failed"));
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: DEV_ID } });
    fireEvent.click(await within(await screen.findByRole("alert")).findByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { level: 3, name: "Funds for Dev Rao" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Member")).toHaveValue(DEV_ID);
  });
});

describe("PlanningScenarios: a failed first load", () => {
  it("shows the heading, the alert and Try again, and recovers on retry", async () => {
    vi.mocked(getScenarioResult).mockRejectedValueOnce(new Error("Request failed"));
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Request failed");
    expect(screen.getByRole("heading", { level: 2, name: "Fixture scenario A" })).toBeInTheDocument();
    expect(screen.queryByTestId("detail-loading")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByTestId("scenario-detail");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getScenarioResult).toHaveBeenCalledTimes(2);
  });
});

describe("PlanningScenarios: scrolling, focus and cleanup", () => {
  it("scrolls the heading into view smoothly and focuses it once the result is shown", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    reducedMotion(false);
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(scroll.mock.contexts.every(element => element instanceof HTMLHeadingElement)).toBe(true);
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Fixture scenario A" })).toHaveFocus());
  });

  it("does not scroll smoothly when the visitor prefers reduced motion", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    reducedMotion(true);
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(scroll).not.toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("scrolls again for the next scenario but not when only the member changes", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: DEV_ID } });
    await screen.findByRole("heading", { level: 3, name: "Funds for Dev Rao" });
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId(`card-${B}`));
    await screen.findByRole("heading", { level: 2, name: "Fixture scenario B" });
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it("aborts the list and result requests when it unmounts", async () => {
    const pending = defer<ScenarioResult>();
    vi.mocked(getScenarioResult).mockReturnValue(pending.promise);
    const { unmount } = mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    const listSignals = vi.mocked(listScenarios).mock.calls.map(call => call[1] as AbortSignal);
    const resultSignal = vi.mocked(getScenarioResult).mock.calls[0][1] as AbortSignal;
    expect(resultSignal.aborted).toBe(false);
    unmount();
    expect(resultSignal.aborted).toBe(true);
    expect(listSignals.every(signal => signal.aborted)).toBe(true);
  });

  it("aborts the earlier result request when another scenario is chosen", async () => {
    const pending = defer<ScenarioResult>();
    vi.mocked(getScenarioResult).mockReturnValueOnce(pending.promise);
    mount();
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    const first = vi.mocked(getScenarioResult).mock.calls[0][1] as AbortSignal;
    fireEvent.click(screen.getByTestId(`card-${B}`));
    expect(first.aborted).toBe(true);
    await screen.findByTestId("scenario-detail");
  });
});
