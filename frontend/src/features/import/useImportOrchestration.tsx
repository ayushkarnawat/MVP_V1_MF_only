import { useEffect, useMemo, useRef, useState } from "react";
import { PeopleFoundDialog, NO_EDITS, type PeopleEdits } from "./PeopleFoundDialog";
import { PromptHost, type HostAction } from "./prompts/PromptHost";
import { ConfirmFailedDialog } from "./prompts/ConfirmFailedDialog";
import { CancelImportDialog } from "./prompts/CancelImportDialog";
import { useImportFlow } from "./useImportFlow";
import { clearCasResumeStep2 } from "./casResumeState";
import type { PersonConfirmation, PersonPreview } from "./types";

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
 * the review edits, cancel/confirm handling and the dialogs. Each view keeps only
 * its own layout.
 */
export function useImportOrchestration(householdMemberId: string) {
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

  useEffect(() => {
    if (stage === "confirmed") clearCasResumeStep2(householdMemberId);
  }, [stage, householdMemberId]);

  const cancelImport = async () => {
    clearCasResumeStep2(householdMemberId);
    setCancelOpen(false);
    setEdits(NO_EDITS);
    setNameAnswers({});
    setU7Included(false);
    setConfirming(false);
    await flow.cancel();
  };

  const upload = async (file: File, password: string) => {
    clearCasResumeStep2(householdMemberId);
    setUploadMessage(null);
    setEdits(NO_EDITS);
    setNameAnswers({});
    setU7Included(false);
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

  const runConfirm = async (people: PersonConfirmation[], moved: Record<string, string>) => {
    lastConfirm.current = { people, moved };
    setConfirming(true);
    try {
      await flow.confirm(people, moved);
    } finally {
      setConfirming(false);
    }
  };

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
      <ConfirmFailedDialog
        isOpen={stage === "review" && error !== null && !cancelOpen}
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
