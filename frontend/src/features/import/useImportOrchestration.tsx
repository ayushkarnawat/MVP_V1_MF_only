import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PeopleFoundDialog, NO_EDITS, type PeopleEdits } from "./PeopleFoundDialog";
import { PromptHost, type HostAction } from "./prompts/PromptHost";
import { ConfirmFailedDialog } from "./prompts/ConfirmFailedDialog";
import { CancelImportDialog } from "./prompts/CancelImportDialog";
import { useImportFlow } from "./useImportFlow";
import { clearCasResumeStep2 } from "./casResumeState";
import { buildConfirmBody } from "./confirmBody";
import { UnidentifiedFundsDialog } from "./UnidentifiedFundsDialog";
import type { ImportPreviewResponse, PersonConfirmation, PersonPreview, SchemeConfirmation } from "./types";

/** Everyone in the file except a person on another account the user left out (U8). */
export function includedPeople(people: PersonPreview[], edits: PeopleEdits): PersonPreview[] {
  return people.filter(
    (p) =>
      p.status !== "other_account" ||
      // A file that is wholly another account's (U7 "Include") has nobody to ask about.
      people.length === 1 ||
      edits.includes[p.person_key] === true,
  );
}

function otherAccountIncludes(people: PersonPreview[]): Record<string, boolean> {
  return Object.fromEntries(people.filter((p) => p.status === "other_account").map((p) => [p.person_key, true]));
}

/**
 * The orchestration the web and mobile import views share: the flow state machine,
 * the popup edits, cancel/confirm handling and the dialogs. Each view keeps only
 * its own layout.
 */
