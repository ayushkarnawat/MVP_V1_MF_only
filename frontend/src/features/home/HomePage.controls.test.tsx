import { act, fireEvent, screen, waitFor, within, configure } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInShell } from "../../shell/testing";
import { fixture } from "./fixtures";
import { formatRupees } from "./homeFormat";
import { HomePage } from "./HomePage";
import { HttpFailure, MEMBERS, PENDING, mockHomeApi } from "./testing/homeApi";
import type { AllocationResponse, WealthSeriesResponse } from "./types";

// The whole front-end suite runs many files at once: give async queries room so a slow machine does not fail them.
configure({ asyncUtilTimeout: 5000 });

function renderHome() {
  return renderInShell(<HomePage today="2026-10-23" />, { scope: { members: MEMBERS } });
}

async function ready() {
  await screen.findByTestId("wealth-total");
  await screen.findByTestId("donut-center-value");
  await screen.findByTestId("movers-split");
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("HomePage: period", () => {
  it.each(["1D", "1W", "1Y"])("asks only for the wealth series when %s is chosen, keeping the benchmark", async period => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: period }));
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(2));
    const query = api.callsFor("wealth-series")[1].query;
    expect(query.get("period")).toBe(period);
    expect(query.get("benchmark")).toBe("nifty_largemidcap_250");
    expect(query.has("from")).toBe(false);
    for (const section of ["summary", "benchmarks", "allocation", "movers", "worth-a-look"] as const) {
      expect(api.callsFor(section), section).toHaveLength(1);
    }
    expect(screen.getByRole("radio", { name: period })).toHaveAttribute("aria-checked", "true");
  });

  it("shows the 1D note once the one-day series arrives", async () => {
    mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: "1D" }));
    await waitFor(() => expect(screen.getByTestId("wealth-note")).toHaveTextContent(/1D compares two NAV days/));
  });

  it("keeps the card, the number and the period control on screen while the next period loads", async () => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    const total = screen.getByTestId("wealth-total").textContent;
    api.set("wealth-series", PENDING);
    const radio = screen.getByRole("radio", { name: "1W" });
    act(() => radio.focus());
    fireEvent.click(radio);
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(2));
    expect(screen.queryByRole("status", { name: "Loading wealth graph" })).toBeNull();
    expect(screen.getByTestId("wealth-total")).toHaveTextContent(total ?? "");
    expect(screen.getByRole("radio", { name: "1W" })).toBe(radio);
    expect(document.activeElement).toBe(radio);
  });

  it("shows the new series when it arrives, and a failed refresh as the card's own error with Try again", async () => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    const week = { ...fixture<WealthSeriesResponse>("wealth_1m_family_benchmark"), period: "1W", end_value: "6000.00" };
    api.set("wealth-series", week);
    fireEvent.click(screen.getByRole("radio", { name: "1W" }));
    await waitFor(() => expect(screen.getByTestId("wealth-total")).toHaveTextContent(formatRupees("6000.00")));
    api.set("wealth-series", new HttpFailure(500));
    fireEvent.click(screen.getByRole("radio", { name: "1Y" }));
    await screen.findByText("Could not load your wealth graph.");
    api.set("wealth-series", fixture("wealth_1y_member_clipped"));
    fireEvent.click(within(screen.getByTestId("home-wealth")).getByRole("button", { name: "Try again" }));
    await screen.findByTestId("wealth-total");
    expect(api.callsFor("wealth-series")).toHaveLength(4);
    expect(api.callsFor("wealth-series")[3].query.get("period")).toBe("1Y");
  });
});

describe("HomePage: benchmark", () => {
  it("asks for the chosen benchmark and remembers it on this device", async () => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    fireEvent.change(screen.getByRole("combobox", { name: "Benchmark" }), { target: { value: "nifty_500" } });
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(2));
    expect(api.callsFor("wealth-series")[1].query.get("benchmark")).toBe("nifty_500");
    expect(api.callsFor("benchmarks")).toHaveLength(1);
    expect(localStorage.getItem("home.benchmark")).toBe("nifty_500");
  });

  it("starts from the remembered benchmark on the next visit", async () => {
    const firstApi = mockHomeApi();
    const first = renderHome();
    await ready();
    fireEvent.change(screen.getByRole("combobox", { name: "Benchmark" }), { target: { value: "nifty_midcap_150" } });
    await waitFor(() => expect(firstApi.callsFor("wealth-series")).toHaveLength(2));
    await ready();
    first.unmount();
    const api = mockHomeApi();
    renderHome();
    await ready();
    expect(api.callsFor("wealth-series")[0].query.get("benchmark")).toBe("nifty_midcap_150");
  });

  it("works when the browser blocks local storage", async () => {
    const api = mockHomeApi();
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    renderHome();
    await ready();
    fireEvent.change(screen.getByRole("combobox", { name: "Benchmark" }), { target: { value: "nifty_50" } });
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(2));
    expect(api.callsFor("wealth-series")[1].query.get("benchmark")).toBe("nifty_50");
    set.mockRestore();
    get.mockRestore();
  });
});

