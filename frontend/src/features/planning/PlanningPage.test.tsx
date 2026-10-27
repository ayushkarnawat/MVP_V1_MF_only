import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInShell } from "@/shell/testing";
import { getScenarioResult, listScenarios } from "./api";
import PlanningPage from "./PlanningPage";
import { readPlanningState } from "./planningHistory";
import { DEV_ID, curatedList, memberDevResult, noHoldingsResult, standardResult } from "./testData";

vi.mock("./api", () => ({ listScenarios: vi.fn(), getScenarioResult: vi.fn() }));

const A = "44eed64c-8dde-52f4-98d7-344b76762d11";
const B = "30891762-ed34-5787-b5f1-2e9281cc5371";
const openImport = vi.fn();

const mount = () => renderInShell(<PlanningPage />, { path: "/planning", openImport });
const planButton = () => screen.getByRole("button", { name: /Plan your future/ });
const exploreButton = () => screen.getByRole("button", { name: /Explore market scenarios/ });
const backButton = () => screen.getByRole("button", { name: "Back to Planning" });
const traverse = async (move: () => void) => { await act(async () => { move(); await new Promise(resolve => setTimeout(resolve, 20)); }); };
const goBack = () => traverse(() => window.history.back());
const explore = async () => { mount(); fireEvent.click(exploreButton()); await screen.findByTestId(`card-${A}`); };

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
  vi.mocked(listScenarios).mockImplementation(async () => curatedList());
  vi.mocked(getScenarioResult).mockImplementation(async (_id, _signal, member) => (member ? memberDevResult() : standardResult()));
});
afterEach(() => { window.history.replaceState(null, ""); });

