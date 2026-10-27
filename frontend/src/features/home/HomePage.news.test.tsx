import { act, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInShell } from "../../shell/testing";
import { fixture } from "./fixtures";
import { newsFixture } from "./fixtures/newsFixtures";
import { greetingLine } from "./homeFormat";
import { HomePage } from "./HomePage";
import { DEV, HttpFailure, MEMBERS, PENDING, mockHomeApi, type HomeRouteName } from "./testing/homeApi";
import type { MoversResponse, SummaryResponse } from "./types";

// The whole front-end suite runs many files at once: give async queries room so a slow machine does not fail them.
configure({ asyncUtilTimeout: 5000 });

const TODAY = "2026-10-23";

function renderHome(options: { member?: boolean } = {}) {
  const scope = options.member
    ? { members: MEMBERS, viewMode: "member" as const, memberId: DEV }
    : { members: MEMBERS };
  return renderInShell(<HomePage today={TODAY} />, { scope });
}

async function allLoaded() {
  await screen.findByRole("heading", { name: greetingLine("evening", "Asha") });
  await screen.findByTestId("wealth-total");
  await screen.findByTestId("donut-center-value");
  await screen.findByTestId("movers-split");
  await screen.findByTestId("worth-card-weak_fund");
}

const newsRegion = () => screen.findByRole("region", { name: "News affecting top holdings" });

beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe("HomePage: the news section", () => {
  it("shows the golden news card in the last place, below Worth a look, full width", async () => {
    mockHomeApi();
    renderHome();
    await allLoaded();
    const region = await newsRegion();
    const wrapper = screen.getByTestId("home-news");
    expect(wrapper).toContainElement(region);
    expect(screen.getByTestId("home-worth").compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("home-grid")).not.toContainElement(wrapper);
    expect(wrapper.className).toContain("empty:hidden");
    expect(wrapper.parentElement).toBe(screen.getByTestId("home-page"));
    expect(wrapper.nextElementSibling).toBeNull();
    expect(within(region).getAllByTestId(/^news-item-/)).toHaveLength(3);
    expect(within(region).getByText("HDFC Bank shares rally after strong quarterly results")).toBeInTheDocument();
  });

  it("asks for news once, and after the other sections have been asked (it loads last)", async () => {
    const api = mockHomeApi();
    renderHome();
    await allLoaded();
    await newsRegion();
    expect(api.callsFor("news")).toHaveLength(1);
    const first = (section: HomeRouteName) => api.calls.findIndex(call => call.section === section);
    for (const section of ["summary", "benchmarks", "allocation", "worth-a-look", "movers"] as HomeRouteName[]) {
      expect(first("news"), section).toBeGreaterThan(first(section));
    }
    expect(api.callsFor("news")[0]).toMatchObject({ scope: "aggregate", memberId: null });
  });

  it("never holds the other sections back: they all load while the news request is still open", async () => {
    mockHomeApi({ news: PENDING });
    renderHome();
    await allLoaded();
    expect(screen.getByRole("status", { name: "Loading news" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "News affecting top holdings" })).toBeNull();
  });

  it("opens in a member's view with that member's news", async () => {
    const api = mockHomeApi();
    renderHome({ member: true });
    await screen.findByText("RBI holds repo rate steady amid inflation concerns");
    expect(api.callsFor("news")).toHaveLength(1);
    expect(api.callsFor("news")[0]).toMatchObject({ scope: "member", memberId: DEV });
    expect(screen.getByText("Gold prices rally to fresh highs on safe-haven demand")).toBeInTheDocument();
  });

  it("switches to the member's news, behind a skeleton and not a stale card, when a member is chosen", async () => {
    const api = mockHomeApi();
    renderHome();
    await allLoaded();
    await newsRegion();

    fireEvent.click(screen.getByTestId(`family-row-${DEV}`));
    expect(screen.getByRole("status", { name: "Loading news" })).toBeInTheDocument();
    expect(screen.queryByText("HDFC Bank shares rally after strong quarterly results")).toBeNull();

    await screen.findByText("RBI holds repo rate steady amid inflation concerns");
    expect(api.callsFor("news")).toHaveLength(2);
    expect(api.callsFor("news")[1]).toMatchObject({ scope: "member", memberId: DEV });
  });

  it("is not asked again when the period or the movers grouping changes", async () => {
    const api = mockHomeApi();
    renderHome();
    await allLoaded();
    await newsRegion();
    fireEvent.click(screen.getByRole("radio", { name: "1W" }));
    fireEvent.click(screen.getByRole("button", { name: "Fund" }));
    await waitFor(() => expect(api.callsFor("movers")).toHaveLength(2));
    await waitFor(() => expect(api.callsFor("wealth-series")).toHaveLength(2));
    expect(api.callsFor("news")).toHaveLength(1);
  });

  it("shows nothing, no error and no retry, when the news request fails, and every other section still shows", async () => {
    const api = mockHomeApi({ news: new HttpFailure(500) });
    renderHome();
    await allLoaded();
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading news" })).toBeNull());
    expect(api.callsFor("news")).toHaveLength(1);
    expect(screen.getByTestId("home-news")).toBeEmptyDOMElement();
    expect(screen.queryByText(/news/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
    expect(screen.getByText("Your money, at a glance")).toBeInTheDocument();
  });

  it.each(["news_hidden", "news_empty", "news_disabled"])("shows nothing for the %s answer", async name => {
    const api = mockHomeApi({ news: newsFixture(name) });
    renderHome();
    await allLoaded();
    await waitFor(() => expect(api.callsFor("news")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading news" })).toBeNull());
    expect(screen.getByTestId("home-news")).toBeEmptyDOMElement();
  });

  it("labels a feed that is more than 36 hours old", async () => {
    mockHomeApi({ news: newsFixture("news_stale") });
    renderHome();
    await allLoaded();
    expect(await screen.findByTestId("news-stale")).toHaveTextContent("Updated 1 d ago");
  });

  it("says when only general headlines are shown", async () => {
    mockHomeApi({ news: newsFixture("news_general_only") });
    renderHome();
    await allLoaded();
    expect(await screen.findByTestId("news-general-note")).toBeInTheDocument();
  });

  it("shows no news section at all for a portfolio with no holdings", async () => {
    mockHomeApi({ summary: fixture("summary_empty") });
    renderHome();
    await screen.findByText("Import a statement to see your portfolio.");
    expect(screen.queryByTestId("home-news")).toBeNull();
    expect(screen.queryByRole("status", { name: "Loading news" })).toBeNull();
    expect(screen.queryByRole("region", { name: "News affecting top holdings" })).toBeNull();
  });

  it("asks the server again when Refresh news is pressed, keeping the headlines meanwhile", async () => {
    let calls = 0;
    let release: (body: unknown) => void = () => {};
    const api = mockHomeApi({
      news: () => (++calls === 1 ? newsFixture("news_specific_three") : new Promise(resolve => { release = resolve; })),
    });
    renderHome();
    await allLoaded();
    const region = await newsRegion();
    fireEvent.click(within(region).getByRole("button", { name: "Refresh news" }));
    await waitFor(() => expect(api.callsFor("news")).toHaveLength(2));
    expect(within(region).getByRole("button", { name: "Refresh news" })).toHaveAttribute("aria-busy", "true");
    expect(within(region).getAllByTestId(/^news-item-/)).toHaveLength(3);

    act(() => { release(newsFixture("news_general_only")); });
    await screen.findByText("Sensex ends flat amid mixed global cues");
    expect(screen.queryByText("HDFC Bank shares rally after strong quarterly results")).toBeNull();
    expect(within(await newsRegion()).getByRole("button", { name: "Refresh news" })).toHaveAttribute("aria-busy", "false");
  });

  it("asks again when the user comes back to the tab after five minutes", async () => {
    const api = mockHomeApi();
    const start = Date.now();
    renderHome();
    await allLoaded();
    await newsRegion();
    vi.spyOn(Date, "now").mockReturnValue(start + 6 * 60 * 1000);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(api.callsFor("news")).toHaveLength(2));
  });
});

describe("HomePage: the greeting's top mover opens the movers popup (register C99, C120)", () => {
  const sentence = () => screen.getByTestId("greeting-sentence");

  it("switches the movers to the Fund grouping and opens the popup of the top contributor", async () => {
    const api = mockHomeApi();
    renderHome();
    await allLoaded();
    expect(screen.getByRole("button", { name: "Sector" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(sentence()).getByRole("button", { name: "Asha Large Cap" }));

    const dialog = await screen.findByRole("dialog", { name: "Asha Large Cap funds" });
    expect(screen.getByRole("button", { name: "Fund" })).toHaveAttribute("aria-pressed", "true");
    expect(api.callsFor("movers").map(call => call.query.get("by"))).toEqual(["sector", "fund"]);
    expect(dialog).toHaveFocus();
    expect(within(screen.getByTestId("home-movers")).getByRole("dialog")).toBe(dialog);
  });

  it("opens the popup at once when the Fund grouping is already showing, without asking again", async () => {
    const api = mockHomeApi();
    renderHome();
    await allLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Fund" }));
    await waitFor(() => expect(api.callsFor("movers")).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId("mover-54b8755e-6b2b-5f4f-a8fe-b41125031af6")).toBeInTheDocument());

    fireEvent.click(within(sentence()).getByRole("button", { name: "Asha Large Cap" }));
    expect(await screen.findByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
    expect(api.callsFor("movers")).toHaveLength(2);
  });

  it("opens again each time the link is used, after the popup was closed with Escape", async () => {
    mockHomeApi();
    renderHome();
    await allLoaded();
    const link = () => within(sentence()).getByRole("button", { name: "Asha Large Cap" });
    fireEvent.click(link());
    const dialog = await screen.findByRole("dialog", { name: "Asha Large Cap funds" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(link());
    expect(await screen.findByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("uses the member's top contributor in a member's view", async () => {
    mockHomeApi();
    renderHome({ member: true });
    await screen.findByText("Viewing Dev Rao's portfolio");
    await screen.findByTestId("movers-split");
    fireEvent.click(within(sentence()).getByRole("button", { name: "Dev Gold Fund" }));
    expect(await screen.findByRole("dialog", { name: "Dev Gold Fund funds" })).toBeInTheDocument();
  });

  it("still switches to the Fund grouping, but opens nothing, when the top contributor is not among the rows shown", async () => {
    const summary = { ...fixture<SummaryResponse>("summary_family"), top_contributor: "Nobody Fund", top_contributor_scheme_id: null };
    const api = mockHomeApi({ summary });
    renderHome();
    await allLoaded();
    fireEvent.click(within(sentence()).getByRole("button", { name: "Nobody Fund" }));
    await waitFor(() => expect(api.callsFor("movers")).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Fund" })).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(screen.getByTestId("mover-54b8755e-6b2b-5f4f-a8fe-b41125031af6")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the row whose scheme id the summary names, even when the summary's name matches no row", async () => {
    const summary = { ...fixture<SummaryResponse>("summary_family"), top_contributor: "Asha Large Cap (renamed)", top_contributor_scheme_id: "54b8755e-6b2b-5f4f-a8fe-b41125031af6" };
    mockHomeApi({ summary });
    renderHome();
    await allLoaded();
    fireEvent.click(within(sentence()).getByRole("button", { name: "Asha Large Cap (renamed)" }));
    expect(await screen.findByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("matches by the id, not the name, when the two point at different rows", async () => {
    const summary = { ...fixture<SummaryResponse>("summary_family"), top_contributor: "Asha Large Cap", top_contributor_scheme_id: "7c906599-2ff8-5de4-83f9-b94651c683f2" };
    mockHomeApi({ summary });
    renderHome();
    await allLoaded();
    fireEvent.click(within(sentence()).getByRole("button", { name: "Asha Large Cap" }));
    expect(await screen.findByRole("dialog", { name: "Dev Gold Fund funds" })).toBeInTheDocument();
  });

  it("opens nothing when the id is given but is not among the rows shown, even if the name matches a row", async () => {
    const summary = { ...fixture<SummaryResponse>("summary_family"), top_contributor: "Asha Large Cap", top_contributor_scheme_id: "00000000-0000-4000-8000-000000000000" };
    const api = mockHomeApi({ summary });
    renderHome();
    await allLoaded();
    fireEvent.click(within(sentence()).getByRole("button", { name: "Asha Large Cap" }));
    await waitFor(() => expect(api.callsFor("movers")).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId("mover-54b8755e-6b2b-5f4f-a8fe-b41125031af6")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falls back to the name when an older server sends no id at all", async () => {
    const summary: Record<string, unknown> = { ...fixture<SummaryResponse>("summary_family") };
    delete summary.top_contributor_scheme_id;
    mockHomeApi({ summary });
    renderHome();
    await allLoaded();
    fireEvent.click(within(sentence()).getByRole("button", { name: "Asha Large Cap" }));
    expect(await screen.findByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("uses the member's own scheme id in a member's view", async () => {
    const summary = { ...fixture<SummaryResponse>("summary_member"), top_contributor: "Dev Gold Fund (renamed)" };
    mockHomeApi({ summary });
    renderHome({ member: true });
    await screen.findByText("Viewing Dev Rao's portfolio");
    await screen.findByTestId("movers-split");
    fireEvent.click(within(sentence()).getByRole("button", { name: "Dev Gold Fund (renamed)" }));
    expect(await screen.findByRole("dialog", { name: "Dev Gold Fund funds" })).toBeInTheDocument();
  });

  it("has no link when the server names no top contributor", async () => {
    mockHomeApi({ summary: { ...fixture<SummaryResponse>("summary_family"), top_contributor: null } });
    renderHome();
    await allLoaded();
    expect(screen.queryByTestId("greeting-top-mover")).toBeNull();
  });

  it("leaves the Glance card opening the Ask Mira dialog as before", async () => {
    mockHomeApi({ movers: fixture<MoversResponse>("movers_sector") });
    renderHome();
    await allLoaded();
    fireEvent.click(screen.getByText("Your money, at a glance"));
    expect(await screen.findByRole("dialog", { name: "Ask Mira" })).toBeInTheDocument();
  });
});
