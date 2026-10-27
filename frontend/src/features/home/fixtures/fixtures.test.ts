import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import type { WealthSeriesResponse } from "../types";
import { FIXTURE_NAMES, fixture } from "./index";

// The contract guard: if the backend moves a field, the regenerated fixtures stop matching these
// lists and this test fails before any page does. Keep the lists in step with types.ts.
const ENVELOPE = ["scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at"];
const EXTRAS: Record<string, string[]> = {
  summary: [
    "display_name", "greeting", "scope_label", "change_amount", "change_pct", "direction", "status_phrase",
    "since_label", "since_date", "top_contributor", "top_contributor_scheme_id", "members_connected", "members_total", "data_line",
    "has_holdings", "total_value", "members",
  ],
  wealth: [
    "period", "start", "end", "clamped", "empty", "points", "start_value", "end_value", "net_contributions",
    "change_amount", "change_pct", "change_method", "benchmark",
  ],
  allocation: ["source", "approximate", "total_value", "classes", "covered_pct", "mix_as_of", "members"],
  movers: [
    "requested_view", "view", "fell_back", "estimated", "coverage_pct", "net_change", "net_pct",
    "previous_value", "previous_nav_date", "gains", "losses", "others_count", "others_change",
  ],
  worth: ["cards", "unavailable", "state"],
  benchmarks: ["options", "recommended_index", "reason"],
};

describe("Home golden fixtures", () => {
  it("has the 29 files the backend generates", () => {
    expect(FIXTURE_NAMES).toHaveLength(29);
    expect(FIXTURE_NAMES).toContain("worth_concentration_with_earlier");
    for (const name of ["summary_statement_priced_fund", "wealth_1m_fund_sold_in_period", "wealth_1m_statement_priced_fund", "wealth_custom_past_range"]) {
      expect(FIXTURE_NAMES).toContain(name);
    }
  });

  // Guard against the copy going stale: when the backend set is in the checkout, every file in it has an identical copy here.
  const BACKEND = resolve("../backend/tests/fixtures/home");
  it.skipIf(!existsSync(BACKEND))("matches the backend's generated set file for file", () => {
    const backend = readdirSync(BACKEND).filter(file => file.endsWith(".json")).sort();
    expect(backend.map(file => file.slice(0, -5))).toEqual(FIXTURE_NAMES);
    for (const file of backend) {
      const here = resolve("src/features/home/fixtures", file);
      expect(JSON.parse(readFileSync(here, "utf8")), file).toEqual(JSON.parse(readFileSync(resolve(BACKEND, file), "utf8")));
    }
  });

  it("throws for a name that does not exist", () => {
    expect(() => fixture("nope")).toThrow("unknown Home fixture: nope");
  });

  it("returns a copy, so a test can change it without affecting another", () => {
    const first = fixture<{ total_value: string }>("summary_family");
    first.total_value = "changed";
    expect(fixture<{ total_value: string }>("summary_family").total_value).toBe("5212.00");
  });

  it.each(FIXTURE_NAMES)("%s has exactly the contract's fields", name => {
    const group = name.split("_")[0];
    const body = fixture<Record<string, unknown>>(name);
    expect(Object.keys(body).sort()).toEqual([...ENVELOPE, ...EXTRAS[group]].sort());
  });

  it("serialises money and percentages as strings and dates as ISO text", () => {
    const summary = fixture<Record<string, unknown>>("summary_family");
    for (const key of ["change_amount", "change_pct", "total_value"]) expect(typeof summary[key]).toBe("string");
    const wealth = fixture<WealthSeriesResponse>("wealth_1m_family_benchmark");
    expect(wealth.points.every(point => typeof point.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(point.date))).toBe(true);
    expect(wealth.benchmark?.points.every(point => typeof point.pct === "string")).toBe(true);
    expect(summary.computed_at).toMatch(/Z$/);
  });
});