export function useImportOrchestration(
  householdMemberId: string,
  onDone?: (notice: { text: string; details?: string[] }) => void,
) {
  const flow = useImportFlow(householdMemberId);
  const { stage, preview, prompt, error } = flow;
  // U4 "The one I entered": what the upload form asks the user to upload next.
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [edits, setEdits] = useState<PeopleEdits>(NO_EDITS);
  const [nameAnswers, setNameAnswers] = useState<Record<string, boolean>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  // U7 "Include in family total" was chosen: the people popup starts with every
  // other-account person included instead of asking again (U8).
  const [u7Included, setU7Included] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const lastConfirm = useRef<{ people: PersonConfirmation[]; moved: Record<string, string> } | null>(null);

  const autoAttempt = useRef<ImportPreviewResponse | null>(null);
  const completionSent = useRef(false);

  useEffect(() => {
    const result = flow.confirmResult;
    const duplicate = flow.errorCode === "already_imported";
    if ((!result && !duplicate) || completionSent.current) return;
    completionSent.current = true;
    clearCasResumeStep2(householdMemberId);
    if (duplicate) {
      onDone?.({ text: "This statement was already imported" });
      return;
    }
    if (!result) return;
    const details = [
      ...(result.people.length > 1 ? result.people.map(p =>
        `${p.name}: ${p.added} added${p.skipped > 0 ? `, ${p.skipped} already saved` : ""}`) : []),
      ...result.warnings,
    ];
    onDone?.({
      text: `${result.added} transaction${result.added === 1 ? "" : "s"} added${result.skipped > 0 ? ` · ${result.skipped} already saved` : ""}`,
      ...(details.length ? { details } : {}),
    });
  }, [flow.confirmResult, flow.errorCode, householdMemberId, onDone]);

  useEffect(() => {
    if (stage === "upload" && flow.errorCode === "session_expired") setUploadMessage(error);
  }, [stage, flow.errorCode, error]);

  const cancelImport = async () => {
    clearCasResumeStep2(householdMemberId);
    setCancelOpen(false);
    setEdits(NO_EDITS);
    setNameAnswers({});
    setU7Included(false);
    setConfirming(false);
    lastConfirm.current = null;
    autoAttempt.current = null;
    completionSent.current = false;
    await flow.cancel();
  };

  const upload = async (file: File, password: string) => {
    clearCasResumeStep2(householdMemberId);
    setUploadMessage(null);
    setEdits(NO_EDITS);
    setNameAnswers({});
    setU7Included(false);
    lastConfirm.current = null;
    autoAttempt.current = null;
    completionSent.current = false;
    await flow.upload(file, password);
  };

  // Maps PromptHost's HostAction onto the flow: discard and reupload leave the review
  // (dropping the server session), noticesDone moves on, the rest is a PromptAction.
  const handleHostAction = (action: HostAction) => {
    switch (action.kind) {
      case "discard":
        void cancelImport().then(() => action.uploadMessage && setUploadMessage(action.uploadMessage));
        return;
      case "reupload":
        void cancelImport();
        return;
      case "noticesDone":
        setNameAnswers(action.nameAnswers);
        flow.dismissNotice();
        return;
      default:
        if (action.kind === "acknowledge" && action.code === "cross_account_pan_blocked") setU7Included(true);
        void flow.resolve(action);
    }
  };

  const runConfirm = useCallback(async (people: PersonConfirmation[], moved: Record<string, string>) => {
    lastConfirm.current = { people, moved };
    setConfirming(true);
    try {
      await flow.confirm(people, moved);
    } finally {
      setConfirming(false);
    }
  }, [flow.confirm]);

  const confirmChoices = (schemeConfirmations: SchemeConfirmation[] = []) => {
    if (!preview) return;
    autoAttempt.current = preview;
    const body = buildConfirmBody(preview, includedPeople(preview.people, edits), {
      names: edits.names, owners: edits.owners, nameAnswers, schemeConfirmations,
    });
    void runConfirm(body.people, body.movedFunds);
  };

  // One automatic attempt for each ready preview. A failed attempt is retried
  // explicitly using lastConfirm; a resolved 409 produces a new preview.
  useEffect(() => {
    if (stage !== "confirming" || !preview || error || flow.confirmResult ||
        flow.errorCode === "already_imported" || autoAttempt.current === preview) return;
    autoAttempt.current = preview;
    const body = buildConfirmBody(preview, includedPeople(preview.people, edits), {
      names: edits.names, owners: edits.owners, nameAnswers,
    });
    void runConfirm(body.people, body.movedFunds);
  }, [stage, preview, error, flow.confirmResult, flow.errorCode, edits, nameAnswers, runConfirm]);

  const unassigned = useMemo(
    () => (preview ? preview.schemes.filter((s) => preview.unassigned_temp_ids.includes(s.temp_id)) : []),
    [preview],
  );
  const reviewPeople = useMemo(() => (preview ? includedPeople(preview.people, edits) : []), [preview, edits]);
  const inPrompt = stage === "prompt" || stage === "notices";

  const dialogs = (
    <>
      {inPrompt && (
        <PromptHost
          // One host per review session: its notice queue is internal state, so a
          // discard + re-upload (new session id) must start it afresh.
          key={`${preview?.session_id ?? prompt?.sessionId ?? "none"}:${stage}`}
          prompt={stage === "prompt" ? prompt : null}
          notices={stage === "notices" ? preview?.name_notices : undefined}
          samePersonPrompts={stage === "notices" ? preview?.same_person_prompts : undefined}
          people={preview?.people}
          error={error}
          onResolve={handleHostAction}
        />
      )}
      {stage === "people" && preview && (
        <PeopleFoundDialog
          people={preview.people}
          unassigned={unassigned}
          initialIncludes={u7Included ? otherAccountIncludes(preview.people) : undefined}
          onContinue={(next) => {
            setEdits(next);
            flow.dismissNotice();
          }}
          onCancel={() => setCancelOpen(true)}
        />
      )}
      {stage === "fallback" && preview && (
        <UnidentifiedFundsDialog
          key={preview.session_id}
          schemes={preview.schemes}
          onContinue={confirmChoices}
          onCancel={() => setCancelOpen(true)}
        />
      )}
      <ConfirmFailedDialog
        isOpen={stage === "confirming" && error !== null && flow.errorCode !== "already_imported" && !cancelOpen}
        onTryAgain={() => lastConfirm.current && void runConfirm(lastConfirm.current.people, lastConfirm.current.moved)}
        onCancelImport={() => setCancelOpen(true)}
        rejectedMessage={flow.confirmRejected ? error : null}
        onUploadAgain={() => void cancelImport()}
      />
      <CancelImportDialog
        isOpen={cancelOpen}
        peopleCount={preview?.people.length ?? 1}
        onKeepReviewing={() => setCancelOpen(false)}
        onCancelImport={() => void cancelImport()}
      />
    </>
  );

  return {
    flow, uploadMessage, edits, nameAnswers, confirming, reviewPeople, unassigned,
    setCancelOpen, cancelImport, upload, runConfirm, dialogs,
  };
}
