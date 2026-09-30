import { useEffect, useRef, useState, type ReactNode } from "react";
import { CrossAccountBlockedDialog } from "../CrossAccountBlockedDialog";
import { PanConflictDialog } from "../PanConflictDialog";
import type { ImportPrompt, NameNotice, PersonPreview, SamePersonPrompt } from "../types";
import type { PromptAction } from "../useImportFlow";
import { AddDetailsFirstDialog } from "./AddDetailsFirstDialog";
import { MemberNotInFileDialog } from "./MemberNotInFileDialog";
import { NameMismatchDialog } from "./NameMismatchDialog";
import { NameVariantNotice } from "./NameVariantNotice";
import { PanMismatchDialog } from "./PanMismatchDialog";
import { PanOnOtherAccountDialog } from "./PanOnOtherAccountDialog";
import { SamePersonDialog } from "./SamePersonDialog";
import { SessionExpiredDialog } from "./SessionExpiredDialog";
import { WhichIsYouDialog, type WhichIsYouCandidate } from "./WhichIsYouDialog";
import { uploadStatementShowingMessage } from "./copy";

/**
 * What the host reports. Everything from useImportFlow's PromptAction passes
 * through unchanged (feed it to resolve()); the extra kinds are for the parent:
 * - discard.uploadMessage: U4 "The one I entered" — show it on the upload form.
 * - reupload: C2 "Upload again", or U6 after details were added and the session was already gone.
 * - addDetails: U6 "Add details now" when no renderMemberDetails was supplied.
 * - noticeAnswers: every name notice is answered (true = update the name); dismiss the notices stage.
 */
export type HostAction =
  | Exclude<PromptAction, { kind: "discard" }>
  | { kind: "discard"; uploadMessage?: string }
  | { kind: "reupload" }
  | { kind: "addDetails"; memberId: string }
  | { kind: "noticesDone"; nameAnswers: Record<string, boolean> };

