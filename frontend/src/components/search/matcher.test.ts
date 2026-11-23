import { describe, expect, it } from "vitest";
import { matchesItem, normalise, type SearchableItem } from "./matcher";

const item = (fields: SearchableItem["fields"]): SearchableItem => ({ fields });

describe("normalise", () => {
  it("lowercases, drops ₹ and commas, turns - and & into spaces, collapses spaces, trims", () => {
    expect(normalise("  Parag-Parikh  Flexi & Cap  ")).toBe("parag parikh flexi cap");
    expect(normalise("₹1,25,000")).toBe("125000");
    expect(normalise("HDFC  Mid-Cap   Opportunities")).toBe("hdfc mid cap opportunities");
  });
});

describe("matchesItem", () => {
  it("matches parag-parikh and parag parikh symmetrically", () => {
    const pp = item([{ value: "Parag-Parikh Flexi Cap", kind: "name" }]);
    expect(matchesItem(normalise("parag parikh").split(" "), pp)).toBeGreaterThan(0);

    const ppSpace = item([{ value: "Parag Parikh Flexi Cap", kind: "name" }]);
    expect(matchesItem(normalise("parag-parikh").split(" "), ppSpace)).toBeGreaterThan(0);
  });

  it("requires every query word to match in any order", () => {
    const pp = item([
      { value: "Parag Parikh Flexi Cap Fund", kind: "name" },
      { value: "PPFAS", kind: "alias" },
    ]);
    expect(matchesItem(["flexi", "parag"], pp)).toBeGreaterThan(0);
    expect(matchesItem(["ppfas", "flexi"], pp)).toBeGreaterThan(0);
    expect(matchesItem(["parag", "small"], pp)).toBe(0);
  });

  it("matches start of a field word, and inside a word only for 3+ letters", () => {
    const pp = item([{ value: "Parag Parikh Flexi Cap", kind: "name" }]);
    // "in" (2 letters) must not match inside "Parikh" or anything else
    expect(matchesItem(["ik"], pp)).toBe(0);
    // "ikh" (3 letters) matches inside "Parikh"
    expect(matchesItem(["ikh"], pp)).toBeGreaterThan(0);
    // "pa" (2 letters) matches start of "Parag"
    expect(matchesItem(["pa"], pp)).toBeGreaterThan(0);
  });

  it("ranks first name starts-with > name word starts-with > any field > forgiven", () => {
    const startsWithWhole = item([{ value: "Parag Parikh Flexi Cap", kind: "name" }]);
    const wordStartsWith = item([{ value: "HDFC Parag Flexi Cap", kind: "name" }]);
    const aliasMatch = item([
      { value: "Some Other Fund", kind: "name" },
      { value: "parag", kind: "alias" },
    ]);
    const forgivenMatch = item([{ value: "Parag Parikh Flexi Cap", kind: "name" }]);

    const r1 = matchesItem(["parag", "parikh"], startsWithWhole);
    const r2 = matchesItem(["parag"], wordStartsWith);
    const r3 = matchesItem(["parag"], aliasMatch);
    const r4 = matchesItem(["parrag"], forgivenMatch);

    expect(r1).toBeGreaterThan(r2);
    expect(r2).toBeGreaterThan(r3);
    expect(r3).toBeGreaterThan(r4);
    expect(r4).toBeGreaterThan(0);
  });

  it("forgives 1 edit for 4-7 letter words on name fields: wrong, missing, extra, swapped", () => {
    const flexi = item([{ value: "Flexi Cap Fund", kind: "name" }]);
    // wrong letter: "flesi" vs "flexi"
    expect(matchesItem(["flesi"], flexi)).toBeGreaterThan(0);
    // missing letter: "flxi" vs "flexi"
    expect(matchesItem(["flxi"], flexi)).toBeGreaterThan(0);
    // extra letter: "paragg" vs "parag"
    const parag = item([{ value: "Parag Parikh", kind: "name" }]);
    expect(matchesItem(["paragg"], parag)).toBeGreaterThan(0);
    // swapped adjacent letters: "felxi" vs "flexi"
    expect(matchesItem(["felxi"], flexi)).toBeGreaterThan(0);
    // 2 edits on 5-letter word should fail
    expect(matchesItem(["fzzxi"], flexi)).toBe(0);
  });

  it("never forgives words of 3 letters or fewer", () => {
    const cap = item([{ value: "Cap Fund", kind: "name" }]);
    expect(matchesItem(["cxp"], cap)).toBe(0);
  });

  it("never forgives amount fields", () => {
    const amt = item([{ value: "10000", kind: "amount" }]);
    expect(matchesItem(["10001"], amt)).toBe(0);
    expect(matchesItem(["10000"], amt)).toBeGreaterThan(0);
  });

  it("forgives up to 2 edits for 8+ letter words", () => {
    const mgr = item([{ value: "Opportunities Fund", kind: "name" }]);
    // "opportunities" (13 letters), "oportunites" (2 missing letters -> 2 edits)
    expect(matchesItem(["oportunites"], mgr)).toBeGreaterThan(0);
    // 3 edits should fail
    expect(matchesItem(["oprtunites"], mgr)).toBe(0);
  });
});
