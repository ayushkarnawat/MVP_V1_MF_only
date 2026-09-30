import { useState } from "react";
import { ApiError } from "../../../lib/apiClient";
import { completeMemberDetails } from "../../auth/api";
import { RELATIONSHIP_OPTIONS } from "../../auth/relationships";
import type { HouseholdMember, Relationship } from "../../auth/types";
import { validatePersonName } from "../../auth/validation";
import { PRIMARY_BTN, SECONDARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";

// Copy is verbatim from cas-member-detection-map.html L1-L9 (curly ’ per F17).
export const INVALID_PAN_MESSAGE = "Enter a valid PAN: 5 letters, 4 digits, then 1 letter.";
export const SAVE_FAILED_MESSAGE = "We couldn’t save these details. Try again.";
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

type FormRelationship = Exclude<Relationship, "self">;

export interface DetailsValues {
  name: string;
  relationship: FormRelationship | "";
  label: string;
  pan: string;
}

export interface DuplicateInfo {
  otherMemberId: string;
  otherMemberName: string;
  sourceFundCount: number;
}

export type SubmitOutcome =
  | { kind: "ok"; member: HouseholdMember }
  | { kind: "error"; message: string }
  | { kind: "duplicate"; info: DuplicateInfo }
  | { kind: "otherAccount" };

export function initialValues(member: HouseholdMember): DetailsValues {
  const rel = member.relationship;
  return {
    name: member.name,
    relationship: rel && rel !== "self" ? rel : "",
    label: member.relationship_other_label ?? "",
    pan: "",
  };
}

/** L1 / L2 and the name rule, before anything is sent. Returns null when fine. */
export function validateValues(values: DetailsValues, memberName: string): string | null {
  const nameError = validatePersonName(values.name);
  if (nameError) return nameError;
  if (!values.relationship) return "Choose a relationship.";
  if (values.relationship === "other" && !values.label.trim()) return "Type how you’re related.";
  const pan = normalisePan(values.pan);
  if (!pan) return `Enter ${memberName}’s PAN.`;
  if (!PAN_RE.test(pan)) return INVALID_PAN_MESSAGE;
  return null;
}

function normalisePan(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function payloadOf(err: unknown): { code?: string; message?: string; details?: Record<string, unknown> } | null {
  if (!(err instanceof ApiError)) return null;
  const p = err.payload;
  return p && typeof p === "object" ? (p as { code?: string; message?: string; details?: Record<string, unknown> }) : null;
}

/** POSTs the details and maps every backend answer to one of the L1-L9 outcomes. */
export async function submitDetails(
  member: HouseholdMember,
  values: DetailsValues,
  mode: "unlock" | "edit",
): Promise<SubmitOutcome> {
  try {
    const saved = await completeMemberDetails(member.id, {
      name: values.name.replace(/\s+/g, " ").trim(),
      relationship: values.relationship as FormRelationship,
      relationship_other_label: values.relationship === "other" ? values.label.trim() : null,
      pan: normalisePan(values.pan),
    });
    return { kind: "ok", member: saved };
  } catch (err) {
    const p = payloadOf(err);
    const d = p?.details ?? {};
    switch (p?.code) {
      case "invalid_pan_format":
        return { kind: "error", message: INVALID_PAN_MESSAGE };
      case "invalid_name":
      case "invalid_relationship":
        return { kind: "error", message: p.message ?? SAVE_FAILED_MESSAGE };
      case "detected_pan_mismatch":
        return {
          kind: "error",
          message: `This PAN doesn’t match your statement. Your statement shows ${member.name}’s PAN as ${String(d.detected_pan_masked ?? "")}. Check the PAN and try again.`,
        };
      case "pan_belongs_to_other_member":
        if (d.can_merge === true && mode === "unlock") {
          return {
            kind: "duplicate",
            info: {
              otherMemberId: String(d.other_member_id),
              otherMemberName: String(d.other_member_name),
              sourceFundCount: Number(d.source_fund_count ?? 0),
            },
          };
        }
        return { kind: "error", message: `This PAN is already on ${String(d.other_member_name ?? "another member")}.` };
      case "cross_account_pan_blocked":
        if (mode === "edit") {
          return {
            kind: "error",
            message: `This PAN is already on another Unifolio account. ${member.name}’s PAN hasn’t changed.`,
          };
        }
        return { kind: "otherAccount" };
      default:
        return { kind: "error", message: SAVE_FAILED_MESSAGE };
    }
  }
}

const FIELD = "flex h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)]";

interface FormDialogProps {
  isOpen: boolean;
  title: string;
  body?: string;
  values: DetailsValues;
  onChange: (next: DetailsValues) => void;
  error: string | null;
  submitting: boolean;
  panPlaceholder?: string;
  onContinue: () => void;
  onCancel: () => void;
  submitLabel?: string;
}

/** The shared form for the unlock popup and the L9 edit popup. */
export function DetailsFormDialog(props: FormDialogProps) {
  const { values, onChange } = props;
  const set = (patch: Partial<DetailsValues>) => onChange({ ...values, ...patch });
  return (
    <PromptDialog
      isOpen={props.isOpen}
      title={props.title}
      body={props.body}
      onClose={props.onCancel}
      footer={
        <>
          <button type="button" onClick={props.onCancel} className={SECONDARY_BTN}>
            Cancel
          </button>
          <button type="submit" form="member-details-form" disabled={props.submitting} className={PRIMARY_BTN}>
            {props.submitLabel ?? "Continue"}
          </button>
        </>
      }
    >
      <form
        id="member-details-form"
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!props.submitting) props.onContinue();
        }}
      >
        <label className="block text-sm font-medium text-[var(--color-ink)]">
          Name
          <input
            className={`${FIELD} mt-1`}
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            autoComplete="off"
          />
        </label>
        <label className="block text-sm font-medium text-[var(--color-ink)]">
          Relationship
          <select
            className={`${FIELD} mt-1`}
            value={values.relationship}
            onChange={(e) => set({ relationship: e.target.value as FormRelationship | "" })}
          >
            <option value="">Select</option>
            {RELATIONSHIP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {values.relationship === "other" && (
          <label className="block text-sm font-medium text-[var(--color-ink)]">
            How are you related?
            <input
              className={`${FIELD} mt-1`}
              value={values.label}
              onChange={(e) => set({ label: e.target.value })}
              autoComplete="off"
            />
          </label>
        )}
        <label className="block text-sm font-medium text-[var(--color-ink)]">
          PAN
          <input
            className={`${FIELD} mt-1 uppercase`}
            value={values.pan}
            onChange={(e) => set({ pan: e.target.value })}
            placeholder={props.panPlaceholder}
            autoComplete="off"
            maxLength={14}
          />
        </label>
        {props.error && (
          <p role="alert" className="text-sm text-[var(--color-negative,#b91c1c)]">
            {props.error}
          </p>
        )}
      </form>
    </PromptDialog>
  );
}

/** State + submit wiring shared by both dialogs. */
export function useDetailsForm(member: HouseholdMember, mode: "unlock" | "edit") {
  const [values, setValues] = useState<DetailsValues>(() => initialValues(member));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onChange = (next: DetailsValues) => {
    setValues(next);
    if (error) setError(null); // L1: the error clears as they type
  };

  const submit = async (): Promise<SubmitOutcome | null> => {
    const invalid = validateValues(values, member.name);
    if (invalid) {
      setError(invalid);
      return null;
    }
    setSubmitting(true);
    setError(null);
    const outcome = await submitDetails(member, values, mode);
    setSubmitting(false);
    if (outcome.kind === "error") setError(outcome.message);
    return outcome;
  };

  return { values, onChange, error, setError, submitting, submit };
}
