import { describe, expect, it } from "vitest";
import type { HouseholdMember } from "@/features/auth/types";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import { cleanName, firstName, relationshipText } from "./memberLabels";

const member = (patch: Partial<HouseholdMember>): HouseholdMember => ({ ...HOUSEHOLD_FIXTURE[1], ...patch });

describe("cleanName", () => {
  it.each([
    ["Siddharth Surve (Me)", "Siddharth Surve"],
    ["Siddharth Surve (me)", "Siddharth Surve"],
    ["  Aditi Surve  ", "Aditi Surve"],
    ["Aditi Surve", "Aditi Surve"],
    ["Meera (Me) Rao", "Meera (Me) Rao"],
    ["(Me)", ""],
    ["", ""],
    ["   ", ""],
  ])("%j gives %j (only a trailing '(Me)' goes; the ends are trimmed)", (name, expected) => {
    expect(cleanName(name)).toBe(expected);
  });

  it.each([[null], [undefined]])("%j gives an empty string", name => {
    expect(cleanName(name)).toBe("");
  });
});

describe("firstName", () => {
  it.each([
    ["Siddharth Surve (Me)", "Siddharth"],
    ["Aditi Surve", "Aditi"],
    ["Dev Kumar Rao", "Dev"],
    ["  Ramesh   Surve ", "Ramesh"],
    ["Aditi", "Aditi"],
    ["(Me)", ""],
    ["", ""],
  ])("%j gives %j", (name, expected) => {
    expect(firstName(name)).toBe(expected);
  });

  it.each([[null], [undefined]])("%j gives an empty string", name => {
    expect(firstName(name)).toBe("");
  });
});

describe("relationshipText", () => {
  it("is 'Me' for the self member, whatever else the record holds", () => {
    expect(relationshipText(HOUSEHOLD_FIXTURE[0])).toBe("Me");
    expect(relationshipText(member({ relationship: "self", relationship_other_label: "Boss" }))).toBe("Me");
  });

  it.each([
    ["spouse", "Spouse"],
    ["parent", "Parent"],
    ["child", "Child"],
    ["sibling", "Sibling"],
  ] as const)("%s reads %s", (relationship, expected) => {
    expect(relationshipText(member({ relationship }))).toBe(expected);
  });

  it("'other' shows the member's own label, trimmed, and falls back to 'Other'", () => {
    expect(relationshipText(member({ relationship: "other", relationship_other_label: "  Business partner " }))).toBe("Business partner");
    expect(relationshipText(member({ relationship: "other", relationship_other_label: "   " }))).toBe("Other");
    expect(relationshipText(member({ relationship: "other", relationship_other_label: null }))).toBe("Other");
  });

  it("is 'Not set' when no relationship was chosen yet", () => {
    expect(relationshipText(member({ relationship: null }))).toBe("Not set");
  });

  it("a stored label is ignored for a known relationship", () => {
    expect(relationshipText(member({ relationship: "parent", relationship_other_label: "Boss" }))).toBe("Parent");
  });
});