describe("PlanningPage: landing", () => {
  it("shows the title, the subtitle and the two cards", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Planning" })).toBeInTheDocument();
    expect(screen.getByText("Explore different financial scenarios to plan better and make more informed decisions.")).toBeInTheDocument();
    expect(planButton()).toHaveTextContent("Set goals, adjust assumptions and see how your wealth can grow over time.");
    expect(exploreButton()).toHaveTextContent("See how your portfolio might perform in historical and hypothetical market events.");
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("gives each card its icon tile and a decorative arrow", () => {
    mount();
    expect(planButton().querySelector("svg.lucide-sprout")).not.toBeNull();
    expect(exploreButton().querySelector("svg.lucide-chart-column")).not.toBeNull();
    for (const button of [planButton(), exploreButton()]) {
      const arrow = button.querySelector("svg.lucide-arrow-right");
      expect(arrow).not.toBeNull();
      expect(arrow?.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("does not render the old Scenarios screen heading", () => {
    mount();
    expect(screen.queryByRole("heading", { name: "Scenarios" })).toBeNull();
  });

  it("makes no request until a view that needs one is opened", () => {
    mount();
    expect(listScenarios).not.toHaveBeenCalled();
    expect(getScenarioResult).not.toHaveBeenCalled();
  });

  it("starts on the landing and rewrites the history entry, even after a stale market state", () => {
    window.history.replaceState({ planning: "market", scenarioId: A, usr: "kept" }, "");
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Planning" })).toBeInTheDocument();
    expect(readPlanningState()).toEqual({ planning: "landing", scenarioId: null });
    expect(window.history.state).toMatchObject({ usr: "kept" });
    expect(listScenarios).not.toHaveBeenCalled();
  });
});

describe("PlanningPage: Plan your future", () => {
  it("shows the heading, the line and a Coming soon note, with no controls but Back", () => {
    mount();
    fireEvent.click(planButton());
    expect(screen.getByRole("heading", { level: 1, name: "Plan your future" })).toBeInTheDocument();
    expect(screen.getByText("Set goals, adjust assumptions and see how your wealth can grow over time.")).toBeInTheDocument();
    const note = screen.getByTestId("coming-soon");
    expect(within(note).getByText("Coming soon").tagName).toBe("B");
    expect(note).toHaveTextContent("Goal planning is on its way: retirement, your child's education, a home purchase and wealth goals.");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("has a Back to Planning button, with a chevron, above the heading, that returns to the landing", () => {
    mount();
    fireEvent.click(planButton());
    const back = backButton();
    expect(back.querySelector("svg.lucide-chevron-left")).not.toBeNull();
    expect(back.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(back);
    expect(screen.getByRole("heading", { level: 1, name: "Planning" })).toBeInTheDocument();
    expect(readPlanningState()).toEqual({ planning: "landing", scenarioId: null });
  });

  it("pushes a history entry when it opens", () => {
    mount();
    const before = window.history.length;
    fireEvent.click(planButton());
    expect(window.history.length).toBe(before + 1);
    expect(readPlanningState()).toEqual({ planning: "future", scenarioId: null });
  });

  it("returns to the landing on the browser Back button", async () => {
    mount();
    fireEvent.click(planButton());
    await goBack();
    await screen.findByRole("heading", { level: 1, name: "Planning" });
  });
});

describe("PlanningPage: Explore market scenarios", () => {
  it("shows the heading, the subtitle, Back and the scenario cards, and never the old heading", async () => {
    await explore();
    expect(screen.getByRole("heading", { level: 1, name: "Explore market scenarios" })).toBeInTheDocument();
    expect(screen.getByText("Here's what this portfolio would have captured during these periods, based on actual historical fund performance.")).toBeInTheDocument();
    expect(backButton()).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Scenarios" })).toBeNull();
    expect(readPlanningState()).toEqual({ planning: "market", scenarioId: null });
    expect(listScenarios).toHaveBeenCalledWith(true, expect.any(AbortSignal));
  });

  it("pushes one history entry per scenario chosen and shows its detail", async () => {
    await explore();
    const before = window.history.length;
    fireEvent.click(screen.getByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
    expect(window.history.length).toBe(before + 1);
    expect(readPlanningState()).toEqual({ planning: "market", scenarioId: A });
    expect(getScenarioResult).toHaveBeenCalledWith(A, expect.any(AbortSignal), undefined);
    fireEvent.click(screen.getByTestId(`card-${B}`));
    expect(window.history.length).toBe(before + 2);
    await screen.findByTestId("scenario-detail");
  });

  it("does not push another entry when the open scenario is clicked again", async () => {
    await explore();
    fireEvent.click(screen.getByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
    const length = window.history.length;
    fireEvent.click(screen.getByTestId(`card-${A}`));
    expect(window.history.length).toBe(length);
  });

  it("steps back through the browser history: detail, then list, then landing", async () => {
    await explore();
    fireEvent.click(screen.getByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
    await goBack();
    await waitFor(() => expect(screen.queryByTestId("scenario-detail")).toBeNull());
    expect(screen.getByRole("heading", { level: 1, name: "Explore market scenarios" })).toBeInTheDocument();
    expect(screen.getByTestId(`card-${A}`)).toHaveAttribute("aria-pressed", "false");
    await goBack();
    await screen.findByRole("heading", { level: 1, name: "Planning" });
    expect(screen.queryByTestId(`card-${A}`)).toBeNull();
  });

  it("goes forward again to the detail with the browser Forward button", async () => {
    await explore();
    fireEvent.click(screen.getByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
    await goBack();
    await waitFor(() => expect(screen.queryByTestId("scenario-detail")).toBeNull());
    await traverse(() => window.history.forward());
    await screen.findByTestId("scenario-detail");
  });

  it("treats a browser step to an entry with no Planning state as the landing", async () => {
    await explore();
    window.history.replaceState(null, "");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(screen.getByRole("heading", { level: 1, name: "Planning" })).toBeInTheDocument();
    expect(screen.queryByTestId(`card-${A}`)).toBeNull();
  });

  it("returns to the landing from an open scenario with Back to Planning", async () => {
    await explore();
    fireEvent.click(screen.getByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
    fireEvent.click(backButton());
    expect(screen.getByRole("heading", { level: 1, name: "Planning" })).toBeInTheDocument();
    expect(screen.queryByTestId("scenario-detail")).toBeNull();
    expect(readPlanningState()).toEqual({ planning: "landing", scenarioId: null });
  });

  it("forgets the chosen member after leaving Planning", async () => {
    await explore();
    fireEvent.click(screen.getByTestId(`card-${A}`));
    await screen.findByTestId("scenario-detail");
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: DEV_ID } });
    await screen.findByRole("heading", { level: 3, name: "Funds for Dev Rao" });
    fireEvent.click(backButton());
    fireEvent.click(exploreButton());
    fireEvent.click(await screen.findByTestId(`card-${A}`));
    await screen.findByRole("heading", { level: 3, name: "By family member" });
    expect(getScenarioResult).toHaveBeenLastCalledWith(A, expect.any(AbortSignal), undefined);
  });
});

describe("PlanningPage: Mira and import", () => {
  it("opens the Mira dialog from Learn more and closes it again", async () => {
    await explore();
    fireEvent.click(screen.getByTestId(`card-${A}`));
    fireEvent.click(await screen.findByRole("button", { name: "Learn more" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Ask Mira")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("starts the import from the no-holdings button", async () => {
    vi.mocked(getScenarioResult).mockResolvedValue(noHoldingsResult());
    await explore();
    fireEvent.click(screen.getByTestId(`card-${A}`));
    fireEvent.click(await screen.findByRole("button", { name: "Import a statement" }));
    expect(openImport).toHaveBeenCalledTimes(1);
  });
});
