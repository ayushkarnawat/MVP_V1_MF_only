import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { NEWS_FIXTURE_NAMES, newsFixture } from "./newsFixtures";
import type { NewsResponse } from "../types";

// The contract guard: if the backend moves a field, the regenerated fixtures stop matching these lists
// and this test fails before any component does. Keep the lists in step with types.ts.
const ENVELOPE = ["scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at"];
const EXTRAS = ["enabled", "state", "feed_as_of", "stale", "hidden", "texts", "items"];
const TEXTS = ["title", "subtext", "disclaimer", "about_credit_text", "about_credit_url"];
const ITEM = [
  "id", "kind", "tier", "specific", "source", "headline", "url", "published_at", "icon_key", "entity_label",
  "reason", "exposure_pct", "exposure_text", "exposure_as_of", "funds",
];

describe("News golden fixtures", () => {
  it("has the 8 files the backend generates", () => {
    expect(NEWS_FIXTURE_NAMES).toEqual([
      "news_disabled", "news_empty", "news_general_only", "news_hidden", "news_low_coverage",
      "news_member_debt", "news_specific_three", "news_stale",
    ]);
  });

  // Guard against the copy going stale: when the backend set is in the checkout, every file in it has an identical copy here.
  const BACKEND = resolve("../backend/tests/fixtures/news");
  it.skipIf(!existsSync(BACKEND))("matches the backend's generated set file for file", () => {
    const backend = readdirSync(BACKEND).filter(file => /^news_.*\.json$/.test(file)).sort();
    expect(backend.map(file => file.slice(0, -5))).toEqual(NEWS_FIXTURE_NAMES);
    for (const file of backend) {
      const here = resolve("src/features/home/fixtures/news", file);
      expect(JSON.parse(readFileSync(here, "utf8")), file).toEqual(JSON.parse(readFileSync(resolve(BACKEND, file), "utf8")));
    }
  });

  it("throws for a name that does not exist", () => {
    expect(() => newsFixture("nope")).toThrow("unknown News fixture: nope");
  });

  it("returns a copy, so a test can change it without affecting another", () => {
    const first = newsFixture("news_specific_three");
    first.items[0].headline = "changed";
    expect(newsFixture("news_specific_three").items[0].headline).toBe("HDFC Bank shares rally after strong quarterly results");
  });

  it.each(NEWS_FIXTURE_NAMES)("%s has exactly the contract's fields", name => {
    const body = newsFixture<Record<string, unknown>>(name);
    expect(Object.keys(body).sort()).toEqual([...ENVELOPE, ...EXTRAS].sort());
    expect(Object.keys(body.texts as object).sort()).toEqual([...TEXTS].sort());
    for (const item of body.items as object[]) expect(Object.keys(item).sort()).toEqual([...ITEM].sort());
  });

  it("covers every state the section must handle", () => {
    const by = (name: string) => newsFixture<NewsResponse>(name);
    expect(by("news_specific_three")).toMatchObject({ state: "items", stale: false, hidden: false, enabled: true });
    expect(by("news_stale")).toMatchObject({ state: "items", stale: true, hidden: false });
    expect(by("news_hidden")).toMatchObject({ state: "hidden", stale: true, hidden: true, items: [] });
    expect(by("news_empty")).toMatchObject({ state: "empty", feed_as_of: null, items: [] });
    expect(by("news_disabled")).toMatchObject({ state: "disabled", enabled: false, items: [] });
    expect(by("news_general_only").items.every(item => !item.specific)).toBe(true);
    expect(by("news_member_debt").scope).toBe("member");
    expect(by("news_low_coverage").items[0].exposure_pct).toBeNull();
  });
});
