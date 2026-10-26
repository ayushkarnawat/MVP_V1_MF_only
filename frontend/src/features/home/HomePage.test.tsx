import { act, fireEvent, screen, waitFor, within, configure } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInShell } from "../../shell/testing";
import { fixture } from "./fixtures";
import { formatRupees, greetingLine } from "./homeFormat";
import { buildGlanceSentence, wealthCaption } from "./homeCopy";
import { HomePage } from "./HomePage";
import { ASHA, DEV, HttpFailure, MEMBERS, PENDING, mockHomeApi, type HomeRouteName } from "./testing/homeApi";
import type { AllocationResponse, MoversResponse, SummaryResponse, WealthSeriesResponse } from "./types";

// The whole front-end suite runs many files at once: give async queries room so a slow machine does not fail them.
configure({ asyncUtilTimeout: 5000 });

const TODAY = "2026-10-23";

function renderHome(options: { member?: boolean; openImport?: (id?: string) => void } = {}) {
  const scope = options.member
    ? { members: MEMBERS, viewMode: "member" as const, memberId: DEV }
    : { members: MEMBERS };
  return renderInShell(<HomePage today={TODAY} />, { scope, openImport: options.openImport });
}

const summaryFamily = () => fixture<SummaryResponse>("summary_family");
const wealth1m = () => fixture<WealthSeriesResponse>("wealth_1m_family_benchmark");

