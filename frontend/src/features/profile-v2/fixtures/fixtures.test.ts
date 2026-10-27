import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import type { HouseholdMember, MeResponse } from "@/features/auth/types";
import type { MyConsent } from "@/features/legal/api";
import { memberSince } from "../lib/memberSince";
import { ME_EMPTY_FIXTURE, ME_FIXTURE } from "./me";
import { CONSENTS_FIXTURE } from "./consents";
import { HISTORY_FIXTURE, HISTORY_STATEMENT_COUNTS, type ImportHistoryRow } from "./importHistory";
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

// PR-C fixtures: the statement rows behind "Delete all funds" and the consent list on Data & Privacy.
const HISTORY_KEYS: Record<keyof ImportHistoryRow, true> = {
  import_id: true, household_member_id: true, uploaded_at: true, statement_from_date: true, statement_to_date: true, status: true,
  new_transactions_count: true, upload_group_id: true, member_name: true, group_people_count: true,
};
const CONSENT_KEYS: Record<keyof MyConsent, true> = { document_type: true, document_version: true, recorded_at: true };

describe("SPEC FIXTURE guard (statement history and consents)", () => {
  it("marks the two PR-C fixture files as spec fixtures", () => {
    for (const file of ["importHistory.ts", "consents.ts"]) {
      expect(readFileSync(resolve("src/features/profile-v2/fixtures", file), "utf8")).toContain("SPEC FIXTURE");
    }
  });

  it("the history rows have exactly the keys of the history call, unique import ids, and only household member ids", () => {
    for (const row of HISTORY_FIXTURE) expect(Object.keys(row).sort(), row.import_id).toEqual(Object.keys(HISTORY_KEYS).sort());
    expect(new Set(HISTORY_FIXTURE.map(row => row.import_id)).size).toBe(HISTORY_FIXTURE.length);
    const ids = new Set(HOUSEHOLD_FIXTURE.map(member => member.id));
    for (const row of HISTORY_FIXTURE) expect(ids.has(row.household_member_id), row.import_id).toBe(true);
  });

  it("the hand-worked statement counts cover every household member, and a member with no rows has 0", () => {
    expect(Object.keys(HISTORY_STATEMENT_COUNTS).sort()).toEqual(HOUSEHOLD_FIXTURE.map(member => member.id).sort());
    expect(HISTORY_STATEMENT_COUNTS["m-father"]).toBe(0);
    expect(HISTORY_FIXTURE.some(row => row.household_member_id === "m-father")).toBe(false);
  });

  it("the history covers a shared upload group, a row without a group, and a member in two statements", () => {
    expect(HISTORY_FIXTURE.filter(row => row.upload_group_id === "g1" && row.household_member_id === "m-self").length).toBeGreaterThan(1);
    expect(HISTORY_FIXTURE.some(row => row.upload_group_id === null)).toBe(true);
    expect(new Set(HISTORY_FIXTURE.filter(row => row.household_member_id === "m-spouse").map(row => row.upload_group_id)).size).toBe(2);
  });

  it("the consents have exactly the keys of the consents call, one per document type, and parseable dates", () => {
    for (const consent of CONSENTS_FIXTURE) {
      expect(Object.keys(consent).sort(), consent.document_type).toEqual(Object.keys(CONSENT_KEYS).sort());
      expect(Number.isNaN(new Date(consent.recorded_at).getTime()), consent.document_type).toBe(false);
    }
    expect(CONSENTS_FIXTURE.map(consent => consent.document_type)).toEqual(["terms_of_service", "privacy_policy", "pan_disclaimer"]);
  });
});
