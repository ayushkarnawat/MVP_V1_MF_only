import { act, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newsFixture } from "./fixtures/newsFixtures";
import { ASHA, HttpFailure, PENDING, mockHomeApi, type HomeCall } from "./testing/homeApi";
import type { HomeScopeArg, NewsResponse } from "./types";
import { NEWS_FOCUS_THROTTLE_MS, useNews } from "./useNews";

configure({ asyncUtilTimeout: 5000 });

function Probe({ scope, scopeKey }: { scope: HomeScopeArg; scopeKey: string }) {
  const news = useNews(scope, scopeKey);
  return (
    <div>
      <span data-testid="status">{news.status}</span>
      <span data-testid="first">{news.data?.items[0]?.headline ?? "-"}</span>
      <span data-testid="scope">{news.data?.scope ?? "-"}</span>
      <span data-testid="refreshing">{String(news.refreshing)}</span>
      <button type="button" onClick={news.refresh}>refresh</button>
    </div>
  );
}

const FAMILY: HomeScopeArg = { viewMode: "aggregate", memberId: null };
const text = (id: string) => screen.getByTestId(id).textContent;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => state === "hidden" });
}
function comeBackToTheTab() {
  setVisibility("visible");
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}

beforeEach(() => { setVisibility("visible"); });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (document as unknown as Record<string, unknown>).visibilityState;
  delete (document as unknown as Record<string, unknown>).hidden;
});

describe("useNews: loading", () => {
  it("is loading, then has the data, after one request", async () => {
    const api = mockHomeApi();
    render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    expect(text("status")).toBe("loading");
    expect(text("first")).toBe("-");
    await waitFor(() => expect(text("status")).toBe("data"));
    expect(text("first")).toBe("HDFC Bank shares rally after strong quarterly results");
    expect(text("refreshing")).toBe("false");
    expect(api.callsFor("news")).toHaveLength(1);
  });

  it("reports an error with no data when the request fails", async () => {
    mockHomeApi({ news: new HttpFailure(500) });
    render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    await waitFor(() => expect(text("status")).toBe("error"));
    expect(text("first")).toBe("-");
  });

  it("goes back to loading with no data when the scope changes, so one member's news never shows under another", async () => {
    const api = mockHomeApi({ news: (call: HomeCall) => (call.scope === "member" ? PENDING : newsFixture<NewsResponse>("news_specific_three")) });
    const { rerender } = render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    await waitFor(() => expect(text("status")).toBe("data"));
    rerender(<Probe scope={{ viewMode: "member", memberId: ASHA }} scopeKey={`member:${ASHA}`} />);
    expect(text("status")).toBe("loading");
    expect(text("first")).toBe("-");
    await waitFor(() => expect(api.callsFor("news")).toHaveLength(2));
    expect(api.callsFor("news")[1]).toMatchObject({ scope: "member", memberId: ASHA });
  });

  it("shows the member's own news after a scope change", async () => {
    const api = mockHomeApi();
    const { rerender } = render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    await waitFor(() => expect(text("status")).toBe("data"));
    rerender(<Probe scope={{ viewMode: "member", memberId: ASHA }} scopeKey={`member:${ASHA}`} />);
    await waitFor(() => expect(text("scope")).toBe("member"));
    expect(text("first")).toBe("RBI holds repo rate steady amid inflation concerns");
    expect(api.callsFor("news")).toHaveLength(2);
  });
});

