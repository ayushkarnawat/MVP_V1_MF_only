import { Lock } from "lucide-react";
import { useState } from "react";
import { mergeMemberInto } from "../../auth/api";
import { RELATIONSHIP_OPTIONS } from "../../auth/relationships";
import type { HouseholdMember } from "../../auth/types";
import { PRIMARY_BTN, SECONDARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";
import { ConfirmLeaveDialog } from "./ConfirmLeaveDialog";
import { OtherAccountDialog } from "./OtherAccountDialog";
import { PossibleDuplicateDialog } from "./PossibleDuplicateDialog";
import { ProfileCompleteSuccess } from "./ProfileCompleteSuccess";
import {
  SAVE_FAILED_MESSAGE,
  initialProfileValues,
  saveProfile,
  validateProfile,
  type DuplicateInfo,
  type ProfileValues,
} from "./profileForm";

export interface CompleteProfileDialogProps {
  member: HouseholdMember;
  /** Self's phone and email live on the account, not the member row. */
  accountPhone?: string | null;
  accountEmail?: string | null;
  /** Fires after every successful Save, with the response. */
  onSaved: (member: HouseholdMember) => void;
  /** After a merge; `targetId` is the member merged into. */
  onMerged: (targetId: string) => void;
  /** The sequence ended: skip, warning OK, success Done, or Save below 100%. */
  onClose: () => void;
  /** Where "Change in Account Info" goes (Self only); without it the link isn't shown. */
  onChangeInAccountInfo?: () => void;
}

type Stage = "form" | "leave" | "duplicate" | "warn" | "success";

const FIELD =
  "flex h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)]";
const READONLY = "border-dashed text-[var(--color-text-secondary)]";
const LABEL = "block text-sm font-medium text-[var(--color-ink)]";
const CAPTION = "m-0 mt-1 text-xs text-[var(--color-text-secondary)]";

// One component owns the whole sequence so typed values survive Exit -> Keep editing
// and "Check the PAN".
export function CompleteProfileDialog({
  member, accountPhone, accountEmail, onSaved, onMerged, onClose, onChangeInAccountInfo,
}: CompleteProfileDialogProps) {
  const isSelf = member.relationship === "self";
  const [values, setValues] = useState<ProfileValues>(() => initialProfileValues(member));
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [saved, setSaved] = useState<HouseholdMember | null>(null);

  const set = (patch: Partial<ProfileValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    if (error) setError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const invalid = validateProfile(values, member);
    if (invalid) return setError(invalid);
    setSubmitting(true);
    setError(null);
    const out = await saveProfile(member, values);
    setSubmitting(false);
    if (out.kind === "error") return setError(out.message);
    if (out.kind === "duplicate") {
      setDuplicate(out.info);
      setMergeError(null);
      return setStage("duplicate");
    }
    setSaved(out.member);
    onSaved(out.member);
    if (out.member.pan_conflict) return setStage("warn"); // Q3: every such Save warns
    if (out.member.profile_completion >= 100) return setStage("success");
    onClose(); // below 100%: straight back to the dashboard
  }

  async function merge() {
    if (!duplicate) return;
    setMerging(true);
    setMergeError(null);
    try {
      await mergeMemberInto(member.id, duplicate.otherMemberId);
      onMerged(duplicate.otherMemberId);
    } catch {
      setMergeError(SAVE_FAILED_MESSAGE);
    } finally {
      setMerging(false);
    }
  }

  const filled = Math.floor(member.profile_completion / 20);
  const panEditable = member.pan_editable;
  const panRequired = panEditable && !member.pan_masked; // Q2: no PAN of any kind
  const phoneValue = isSelf ? (accountPhone ?? "") : values.phone;
  const emailValue = isSelf ? (accountEmail ?? "") : values.email;

  return (
    <>
      <PromptDialog
        isOpen={stage === "form"}
        title={`Complete ${member.name}’s profile`}
        onClose={() => setStage("leave")}
        footer={
          <>
            <button type="button" onClick={() => setStage("leave")} className={SECONDARY_BTN}>
              Exit
            </button>
            <button type="submit" form="complete-profile-form" disabled={submitting} className={PRIMARY_BTN}>
              Save
            </button>
          </>
        }
      >
        <div className="flex gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <i
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < filled ? "bg-[var(--color-warning,#d97706)]" : "bg-[var(--color-border)]"}`}
            />
          ))}
        </div>
        <form id="complete-profile-form" className="space-y-3" noValidate onSubmit={submit}>
          <div>
            <label htmlFor="cp-name" className={LABEL}>Name</label>
            <input id="cp-name" className={`${FIELD} mt-1`} value={values.name} autoComplete="off"
              onChange={(e) => set({ name: e.target.value })} />
            {member.name_from_statement && <p className={CAPTION}>From your CAS. You can correct it.</p>}
          </div>

          <div>
            <div className="flex items-center gap-1">
              <label htmlFor="cp-pan" className={LABEL}>PAN</label>
              {panRequired && <span aria-hidden="true" className="text-[var(--color-negative,#b91c1c)]">*</span>}
            </div>
            {panEditable ? (
              <input id="cp-pan" className={`${FIELD} mt-1 uppercase`} value={values.pan} autoComplete="off"
                aria-required={panRequired || undefined} maxLength={14} placeholder="ABCDE1234F" onChange={(e) => set({ pan: e.target.value })} />
            ) : (
              <div className="relative mt-1">
                <input id="cp-pan" readOnly value={member.pan_masked ?? ""} className={`${FIELD} pr-9 ${READONLY}`} />
                <Lock aria-hidden="true" className="absolute right-3 top-3 h-4 w-4 text-[var(--color-text-secondary)]" />
              </div>
            )}
            <p className={CAPTION}>
              {panEditable ? `Your CAS didn’t include ${member.name}’s PAN.` : "From your CAS. Can’t be changed."}
            </p>
          </div>

          {!isSelf && (
            <div>
              <label htmlFor="cp-rel" className={LABEL}>Relationship</label>
              <select id="cp-rel" className={`${FIELD} mt-1`} value={values.relationship}
                onChange={(e) => set({ relationship: e.target.value as ProfileValues["relationship"] })}>
                <option value="">Choose…</option>
                {RELATIONSHIP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
          {!isSelf && values.relationship === "other" && (
            <div>
              <label htmlFor="cp-label" className={LABEL}>How are you related?</label>
              <input id="cp-label" className={`${FIELD} mt-1`} value={values.label} autoComplete="off"
                onChange={(e) => set({ label: e.target.value })} />
            </div>
          )}

          <div>
            <label htmlFor="cp-phone" className={LABEL}>Phone number</label>
            <input id="cp-phone" type="tel" placeholder="+91" autoComplete="off" readOnly={isSelf}
              className={`${FIELD} mt-1 ${isSelf ? READONLY : ""}`} value={phoneValue}
              onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div>
            <label htmlFor="cp-email" className={LABEL}>Email address</label>
            <input id="cp-email" type="email" placeholder="name@example.com" autoComplete="off" readOnly={isSelf}
              className={`${FIELD} mt-1 ${isSelf ? READONLY : ""}`} value={emailValue}
              onChange={(e) => set({ email: e.target.value })} />
          </div>
          {/* Only where there is an Account Info to open (not on mobile). */}
          {isSelf && onChangeInAccountInfo && (
            <button type="button" onClick={onChangeInAccountInfo} className="text-xs text-[var(--color-accent)] underline">
              Change in Account Info
            </button>
          )}

          {error && (
            <p role="alert" className="text-sm text-[var(--color-negative,#b91c1c)]">{error}</p>
          )}
        </form>
      </PromptDialog>

      <ConfirmLeaveDialog
        isOpen={stage === "leave"}
        memberName={member.name}
        onKeepEditing={() => setStage("form")}
        onSkip={onClose}
      />
      {duplicate && (
        <PossibleDuplicateDialog
          isOpen={stage === "duplicate"}
          memberName={member.name}
          otherMemberName={duplicate.otherMemberName}
          fundCount={duplicate.sourceFundCount}
          sourcePanLabel={duplicate.sourcePanLabel}
          merging={merging}
          error={mergeError}
          onMerge={merge}
          onCheckPan={() => setStage("form")}
        />
      )}
      <OtherAccountDialog isOpen={stage === "warn"} memberName={saved?.name ?? member.name} onOk={onClose} />
      <ProfileCompleteSuccess isOpen={stage === "success"} memberName={saved?.name ?? member.name} onDone={onClose} />
    </>
  );
}
