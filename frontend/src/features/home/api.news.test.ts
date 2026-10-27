import { afterEach, describe, expect, it, vi } from "vitest";
import { getNews, homePath } from "./api";
import { newsFixture } from "./fixtures/newsFixtures";
import { ASHA, HttpFailure, mockHomeApi } from "./testing/homeApi";

afterEach(() => { vi.unstubAllGlobals(); });

describe("news API", () => {
  it("builds the two scoped news paths", () => {
    expect(homePath({ viewMode: "aggregate", memberId: null }, "news")).toBe("/household/aggregate/home/news");
    expect(homePath({ viewMode: "member", memberId: ASHA }, "news")).toBe(`/household-members/${ASHA}/home/news`);
    expect(homePath({ viewMode: "member", memberId: "a b/c" }, "news")).toBe("/household-members/a%20b%2Fc/home/news");
  });

  it("asks the aggregate route for the family and returns the body untouched", async () => {
    const api = mockHomeApi({ news: newsFixture("news_general_only") });
    const body = await getNews({ viewMode: "aggregate", memberId: null });
    expect(body).toEqual(newsFixture("news_general_only"));
    expect(api.callsFor("news")).toHaveLength(1);
    expect(api.callsFor("news")[0]).toMatchObject({ scope: "aggregate", memberId: null });
  });

  it("asks the member route for a member", async () => {
    const api = mockHomeApi();
    const body = await getNews({ viewMode: "member", memberId: ASHA });
    expect(body.scope).toBe("member");
    expect(api.callsFor("news")[0]).toMatchObject({ scope: "member", memberId: ASHA });
  });

  it("refuses a member scope without a member id", async () => {
    mockHomeApi();
    await expect(getNews({ viewMode: "member", memberId: null })).rejects.toThrow("memberId is required for member scope");
  });

  it("rejects with the response status when the request fails", async () => {
    mockHomeApi({ news: new HttpFailure(503) });
    await expect(getNews({ viewMode: "aggregate", memberId: null })).rejects.toMatchObject({ status: 503 });
  });
});