describe("useNews: refresh", () => {
  it("keeps the headlines on screen while it asks again, asks the server (not the 60 second cache), then swaps in the new ones", async () => {
    const later = deferred<unknown>();
    let calls = 0;
    const api = mockHomeApi({ news: () => (++calls === 1 ? newsFixture("news_specific_three") : later.promise) });
    render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    await waitFor(() => expect(text("status")).toBe("data"));

    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(text("refreshing")).toBe("true"));
    expect(text("status")).toBe("data");
    expect(text("first")).toBe("HDFC Bank shares rally after strong quarterly results");
    expect(api.callsFor("news")).toHaveLength(2);

    later.resolve(newsFixture("news_general_only"));
    await waitFor(() => expect(text("refreshing")).toBe("false"));
    expect(text("first")).toBe("Sensex ends flat amid mixed global cues");
  });

  it("ignores another refresh while one is still running", async () => {
    const later = deferred<unknown>();
    let calls = 0;
    const api = mockHomeApi({ news: () => (++calls === 1 ? newsFixture("news_specific_three") : later.promise) });
    render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    await waitFor(() => expect(text("status")).toBe("data"));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    expect(api.callsFor("news")).toHaveLength(2);
    later.resolve(newsFixture("news_specific_three"));
    await waitFor(() => expect(text("refreshing")).toBe("false"));
  });

  it("keeps the old headlines and stays quiet when a refresh fails", async () => {
    let calls = 0;
    mockHomeApi({ news: () => (++calls === 1 ? newsFixture("news_specific_three") : new HttpFailure(500)) });
    render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    await waitFor(() => expect(text("status")).toBe("data"));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(text("refreshing")).toBe("false"));
    expect(text("status")).toBe("data");
    expect(text("first")).toBe("HDFC Bank shares rally after strong quarterly results");
  });

  it("does not bring an earlier refresh back when the user returns to a scope", async () => {
    let familyCalls = 0;
    mockHomeApi({
      news: (call: HomeCall) => {
        if (call.scope === "member") return newsFixture("news_member_debt");
        familyCalls += 1;
        if (familyCalls === 1) return newsFixture("news_specific_three");
        return familyCalls === 2 ? newsFixture("news_general_only") : PENDING;
      },
    });
    const { rerender } = render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    await waitFor(() => expect(text("status")).toBe("data"));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(text("first")).toBe("Sensex ends flat amid mixed global cues"));

    rerender(<Probe scope={{ viewMode: "member", memberId: ASHA }} scopeKey={`member:${ASHA}`} />);
    await waitFor(() => expect(text("scope")).toBe("member"));
    rerender(<Probe scope={FAMILY} scopeKey="aggregate" />);
    expect(text("status")).toBe("loading");
    expect(text("first")).toBe("-");
  });

  it("drops an answer that arrives after the scope has changed", async () => {
    const late = deferred<unknown>();
    let calls = 0;
    const api = mockHomeApi({
      news: (call: HomeCall) => {
        if (call.scope === "member") return newsFixture("news_member_debt");
        return ++calls === 1 ? newsFixture("news_specific_three") : late.promise;
      },
    });
    const { rerender } = render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    await waitFor(() => expect(text("status")).toBe("data"));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(text("refreshing")).toBe("true"));

    rerender(<Probe scope={{ viewMode: "member", memberId: ASHA }} scopeKey={`member:${ASHA}`} />);
    await waitFor(() => expect(text("scope")).toBe("member"));
    late.resolve(newsFixture("news_general_only"));
    await act(async () => { await Promise.resolve(); });
    expect(text("scope")).toBe("member");
    expect(text("first")).toBe("RBI holds repo rate steady amid inflation concerns");
    expect(text("refreshing")).toBe("false");
    expect(api.callsFor("news")).toHaveLength(3);
  });
});

describe("useNews: coming back to the tab", () => {
  const T = Date.parse("2026-10-23T13:00:00Z");

  async function loaded() {
    const api = mockHomeApi();
    vi.spyOn(Date, "now").mockReturnValue(T);
    const view = render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    await waitFor(() => expect(text("status")).toBe("data"));
    return { api, ...view };
  }

  it("asks again only when five minutes have passed since the last answer", async () => {
    expect(NEWS_FOCUS_THROTTLE_MS).toBe(5 * 60 * 1000);
    const { api } = await loaded();
    vi.spyOn(Date, "now").mockReturnValue(T + NEWS_FOCUS_THROTTLE_MS - 1);
    comeBackToTheTab();
    expect(api.callsFor("news")).toHaveLength(1);

    vi.spyOn(Date, "now").mockReturnValue(T + NEWS_FOCUS_THROTTLE_MS);
    comeBackToTheTab();
    await waitFor(() => expect(api.callsFor("news")).toHaveLength(2));
  });

  it("starts a new five minute wait after each refresh, manual ones included", async () => {
    const { api } = await loaded();
    vi.spyOn(Date, "now").mockReturnValue(T + NEWS_FOCUS_THROTTLE_MS);
    comeBackToTheTab();
    await waitFor(() => expect(api.callsFor("news")).toHaveLength(2));
    await waitFor(() => expect(text("refreshing")).toBe("false"));
    vi.spyOn(Date, "now").mockReturnValue(T + NEWS_FOCUS_THROTTLE_MS + 1000);
    comeBackToTheTab();
    expect(api.callsFor("news")).toHaveLength(2);
  });

  it("does nothing when the tab is being hidden", async () => {
    const { api } = await loaded();
    vi.spyOn(Date, "now").mockReturnValue(T + 10 * NEWS_FOCUS_THROTTLE_MS);
    setVisibility("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(api.callsFor("news")).toHaveLength(1);
  });

  it("does nothing before the first answer has arrived", async () => {
    const api = mockHomeApi({ news: PENDING });
    vi.spyOn(Date, "now").mockReturnValue(T);
    render(<Probe scope={FAMILY} scopeKey="aggregate" />);
    vi.spyOn(Date, "now").mockReturnValue(T + 10 * NEWS_FOCUS_THROTTLE_MS);
    comeBackToTheTab();
    expect(api.callsFor("news")).toHaveLength(1);
  });

  it("stops listening when the page is left", async () => {
    const { api, unmount } = await loaded();
    unmount();
    vi.spyOn(Date, "now").mockReturnValue(T + 10 * NEWS_FOCUS_THROTTLE_MS);
    comeBackToTheTab();
    expect(api.callsFor("news")).toHaveLength(1);
  });
});
