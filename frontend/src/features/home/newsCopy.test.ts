import { describe, expect, it } from "vitest";
import { newsFixture } from "./fixtures/newsFixtures";
import {
  NEWS_GENERAL_NOTE,
  NEWS_HOW_NOTE,
  NEWS_HOW_WE_PICK,
  NEWS_WHY_TEXT,
  hasNewsToShow,
  isGeneralOnly,
  isSafeUrl,
  newsAge,
  newsKindLabel,
  newsMetaLine,
  staleLabel,
} from "./newsCopy";
import type { NewsItemOut, NewsResponse } from "./types";

const NOW = "2026-10-23T13:00:00Z";
const ago = (minutes: number, seconds = 0) => new Date(Date.parse(NOW) - (minutes * 60 + seconds) * 1000).toISOString();

describe("newsAge: how long ago a headline was published, relative to the server's clock", () => {
  it.each([
    [0, 0, "just now"],
    [0, 59, "just now"],
    [1, 0, "1 min ago"],
    [35, 0, "35 min ago"],
    [59, 59, "59 min ago"],
    [60, 0, "1 h ago"],
    [125, 0, "2 h ago"],
    [23 * 60 + 59, 59, "23 h ago"],
    [24 * 60, 0, "1 d ago"],
    [49 * 60, 0, "2 d ago"],
    [10 * 24 * 60, 0, "10 d ago"],
  ])("%i min %i s old reads %s", (minutes, seconds, expected) => {
    expect(newsAge(ago(minutes, seconds), NOW)).toBe(expected);
  });

  it("treats a time ahead of the clock (clock drift) as just now, never a negative age", () => {
    expect(newsAge("2026-10-23T13:05:00Z", NOW)).toBe("just now");
  });

  it("reads the golden fixture's three headlines as 2 h, 4 h and 6 h old", () => {
    const body = newsFixture("news_specific_three");
    expect(body.items.map(item => newsAge(item.published_at, body.computed_at))).toEqual(["2 h ago", "4 h ago", "6 h ago"]);
  });
});

describe("staleLabel", () => {
  it("says when the feed was last refreshed", () => {
    expect(staleLabel("2026-10-22T00:00:00Z", NOW)).toBe("Updated 1 d ago");
    expect(staleLabel(ago(35), NOW)).toBe("Updated 35 min ago");
    expect(staleLabel(NOW, NOW)).toBe("Updated just now");
  });
});

describe("newsKindLabel and newsMetaLine", () => {
  const item = (kind: NewsItemOut["kind"], icon_key: NewsItemOut["icon_key"]): Pick<NewsItemOut, "kind" | "icon_key"> => ({ kind, icon_key });

  it.each([
    ["stock", "markets", "Company news"],
    ["fund_category", "funds_amc", "Fund category"],
    ["fund_house", "funds_amc", "Fund house"],
    ["asset_class", "gold_silver", "Gold and silver"],
    ["sector", "it_tech", "Sector news"],
    ["rates_macro", "rates_rbi", "Rates and macro"],
  ] as const)("a %s item reads %s", (kind, icon, label) => {
    expect(newsKindLabel(item(kind, icon))).toBe(label);
  });

  it.each([
    ["regulation", "Regulation"],
    ["markets", "Markets"],
    ["rates_rbi", "Rates and macro"],
    ["general", "Market news"],
    ["banks_financials", "Market news"],
  ] as const)("a general item with the %s icon reads %s", (icon, label) => {
    expect(newsKindLabel(item("general", icon))).toBe(label);
  });

  it("builds the one grey meta line: kind, publisher, age", () => {
    const body = newsFixture("news_specific_three");
    expect(body.items.map(entry => newsMetaLine(entry, body.computed_at))).toEqual([
      "Company news · Moneycontrol · 2 h ago",
      "Fund house · Mint · 4 h ago",
      "Gold and silver · The Economic Times · 6 h ago",
    ]);
    const general = newsFixture("news_general_only");
    expect(newsMetaLine(general.items[2], general.computed_at)).toBe("Regulation · The Economic Times · 5 h ago");
  });
});

describe("isSafeUrl: only web addresses become links", () => {
  it.each(["https://example.com/a", "http://example.com/a", "HTTPS://EXAMPLE.COM/A"])("accepts %s", url => {
    expect(isSafeUrl(url)).toBe(true);
  });
  it.each(["javascript:alert(1)", "data:text/html,hi", "//evil.example/x", "ftp://example.com/x", "/relative/path", "", " https://example.com"])("rejects %j", url => {
    expect(isSafeUrl(url)).toBe(false);
  });
});

describe("hasNewsToShow and isGeneralOnly", () => {
  const body = (name: string) => newsFixture<NewsResponse>(name);

  it("shows the card only for an enabled, visible feed that has items", () => {
    expect(hasNewsToShow(body("news_specific_three"))).toBe(true);
    expect(hasNewsToShow(body("news_stale"))).toBe(true);
    expect(hasNewsToShow(body("news_general_only"))).toBe(true);
    for (const name of ["news_hidden", "news_empty", "news_disabled"]) expect(hasNewsToShow(body(name)), name).toBe(false);
    expect(hasNewsToShow(null)).toBe(false);
  });

  it("does not trust one flag alone", () => {
    expect(hasNewsToShow({ ...body("news_specific_three"), hidden: true })).toBe(false);
    expect(hasNewsToShow({ ...body("news_specific_three"), enabled: false })).toBe(false);
    expect(hasNewsToShow({ ...body("news_specific_three"), state: "hidden" })).toBe(false);
    expect(hasNewsToShow({ ...body("news_specific_three"), items: [] })).toBe(false);
  });

  it("is general-only when no shown item matches the user's holdings", () => {
    expect(isGeneralOnly(body("news_general_only").items)).toBe(true);
    expect(isGeneralOnly(body("news_specific_three").items)).toBe(false);
    expect(isGeneralOnly(body("news_member_debt").items)).toBe(false);
    expect(isGeneralOnly([])).toBe(false);
  });
});

describe("the fixed texts", () => {
  it("lists the seven steps of the ladder, in order, as in the mockup", () => {
    expect(NEWS_HOW_WE_PICK).toEqual([
      "Stocks you hold (your 5 largest)",
      "Fund categories you hold",
      "Fund houses you hold",
      "Asset classes, such as gold or debt",
      "Sectors",
      "Interest rates and the economy",
      "General market news, only when nothing above matches",
    ]);
  });

  it("keeps the mockup wording for the other lines", () => {
    expect(NEWS_GENERAL_NOTE).toBe("Nothing specific to your holdings right now. Showing general market news.");
    expect(NEWS_WHY_TEXT).toBe(
      "A headline appears only when it matches something you hold. We look at your stocks first, then fund categories, fund houses, asset classes, sectors and rates. If nothing specific matches, general market news is shown. The card never changes on a timer.",
    );
    expect(NEWS_HOW_NOTE).toBe(
      "The card changes only when a matching headline arrives or your holdings change, never on a timer. A specific headline stays for one day, a general one for three.",
    );
  });
});