describe("HomePage: custom range", () => {
  const day = (n: number) => screen.getByRole("button", { name: `${n} October 2026` });

  it("opens the calendar without a request, and asks for the range once both dates are chosen", async () => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    expect(api.callsFor("wealth-series")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "1M" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(day(1));
    expect(api.callsFor("wealth-series")).toHaveLength(1);
    expect(screen.getByTestId("wealth-total")).toBeInTheDocument();

    fireEvent.click(day(10));
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(2));
    const query = api.callsFor("wealth-series")[1].query;
    expect(query.get("period")).toBe("custom");
    expect(query.get("from")).toBe("2026-10-01");
    expect(query.get("to")).toBe("2026-10-10");
    expect(query.get("benchmark")).toBe("nifty_largemidcap_250");
    await waitFor(() => expect(screen.getByRole("radio", { name: /Custom|01 Oct/ })).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByRole("button", { name: "1 October 2026" })).toBeNull();
  });

  it("does not offer a date before today minus ten years or after today", async () => {
    mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    expect(day(24)).toBeDisabled();
    expect(day(23)).toBeEnabled();
  });

  it("leaves the custom range when a preset period is chosen again, without from or to", async () => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    fireEvent.click(day(1));
    fireEvent.click(day(10));
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(2));
    fireEvent.click(screen.getByRole("radio", { name: "1W" }));
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(3));
    const query = api.callsFor("wealth-series")[2].query;
    expect(query.get("period")).toBe("1W");
    expect(query.has("from")).toBe(false);
    expect(query.has("to")).toBe(false);
  });

  it("shows the earlier range again when Custom is chosen after a preset", async () => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    fireEvent.click(day(1));
    fireEvent.click(day(10));
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(2));
    fireEvent.click(screen.getByRole("radio", { name: "1W" }));
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(3));
    expect(screen.getByTestId("wealth-total")).toHaveTextContent(formatRupees(fixture<WealthSeriesResponse>("wealth_1m_family_benchmark").end_value));
    fireEvent.click(screen.getByRole("radio", { name: /Custom|01 Oct/ }));
    // The same request was answered a moment ago, so the page may serve it from the client cache: the proof is the screen, not the call count.
    await waitFor(() => expect(screen.getByRole("radio", { name: /Custom|01 Oct/ })).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(screen.getByTestId("wealth-total")).toHaveTextContent(formatRupees(fixture<WealthSeriesResponse>("wealth_custom_past_range").end_value)));
  });
});

describe("HomePage: hide values", () => {
  it("hides the wealth number and its change only, and shows them again", async () => {
    mockHomeApi();
    renderHome();
    await ready();
    const donut = screen.getByTestId("donut-center-value").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Hide values" }));
    expect(screen.getByTestId("wealth-total")).toHaveTextContent("••••••");
    expect(screen.getByRole("button", { name: "Show values" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("donut-center-value")).toHaveTextContent(donut ?? "");
    fireEvent.click(screen.getByRole("button", { name: "Show values" }));
    expect(screen.getByTestId("wealth-total")).toHaveTextContent(formatRupees(fixture<WealthSeriesResponse>("wealth_1m_family_benchmark").end_value));
  });

  it("starts visible on every visit", async () => {
    mockHomeApi();
    const first = renderHome();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Hide values" }));
    first.unmount();
    mockHomeApi();
    renderHome();
    await ready();
    expect(screen.getByTestId("wealth-total")).not.toHaveTextContent("••••••");
  });

  it("stays hidden through a period change", async () => {
    mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Hide values" }));
    fireEvent.click(screen.getByRole("radio", { name: "1Y" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "1Y" })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByTestId("wealth-total")).toHaveTextContent("••••••");
  });
});

describe("HomePage: movers grouping", () => {
  it.each([["Category", "category"], ["Fund", "fund"]])("asks only for the movers when %s is chosen", async (label, by) => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(within(screen.getByRole("group", { name: "Group by" })).getByRole("button", { name: label }));
    await waitFor(() => expect(api.callsFor("movers")).toHaveLength(2));
    expect(api.callsFor("movers")[1].query.get("by")).toBe(by);
    for (const section of ["summary", "benchmarks", "allocation", "wealth-series", "worth-a-look"] as const) {
      expect(api.callsFor(section), section).toHaveLength(1);
    }
    expect(within(screen.getByRole("group", { name: "Group by" })).getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the movers card and the grouping buttons on screen while the next grouping loads", async () => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    api.set("movers", PENDING);
    const button = within(screen.getByRole("group", { name: "Group by" })).getByRole("button", { name: "Fund" });
    act(() => button.focus());
    fireEvent.click(button);
    await waitFor(() => expect(api.callsFor("movers")).toHaveLength(2));
    expect(screen.queryByRole("status", { name: "Loading movers" })).toBeNull();
    expect(screen.getByTestId("movers-split")).toBeInTheDocument();
    expect(document.activeElement).toBe(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the glance sentence on screen while the movers reload", async () => {
    const api = mockHomeApi();
    renderHome();
    await ready();
    await screen.findByText("Your money, at a glance");
    api.set("movers", PENDING);
    fireEvent.click(within(screen.getByRole("group", { name: "Group by" })).getByRole("button", { name: "Category" }));
    await waitFor(() => expect(api.callsFor("movers")).toHaveLength(2));
    expect(screen.getByText("Your money, at a glance")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading summary" })).toBeNull();
  });
});

describe("HomePage: Mira and information buttons", () => {
  it("opens the shared Ask Mira dialog from the glance card, and Escape closes it", async () => {
    mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(within(screen.getByTestId("home-glance")).getByRole("button"));
    expect(await screen.findByRole("dialog", { name: "Ask Mira" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Ask Mira" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ask Mira" })).toBeNull());
  });

  it("opens the same dialog from the wealth card's calculation button", async () => {
    mockHomeApi();
    renderHome();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "How is this calculated?" }));
    expect(await screen.findByRole("dialog", { name: "Ask Mira" })).toBeInTheDocument();
  });

  it("starts with no dialog open", async () => {
    mockHomeApi();
    renderHome();
    await ready();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("HomePage: allocation legend", () => {
  it("shows the allocation figures from the allocation response", async () => {
    mockHomeApi();
    renderHome();
    await ready();
    expect(screen.getByTestId("donut-center-value")).toHaveTextContent(formatRupees(fixture<AllocationResponse>("allocation_family").total_value));
  });
});
