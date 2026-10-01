import { ApiError } from "../../../lib/apiClient";
import { updateMemberProfile } from "../../auth/api";
import type { HouseholdMember, MemberProfileBody, Relationship } from "../../auth/types";

export const INVALID_PAN_MESSAGE = "Enter a valid PAN: 5 letters, 4 digits, then 1 letter.";
export const SAVE_FAILED_MESSAGE = "We couldn’t save these details. Try again.";
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
type FormRelationship = Exclude<Relationship, "self">;

export interface ProfileValues {
  name: string;
  relationship: FormRelationship | "";
  label: string;
  phone: string;
  email: string;
  pan: string;
}

export interface DuplicateInfo {
  otherMemberId: string;
  otherMemberName: string;
  sourceFundCount: number;
  /** Masked detected PAN or "PAN not on statement": tells same-named people apart. */
  sourcePanLabel: string;
}

export type SaveOutcome =
  | { kind: "ok"; member: HouseholdMember }
  | { kind: "error"; message: string }
  | { kind: "duplicate"; info: DuplicateInfo };

export const normalisePan = (raw: string) => raw.replace(/\s+/g, "").toUpperCase();

export function initialProfileValues(m: HouseholdMember): ProfileValues {
  const rel = m.relationship;
  return {
    name: m.name,
    relationship: rel && rel !== "self" ? rel : "",
    label: m.relationship_other_label ?? "",
    phone: m.phone_number ?? "",
    email: m.email ?? "",
    pan: "",
  };
}

/** Only PAN can be required (Q2), and only for a member with no PAN at all. */
export function validateProfile(v: ProfileValues, m: HouseholdMember): string | null {
  if (!v.name.trim()) return "Enter a name.";
  if (v.relationship === "other" && !v.label.trim()) return "Type how you’re related.";
  if (m.pan_editable) {
    const pan = normalisePan(v.pan);
    if (!pan && !m.pan_masked) return `Enter ${m.name}’s PAN to save.`;
    if (pan && !PAN_RE.test(pan)) return INVALID_PAN_MESSAGE;
  }
  return null;
}

/** Sends only what changed, so a Save writes only what the user entered. */
export function toProfileBody(v: ProfileValues, m: HouseholdMember): MemberProfileBody {
  const body: MemberProfileBody = {};
  const isSelf = m.relationship === "self";
  if (v.name.trim() !== m.name) body.name = v.name.trim();
  if (!isSelf) {
    const rel = v.relationship || null;
    const label = v.relationship === "other" ? v.label.trim() : null;
    if (rel !== (m.relationship ?? null) || label !== (m.relationship_other_label ?? null)) {
      body.relationship = rel;
      body.relationship_other_label = label;
    }
    if (v.phone.trim() !== (m.phone_number ?? "")) body.phone_number = v.phone.trim();
    if (v.email.trim() !== (m.email ?? "")) body.email = v.email.trim();
  }
  if (m.pan_editable && normalisePan(v.pan)) body.pan = normalisePan(v.pan);
  return body;
}

function payloadOf(err: unknown): { code?: string; message?: string; details?: Record<string, unknown> } | null {
  if (!(err instanceof ApiError)) return null;
  const p = err.payload;
  return p && typeof p === "object" ? (p as { code?: string; message?: string; details?: Record<string, unknown> }) : null;
}

export async function saveProfile(m: HouseholdMember, v: ProfileValues): Promise<SaveOutcome> {
  try {
    return { kind: "ok", member: await updateMemberProfile(m.id, toProfileBody(v, m)) };
  } catch (err) {
    const p = payloadOf(err);
    const d = p?.details ?? {};
    switch (p?.code) {
      case "invalid_pan_format":
        return { kind: "error", message: INVALID_PAN_MESSAGE };
      case "pan_required":
      case "invalid_name":
      case "invalid_relationship":
      case "field_not_editable":
        return { kind: "error", message: p.message ?? SAVE_FAILED_MESSAGE };
      case "pan_belongs_to_other_member":
        if (d.can_merge === true) {
          return {
            kind: "duplicate",
            info: {
              otherMemberId: String(d.other_member_id),
              otherMemberName: String(d.other_member_name),
              sourceFundCount: Number(d.source_fund_count ?? 0),
              sourcePanLabel: String(d.source_pan_label ?? "PAN not on statement"),
            },
          };
        }
        return { kind: "error", message: `This PAN is already on ${String(d.other_member_name ?? "another member")}.` };
      case "cross_account_pan_blocked":
        return { kind: "error", message: "This PAN is already tracked under a different Unifolio account." };
      default:
        return { kind: "error", message: SAVE_FAILED_MESSAGE };
    }
  }
}
