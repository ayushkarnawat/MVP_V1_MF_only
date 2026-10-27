import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";
import type { MoverBarOut, MoversResponse } from "./types";
import { barHalfWidth, barSubtitle, groupLabel, othersLabel, splitShares, sumDecimals } from "./moversCopy";

const bar = (change: string, funds = 1): MoverBarOut => ({
  key: change, label: change, change, funds: Array.from({ length: funds }, (_, index) => ({ scheme_id: String(index), name: `F${index}`, change: null })),
});

describe("sumDecimals", () => {
  it.each([
    [["10.00", "10.00", "-10.00"], "10.00"],
    [[], "0.00"],
    [["0.10", "0.20"], "0.30"],
    [["-0.01", "0.01"], "0.00"],
    [["1234567890123.45", "0.55"], "1234567890124.00"],
    [["+5", "-7.5"], "-2.50"],
    [["3"], "3.00"],
  ])("%j sums to %s exactly", (values, expected) => {
    expect(sumDecimals(values)).toBe(expected);
  });
});

describe("splitShares", () => {
  it("splits gains and losses, giving the bar share of the gained side", () => {
    const result = splitShares([bar("10.00"), bar("10.00")], [bar("-10.00")], "0.00");
    expect(result).toEqual({ gained: "20.00", lost: "10.00", gainedPct: 66.7 });
  });

  it("counts a positive 'others' amount as gained and a negative one as lost", () => {
    expect(splitShares([bar("10.00")], [bar("-10.00")], "2.00")).toEqual({ gained: "12.00", lost: "10.00", gainedPct: 54.5 });
    expect(splitShares([bar("10.00")], [bar("-10.00")], "-2.00")).toEqual({ gained: "10.00", lost: "12.00", gainedPct: 45.5 });
  });

  it("gives 100 percent when only gains exist, 0 when only losses, and 0 for nothing at all", () => {
    expect(splitShares([bar("5.00")], [], "0.00")).toEqual({ gained: "5.00", lost: "0.00", gainedPct: 100 });
    expect(splitShares([], [bar("-5.00")], "0.00")).toEqual({ gained: "0.00", lost: "5.00", gainedPct: 0 });
    expect(splitShares([], [], "0.00")).toEqual({ gained: "0.00", lost: "0.00", gainedPct: 0 });
  });

  it("reconciles with the net change on a real response", () => {
    const data = fixture<MoversResponse>("movers_fund");
    const { gained, lost } = splitShares(data.gains, data.losses, data.others_change);
    expect(sumDecimals([gained, `-${lost}`])).toBe(data.net_change);
  });
});

describe("barHalfWidth", () => {
  it("is a percentage of the whole track, at most 50, relative to the largest amount", () => {
    expect(barHalfWidth("10.00", 10)).toBe(50);
    expect(barHalfWidth("-5.00", 10)).toBe(25);
    expect(barHalfWidth("2.50", 10)).toBe(12.5);
    expect(barHalfWidth("1.00", 3)).toBe(16.7);
  });

  it("is zero for no change or no scale", () => {
    expect(barHalfWidth("0.00", 10)).toBe(0);
    expect(barHalfWidth("5.00", 0)).toBe(0);
  });

  it("never goes past 50", () => {
    expect(barHalfWidth("100.00", 10)).toBe(50);
  });
});

describe("labels", () => {
  it("names the grouping", () => {
    expect(groupLabel("sector")).toBe("Sector");
    expect(groupLabel("category")).toBe("Category");
    expect(groupLabel("fund")).toBe("Fund");
  });

  it("counts the funds behind a bar", () => {
    expect(barSubtitle(bar("1.00", 3))).toBe("3 funds");
    expect(barSubtitle(bar("1.00", 1))).toBe("1 fund");
    expect(barSubtitle(bar("1.00", 0))).toBe("");
  });

  it("counts the others", () => {
    expect(othersLabel(1)).toBe("1 other");
    expect(othersLabel(5)).toBe("5 others");
  });
});