export interface PromptHostProps {
  prompt: ImportPrompt | null;
  /** Name notices (U1 / M8) from the preview, shown in order. */
  notices?: NameNotice[];
  /** U13 prompts from the preview, shown after the name notices. */
  samePersonPrompts?: SamePersonPrompt[];
  /** Used to show U13's statement name. */
  people?: PersonPreview[];
  /** Inline error for U2 (e.g. “This name doesn’t match the statement”). */
  error?: string | null;
  /** U6: renders Task 18's unlock popup; call onDone once the member is unlocked. */
  renderMemberDetails?: (memberId: string, onDone: () => void) => ReactNode;
  onResolve: (action: HostAction) => void;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function PromptHost({
  prompt,
  notices = [],
  samePersonPrompts = [],
  people = [],
  error = null,
  renderMemberDetails,
  onResolve,
}: PromptHostProps) {
  const [noticeIdx, setNoticeIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const doneFired = useRef(false);

  const activeNotice = notices[noticeIdx];
  const activeSame = activeNotice ? undefined : samePersonPrompts[0];
  const hadQueue = useRef(false);

  // Once the last notice and the last same-person prompt are answered, tell the parent.
  useEffect(() => {
    if (prompt) return;
    if (activeNotice || activeSame) {
      hadQueue.current = true;
      return;
    }
    if (!hadQueue.current || doneFired.current) return;
    doneFired.current = true;
    onResolve({ kind: "noticesDone", nameAnswers: answers });
  });

  const discard = (uploadMessage?: string) => onResolve({ kind: "discard", uploadMessage });

  if (!prompt) {
    if (activeNotice) {
      const answer = (accept: boolean) => {
        setAnswers((a) => ({ ...a, [activeNotice.person_key]: accept }));
        setNoticeIdx((i) => i + 1);
      };
      return (
        <NameVariantNotice
          isOpen
          kind={activeNotice.kind}
          firstUpload={activeNotice.first_upload}
          currentName={activeNotice.current_name}
          statementName={activeNotice.statement_name}
          onAccept={() => answer(true)}
          onKeep={() => answer(false)}
          onCancel={() => discard()}
        />
      );
    }
    if (activeSame) {
      const statementName = people.find((p) => p.person_key === activeSame.person_key)?.name;
      return (
        <SamePersonDialog
          isOpen
          memberName={activeSame.member_name}
          enteredPanMasked={activeSame.entered_pan_masked}
          statementPanMasked={activeSame.statement_pan_masked}
          statementName={statementName}
          kind={activeSame.kind}
          memberFundCount={activeSame.member_fund_count}
          onYes={() =>
            onResolve({ kind: "samePerson", personKey: activeSame.person_key, memberId: activeSame.member_id, same: true })
          }
          onNo={() =>
            onResolve({ kind: "samePerson", personKey: activeSame.person_key, memberId: activeSame.member_id, same: false })
          }
        />
      );
    }
    return null;
  }

  const d = prompt.details;
  switch (prompt.code) {
    case "self_name_mismatch":
      return (
        <NameMismatchDialog
          isOpen
          enteredName={str(d.entered_name)}
          statementName={str(d.statement_name)}
          error={error}
          onUseName={(name) => onResolve({ kind: "name", name })}
          onUploadDifferent={() => discard()}
        />
      );
    case "which_is_self":
      return (
        <WhichIsYouDialog
          isOpen
          candidates={(Array.isArray(d.candidates) ? d.candidates : []) as WhichIsYouCandidate[]}
          onContinue={(personKey) => onResolve({ kind: "self", personKey })}
          onNoneOfThese={() => onResolve({ kind: "self", personKey: null })}
        />
      );
    case "member_pan_mismatch": {
      const name = str(d.member_name);
      const entered = str(d.entered_pan_masked);
      return (
        <PanMismatchDialog
          isOpen
          memberName={name}
          enteredPanMasked={entered}
          statementPanMasked={strOrNull(d.statement_pan_masked)}
          onKeepEntered={() => discard(uploadStatementShowingMessage(entered, name))}
          onUseStatement={() => onResolve({ kind: "pan" })}
        />
      );
    }
    case "statement_pan_on_other_account":
      return (
        <PanOnOtherAccountDialog
          isOpen
          memberName={str(d.member_name)}
          enteredPanMasked={str(d.entered_pan_masked)}
          statementPanMasked={strOrNull(d.statement_pan_masked)}
          onKeepEntered={() => discard()}
          onUploadDifferent={() => discard()}
        />
      );
    case "member_not_in_file":
      return (
        <MemberNotInFileDialog
          isOpen
          memberName={str(d.member_name)}
          memberPanMasked={strOrNull(d.member_pan_masked)}
          people={Array.isArray(d.people) ? (d.people as string[]) : []}
          onImportForThese={() => onResolve({ kind: "acknowledge", code: "member_not_in_file" })}
          onUploadDifferent={() => discard()}
        />
      );
    case "locked_member_only":
    case "member_details_required": {
      const memberId = str(d.member_id);
      // locked_member_only keeps the session, so acknowledging continues to the
      // people popup; member_details_required ended it, so the user re-uploads.
      const afterUnlock = () => {
        setDetailsFor(null);
        if (prompt.code === "locked_member_only") onResolve({ kind: "acknowledge", code: "locked_member_only" });
        else onResolve({ kind: "reupload" });
      };
      return (
        <>
          <AddDetailsFirstDialog
            isOpen={detailsFor === null}
            memberName={str(d.member_name)}
            onAddDetails={() => {
              if (renderMemberDetails) setDetailsFor(memberId);
              else onResolve({ kind: "addDetails", memberId });
            }}
            onUploadDifferent={() => discard()}
          />
          {detailsFor !== null && renderMemberDetails?.(detailsFor, afterUnlock)}
        </>
      );
    }
    case "cross_account_pan_blocked":
      return (
        <CrossAccountBlockedDialog
          isOpen
          message={prompt.message}
          people={Array.isArray(d.people) ? (d.people as string[]) : []}
          // Session-less 409 (F30 hard block: session already dropped) has nothing to acknowledge.
          onInclude={prompt.sessionId ? () => onResolve({ kind: "acknowledge", code: "cross_account_pan_blocked" }) : undefined}
          onBack={() => discard()}
        />
      );
    case "session_expired":
      return <SessionExpiredDialog isOpen onUploadAgain={() => onResolve({ kind: "reupload" })} />;
    case "pan_belongs_to_other_member":
    case "pan_mismatch_for_member":
      // Legacy PanConflictError codes; the session is dropped, so both buttons leave.
      return (
        <PanConflictDialog
          isOpen
          message={prompt.message}
          secondaryLabel="Cancel"
          onChangeFile={() => discard()}
          onSecondary={() => discard()}
        />
      );
    default:
      return null;
  }
}