async function allLoaded() {
  await screen.findByRole("heading", { name: greetingLine("evening", "Asha") });
  await screen.findByTestId("wealth-total");
  await screen.findByTestId("donut-center-value");
  await screen.findByTestId("movers-split");
  await screen.findByTestId("worth-card-weak_fund");
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("HomePage: the signed-off layout", () => {
  it("shows every section from the golden fixtures", async () => {
    mockHomeApi();
    renderHome();
    await allLoaded();
    expect(screen.getByTestId("wealth-total")).toHaveTextContent(formatRupees(wealth1m().end_value));
    expect(screen.getByText("Your money, at a glance")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Asset allocation/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What moved today" })).toBeInTheDocument();
    expect(screen.getAllByTestId(/^worth-card-/)).toHaveLength(3);
    expect(screen.getByTestId("family-bar")).toBeInTheDocument();
  });

  it("puts the sections in the page order 1, 2, 3, 4, 5, 7, 8 (also the order they stack below 1280 px)", async () => {
    mockHomeApi();
    renderHome();
    await allLoaded();
    const ids = ["home-greeting", "home-wealth", "home-glance", "home-allocation", "home-movers", "home-worth", "home-news-slot"];
    const nodes = ids.map(id => screen.getByTestId(id));
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("uses two columns from 1280 px: Glance and Movers on the left, Allocation on the right, the rest full width", async () => {
    mockHomeApi();
    renderHome();
    await allLoaded();
    const grid = screen.getByTestId("home-grid");
    expect(grid.className).toContain("xl:grid-cols-2");
    expect(within(grid).getByTestId("home-glance").className).toContain("xl:col-start-1");
    expect(within(grid).getByTestId("home-movers").className).toContain("xl:col-start-1");
    expect(within(grid).getByTestId("home-allocation").className).toContain("xl:col-start-2");
    for (const outside of ["home-greeting", "home-wealth", "home-worth", "home-news-slot"]) {
      expect(grid).not.toContainElement(screen.getByTestId(outside));
    }
  });

  it("has exactly one h1 (the greeting), section titles below it, and a name on every button", async () => {
    mockHomeApi();
    renderHome();
    await allLoaded();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const button of screen.getAllByRole("button")) expect(button).toHaveAccessibleName();
    expect(screen.getByRole("radiogroup", { name: "Period" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Group by" })).toBeInTheDocument();
  });

  it("leaves a clearly marked, empty, hidden news slot and never asks for news", async () => {
    const api = mockHomeApi();
    renderHome();
    await allLoaded();
    const slot = screen.getByTestId("home-news-slot");
    expect(slot).toBeEmptyDOMElement();
    expect(slot).toHaveAttribute("aria-hidden", "true");
    expect(api.callsFor("news")).toHaveLength(0);
  });
});

describe("HomePage: loading", () => {
  it("shows a skeleton for every section while nothing has answered", () => {
    mockHomeApi({
      summary: PENDING, benchmarks: PENDING, "wealth-series": PENDING, allocation: PENDING, movers: PENDING, "worth-a-look": PENDING,
    });
    renderHome();
    for (const name of ["Loading greeting", "Loading wealth graph", "Loading summary", "Loading allocation", "Loading movers", "Loading worth a look"]) {
      expect(screen.getByRole("status", { name })).toBeInTheDocument();
    }
  });

  it("requests each section once, for the family, in one go, and the wealth series once the benchmark is known", async () => {
    const api = mockHomeApi();
    renderHome();
    await allLoaded();
    for (const section of ["summary", "benchmarks", "allocation", "movers", "worth-a-look", "wealth-series"] as HomeRouteName[]) {
      expect(api.callsFor(section), section).toHaveLength(1);
      expect(api.callsFor(section)[0].scope).toBe("aggregate");
    }
    expect(api.callsFor("movers")[0].query.get("by")).toBe("sector");
    const wealthQuery = api.callsFor("wealth-series")[0].query;
    expect(wealthQuery.get("period")).toBe("1M");
    expect(wealthQuery.get("benchmark")).toBe("nifty_largemidcap_250");
    expect(wealthQuery.has("from")).toBe(false);
    expect(wealthQuery.has("to")).toBe(false);
  });

  it("does not ask for the wealth series before the benchmark list has answered", async () => {
    let release: (value: unknown) => void = () => {};
    const gate = new Promise(resolve => { release = resolve; });
    const api = mockHomeApi({ benchmarks: () => gate });
    renderHome();
    await screen.findByRole("heading", { name: greetingLine("evening", "Asha") });
    expect(api.callsFor("wealth-series")).toHaveLength(0);
    expect(screen.getByRole("status", { name: "Loading wealth graph" })).toBeInTheDocument();
    await act(async () => { release(fixture("benchmarks_family")); await gate; });
    await screen.findByTestId("wealth-total");
    expect(api.callsFor("wealth-series")).toHaveLength(1);
  });

  it("asks for the wealth series without a benchmark when the benchmark list fails", async () => {
    const api = mockHomeApi({ benchmarks: new HttpFailure(500) });
    renderHome();
    await screen.findByTestId("wealth-total");
    expect(api.callsFor("wealth-series")).toHaveLength(1);
    expect(api.callsFor("wealth-series")[0].query.has("benchmark")).toBe(false);
    expect(screen.getByRole("combobox", { name: "Benchmark" })).toBeDisabled();
  });

  it("uses the benchmark remembered on this device when it is one of the options", async () => {
    localStorage.setItem("home.benchmark", "nifty_50");
    const api = mockHomeApi();
    renderHome();
    await screen.findByTestId("wealth-total");
    expect(api.callsFor("wealth-series")[0].query.get("benchmark")).toBe("nifty_50");
    expect(screen.getByRole("combobox", { name: "Benchmark" })).toHaveValue("nifty_50");
  });

  it("ignores a remembered benchmark that is not offered and falls back to the recommended one", async () => {
    localStorage.setItem("home.benchmark", "nifty_nonsense");
    const api = mockHomeApi();
    renderHome();
    await screen.findByTestId("wealth-total");
    expect(api.callsFor("wealth-series")[0].query.get("benchmark")).toBe("nifty_largemidcap_250");
  });
});

describe("HomePage: a failed section never blocks the others", () => {
  const cases: [HomeRouteName, string][] = [
    ["wealth-series", "Could not load your wealth graph."],
    ["allocation", "Could not load allocation."],
    ["movers", "Could not load movers."],
    ["worth-a-look", "Could not check right now."],
  ];

  it.each(cases)("shows %s as its own error and the rest as data", async (section, message) => {
    mockHomeApi({ [section]: new HttpFailure(500) });
    renderHome();
    await screen.findByRole("heading", { name: greetingLine("evening", "Asha") });
    await screen.findByText(message);
    const others: [HomeRouteName, string][] = [
      ["wealth-series", "wealth-total"], ["allocation", "donut-center-value"], ["movers", "movers-split"], ["worth-a-look", "worth-card-weak_fund"],
    ];
    for (const [name, testId] of others) {
      if (name === section) expect(screen.queryByTestId(testId)).toBeNull();
      else expect(await screen.findByTestId(testId)).toBeInTheDocument();
    }
  });

  it("shows a failed summary as the plain greeting, hides the glance, and keeps the other sections", async () => {
    mockHomeApi({ summary: new HttpFailure(500) });
    renderHome();
    await screen.findByRole("heading", { name: "Welcome back" });
    await settledWithoutGreeting();
    expect(screen.queryByText("Your money, at a glance")).toBeNull();
    expect(screen.getByTestId("home-wealth")).toBeInTheDocument();
  });

  it("keeps every other section on screen while one request never ends", async () => {
    mockHomeApi({ "worth-a-look": PENDING });
    renderHome();
    await settledWithoutWorth();
    expect(screen.getByRole("status", { name: "Loading worth a look" })).toBeInTheDocument();
  });

  it("retries only the section whose Try again was pressed", async () => {
    const api = mockHomeApi({ movers: new HttpFailure(500) });
    renderHome();
    await screen.findByText("Could not load movers.");
    await settledBasics();
    const before = new Map(["summary", "benchmarks", "allocation", "wealth-series", "worth-a-look"].map(s => [s, api.callsFor(s as HomeRouteName).length]));
    api.set("movers", undefined);
    fireEvent.click(within(screen.getByTestId("home-movers")).getByRole("button", { name: "Try again" }));
    await screen.findByTestId("movers-split");
    expect(api.callsFor("movers")).toHaveLength(2);
    for (const [name, count] of before) expect(api.callsFor(name as HomeRouteName), name).toHaveLength(count);
  });

  it("retries the wealth series and the allocation the same way", async () => {
    const api = mockHomeApi({ "wealth-series": new HttpFailure(500), allocation: new HttpFailure(500) });
    renderHome();
    await screen.findByText("Could not load your wealth graph.");
    await screen.findByText("Could not load allocation.");
    api.set("wealth-series", undefined);
    api.set("allocation", undefined);
    fireEvent.click(within(screen.getByTestId("home-wealth")).getByRole("button", { name: "Try again" }));
    await screen.findByTestId("wealth-total");
    expect(api.callsFor("allocation")).toHaveLength(1);
    fireEvent.click(within(screen.getByTestId("home-allocation")).getByRole("button", { name: "Try again" }));
    await screen.findByTestId("donut-center-value");
    expect(api.callsFor("wealth-series")).toHaveLength(2);
    expect(api.callsFor("allocation")).toHaveLength(2);
  });
});

async function settledBasics() {
  await screen.findByTestId("wealth-total");
  await screen.findByTestId("donut-center-value");
  await screen.findByTestId("worth-card-weak_fund");
}
async function settledWithoutGreeting() {
  await settledBasics();
  await screen.findByTestId("movers-split");
}
async function settledWithoutWorth() {
  await screen.findByRole("heading", { name: greetingLine("evening", "Asha") });
  await screen.findByTestId("wealth-total");
  await screen.findByTestId("donut-center-value");
  await screen.findByTestId("movers-split");
}

describe("HomePage: no holdings", () => {
  const emptyWealth = () => ({ ...wealth1m(), empty: true, points: [], start_value: "0.00", end_value: "0.00", change_amount: "0.00", change_pct: null, benchmark: null });

  it("shows only the greeting and the wealth card, both in their empty states, and no other section", async () => {
    mockHomeApi({
      summary: fixture("summary_empty"), "wealth-series": emptyWealth(),
      allocation: fixture("allocation_empty"), movers: fixture("movers_empty"), "worth-a-look": fixture("worth_none"),
    });
    renderHome();
    await screen.findByText("Import a statement to see your portfolio.");
    await screen.findByText("No investments yet.");
    for (const hidden of ["home-glance", "home-allocation", "home-movers", "home-worth", "home-news-slot"]) {
      expect(screen.queryByTestId(hidden), hidden).toBeNull();
    }
    expect(screen.getByTestId("home-greeting")).toBeInTheDocument();
    expect(screen.getByTestId("home-wealth")).toBeInTheDocument();
  });

  it("does not hide the other sections while the summary is still loading", () => {
    mockHomeApi({ summary: PENDING });
    renderHome();
    expect(screen.getByTestId("home-allocation")).toBeInTheDocument();
    expect(screen.getByTestId("home-movers")).toBeInTheDocument();
  });

  it("opens the import flow for the family from either Import statement button", async () => {
    const openImport = vi.fn();
    mockHomeApi({ summary: fixture("summary_empty"), "wealth-series": emptyWealth() });
    renderHome({ openImport });
    await screen.findByText("No investments yet.");
    fireEvent.click(within(screen.getByTestId("home-greeting")).getByRole("button", { name: "Import statement" }));
    expect(openImport).toHaveBeenLastCalledWith();
    fireEvent.click(within(screen.getByTestId("home-wealth")).getByRole("button", { name: "Import statement" }));
    expect(openImport).toHaveBeenLastCalledWith();
    expect(openImport).toHaveBeenCalledTimes(2);
  });

  it("opens the import flow for the member whose portfolio is empty when a member is selected", async () => {
    const openImport = vi.fn();
    mockHomeApi({ summary: { ...fixture<SummaryResponse>("summary_empty"), scope: "member", member_id: DEV }, "wealth-series": emptyWealth() });
    renderHome({ member: true, openImport });
    await screen.findByText("No investments yet.");
    fireEvent.click(within(screen.getByTestId("home-wealth")).getByRole("button", { name: "Import statement" }));
    expect(openImport).toHaveBeenLastCalledWith(DEV);
  });
});

describe("HomePage: partial data", () => {
  it("flags partial data on the wealth card and names the missing fund", async () => {
    mockHomeApi({ summary: fixture("summary_partial"), "wealth-series": fixture("wealth_partial") });
    renderHome();
    await screen.findByTestId("wealth-total");
    expect(within(screen.getByTestId("home-wealth")).getByLabelText("Partial data. Missing: Dev Gold Fund")).toBeInTheDocument();
  });
});

describe("HomePage: family and member scope", () => {
  it("asks every section for the selected member when the page opens in a member's view", async () => {
    const api = mockHomeApi();
    renderHome({ member: true });
    await screen.findByTestId("wealth-total");
    await screen.findByTestId("donut-center-value");
    for (const section of ["summary", "benchmarks", "allocation", "movers", "worth-a-look", "wealth-series"] as HomeRouteName[]) {
      const [call] = api.callsFor(section);
      expect(call.scope, section).toBe("member");
      expect(call.memberId, section).toBe(DEV);
    }
    expect(screen.getByText("Viewing Dev Rao's portfolio")).toBeInTheDocument();
    expect(screen.getByTestId("wealth-caption")).toHaveTextContent(wealthCaption("member", "Dev Rao"));
    expect(screen.queryByTestId("family-bar")).toBeNull();
  });

  it("switches every section to the member when a member card in the allocation section is chosen", async () => {
    const api = mockHomeApi();
    renderHome();
    await allLoaded();
    expect(screen.getByTestId("wealth-total")).toHaveTextContent(formatRupees(wealth1m().end_value));

    fireEvent.click(screen.getByTestId(`family-row-${DEV}`));

    // Not a stale number: every section goes back to its skeleton until the member's data arrives.
    expect(screen.getByRole("status", { name: "Loading wealth graph" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading allocation" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading movers" })).toBeInTheDocument();
    expect(screen.queryByTestId("wealth-total")).toBeNull();

    await screen.findByText("Viewing Dev Rao's portfolio");
    await screen.findByTestId("wealth-total");
    for (const section of ["summary", "benchmarks", "allocation", "movers", "worth-a-look", "wealth-series"] as HomeRouteName[]) {
      const memberCalls = api.callsFor(section).filter(call => call.scope === "member");
      expect(memberCalls, section).toHaveLength(1);
      expect(memberCalls[0].memberId).toBe(DEV);
      expect(api.callsFor(section), section).toHaveLength(2);
    }
    expect(screen.queryByTestId("family-bar")).toBeNull();
  });

  it("returns to the family with the Family combined control", async () => {
    const api = mockHomeApi();
    renderHome({ member: true });
    await screen.findByText("Viewing Dev Rao's portfolio");
    fireEvent.click(screen.getByRole("button", { name: /Family combined/ }));
    await screen.findByTestId("family-bar");
    expect(api.callsFor("allocation").filter(call => call.scope === "aggregate")).toHaveLength(1);
    expect(screen.queryByText("Viewing Dev Rao's portfolio")).toBeNull();
  });

  it("keeps the chosen period and benchmark across a scope change", async () => {
    const api = mockHomeApi();
    renderHome();
    await allLoaded();
    fireEvent.click(screen.getByRole("radio", { name: "1W" }));
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(2));
    fireEvent.click(screen.getByTestId(`family-row-${ASHA}`));
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(3));
    const last = api.callsFor("wealth-series")[2];
    expect(last.memberId).toBe(ASHA);
    expect(last.query.get("period")).toBe("1W");
  });

  it("keeps the data of the other scope out of view: a member's answer does not show the family's allocation", async () => {
    mockHomeApi();
    renderHome({ member: true });
    const donut = await screen.findByTestId("donut-center-value");
    expect(donut).toHaveTextContent(formatRupees(fixture<AllocationResponse>("allocation_member").total_value));
  });
});

describe("HomePage: glance", () => {
  it("shows the glance card only once the summary and the movers are known", async () => {
    mockHomeApi({ movers: PENDING });
    renderHome();
    await screen.findByRole("heading", { name: greetingLine("evening", "Asha") });
    expect(screen.getByRole("status", { name: "Loading summary" })).toBeInTheDocument();
    expect(screen.queryByText("Your money, at a glance")).toBeNull();
  });

  it("writes the sentence from the summary and the movers together", async () => {
    mockHomeApi();
    renderHome();
    await allLoaded();
    const sentence = buildGlanceSentence(summaryFamily(), fixture<MoversResponse>("movers_sector"));
    expect(sentence).toContain("banks contributing the most");
    expect(within(screen.getByTestId("home-glance")).getByText(sentence as string)).toBeInTheDocument();
  });
});
