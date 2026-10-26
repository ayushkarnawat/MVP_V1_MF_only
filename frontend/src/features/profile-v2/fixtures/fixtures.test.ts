import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import type { HouseholdMember, MeResponse } from "@/features/auth/types";
import { memberSince } from "../lib/memberSince";
import { ME_EMPTY_FIXTURE, ME_FIXTURE } from "./me";
import { HOUSEHOLD_FIXTURE, HOUSEHOLD_SOLO_FIXTURE } from "./members";

// Contract guard: the spec fixtures must parse against the TypeScript types the screens are built on.
// `Record<keyof T, true>` fails to compile when the type gains or loses a key, so this list cannot drift silently.
const ME_KEYS: Record<keyof MeResponse, true> = {
  user_id: true, phone_number: true, email: true, onboarding_step: true, onboarding_completed: true, investor_type: true,
  primary_goals: true, self_name: true, consent_outdated: true, pending_deletion: true, deletion_scheduled_at: true, created_at: true,
};
const MEMBER_KEYS: Record<keyof HouseholdMember, true> = {
  id: true, name: true, relationship: true, relationship_other_label: true, origin: true, pan_masked: true, phone_number: true, email: true,
  name_from_statement: true, pan_conflict: true, pan_editable: true, profile_completion: true, missing_fields: true, removed_with_last_import: true,
};
const OPTIONAL_ME = new Set(["pending_deletion", "deletion_scheduled_at"]);

describe("SPEC FIXTURE guard", () => {
  it("marks every fixture file as a spec fixture", () => {
    for (const file of ["me.ts", "members.ts"]) {
      expect(readFileSync(resolve("src/features/profile-v2/fixtures", file), "utf8")).toContain("SPEC FIXTURE");
    }
  });

  it.each([["full", ME_FIXTURE], ["empty", ME_EMPTY_FIXTURE]])("the %s account has every required /auth/me key, including created_at", (_label, me) => {
    for (const key of Object.keys(ME_KEYS)) if (!OPTIONAL_ME.has(key)) expect(me, key).toHaveProperty(key);
    expect(Object.keys(me).filter(key => !(key in ME_KEYS))).toEqual([]);
    expect(typeof me.created_at).toBe("string");
  });

  it("created_at is an ISO string that the Member-since helper reads", () => {
    expect(memberSince(ME_FIXTURE.created_at)).toBe("Oct 2025");
  });

  it.each([["household", HOUSEHOLD_FIXTURE], ["solo household", HOUSEHOLD_SOLO_FIXTURE]])("the %s members have exactly the HouseholdMember keys", (_label, members) => {
    for (const member of members) {
      expect(Object.keys(member).sort(), member.id).toEqual(Object.keys(MEMBER_KEYS).sort());
    }
  });

  it("has one self member, unique ids, and only masked PANs", () => {
    expect(HOUSEHOLD_FIXTURE.filter(member => member.relationship === "self")).toHaveLength(1);
    expect(new Set(HOUSEHOLD_FIXTURE.map(member => member.id)).size).toBe(HOUSEHOLD_FIXTURE.length);
    for (const member of HOUSEHOLD_FIXTURE) {
      if (member.pan_masked !== null) expect(member.pan_masked, member.id).toMatch(/^[A-Z]{2}\*{6}[0-9][A-Z]$/);
    }
    expect(JSON.stringify(HOUSEHOLD_FIXTURE)).not.toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/);
  });

  it("covers the states the pages must handle: a PAN conflict, no PAN, a statement name, a complete and an incomplete profile", () => {
    expect(HOUSEHOLD_FIXTURE.some(member => member.pan_conflict === "other_account")).toBe(true);
    expect(HOUSEHOLD_FIXTURE.some(member => member.pan_masked === null)).toBe(true);
    expect(HOUSEHOLD_FIXTURE.some(member => member.name_from_statement)).toBe(true);
    expect(HOUSEHOLD_FIXTURE.some(member => member.profile_completion === 100)).toBe(true);
    expect(HOUSEHOLD_FIXTURE.some(member => member.profile_completion < 100)).toBe(true);
    expect(HOUSEHOLD_SOLO_FIXTURE).toHaveLength(1);
  });
});
