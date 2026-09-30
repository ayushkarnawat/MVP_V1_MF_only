import { useCallback, useRef, useState } from "react";
import {
  ApiError,
  acknowledgePrompt,
  confirmPeopleImport,
  discardImportSession,
  parseImport,
  resolveName,
  resolvePan,
  resolveSamePerson,
  resolveSelf,
} from "./api";
import { getImportPrompt } from "./importPrompt";
import type {
  AcknowledgeCode,
  ImportConfirmResponse,
  ImportPreviewResponse,
  ImportPrompt,
  ParseErrorPayload,
  PersonConfirmation,
} from "./types";

export type ImportFlowStage =
  | "upload"
  | "parsing"
  | "prompt"
  | "notices"
  | "people"
  | "review"
  | "confirmed"
  | "error";

export type PromptAction =
  | { kind: "name"; name: string }
  | { kind: "self"; personKey: string | null }
  | { kind: "pan" }
  | { kind: "samePerson"; personKey: string; memberId: string; same: boolean }
  | { kind: "acknowledge"; code: AcknowledgeCode }
  | { kind: "discard" };

const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const payload = err.payload as ParseErrorPayload | string | null;
    if (typeof payload === "string") return payload;
    if (payload && typeof payload.message === "string") return payload.message;
  }
  return NETWORK_ERROR;
}

/** Stage after a preview lands: notices first, then the people popup unless
 * skipped (I1: one person, named, nothing unassigned), then review. */
function stageAfterNotices(preview: ImportPreviewResponse): ImportFlowStage {
  const single = preview.people.length <= 1;
  const needsName = preview.people.some((p) => p.needs_name);
  return single && !needsName && preview.unassigned_temp_ids.length === 0 ? "review" : "people";
}

function stageForPreview(preview: ImportPreviewResponse): ImportFlowStage {
  if (preview.name_notices.length > 0 || preview.same_person_prompts.length > 0) return "notices";
  return stageAfterNotices(preview);
}

/**
 * The upload -> prompts -> notices -> people -> review -> confirmed state
 * machine shared by the web and mobile import views. UI tasks render each
 * stage; this hook owns the network calls and the ordering.
 */
export function useImportFlow(householdMemberId: string) {
  const [stage, setStage] = useState<ImportFlowStage>("upload");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [prompt, setPrompt] = useState<ImportPrompt | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The live session id, kept in a ref so resolve()/cancel() see the value a
  // just-finished upload set without waiting for a re-render.
  const sessionRef = useRef<string | null>(null);
  // Double-press guards: confirmingRef drops re-entrant confirm calls;
  // confirmedRef stops a late 410 from the duplicate call overwriting "confirmed".
  const confirmingRef = useRef(false);
  const [confirmRejected, setConfirmRejected] = useState(false);
  const confirmedRef = useRef(false);

  const showPreview = useCallback((next: ImportPreviewResponse) => {
    sessionRef.current = next.session_id;
    setPreview(next);
    setPrompt(null);
    setError(null);
    setStage(stageForPreview(next));
  }, []);

  // Any call can answer with the next 409 prompt or a 410 session_expired.
  const handleFailure = useCallback((err: unknown) => {
    if (confirmedRef.current) return;
    const next = getImportPrompt(err);
    if (next) {
      if (next.sessionId) sessionRef.current = next.sessionId;
      setPrompt(next);
      setError(null);
      setStage("prompt");
      return;
    }
    setError(errorMessage(err));
    setStage("error");
  }, []);

  const reset = useCallback(() => {
    sessionRef.current = null;
    confirmedRef.current = false;
    setPreview(null);
    setPrompt(null);
    setConfirmResult(null);
    setError(null);
    setConfirmRejected(false);
    setStage("upload");
  }, []);

  const upload = useCallback(
    async (file: File, password: string) => {
      setStage("parsing");
      setError(null);
      try {
        showPreview(await parseImport(file, password, householdMemberId));
      } catch (err) {
        handleFailure(err);
      }
    },
    [householdMemberId, showPreview, handleFailure],
  );

  const cancel = useCallback(async () => {
    const sessionId = sessionRef.current;
    if (sessionId) await discardImportSession(sessionId);
    reset();
  }, [reset]);

  const resolve = useCallback(
    async (action: PromptAction) => {
      if (action.kind === "discard") {
        await cancel();
        return;
      }
      const sessionId = sessionRef.current;
      if (!sessionId) return;
      setError(null);
      try {
        let next: ImportPreviewResponse;
        switch (action.kind) {
          case "name":
            next = await resolveName(sessionId, action.name);
            break;
          case "self":
            next = await resolveSelf(sessionId, action.personKey);
            break;
          case "pan":
            next = await resolvePan(sessionId);
            break;
          case "samePerson":
            next = await resolveSamePerson(sessionId, action.personKey, action.memberId, action.same);
            break;
          case "acknowledge":
            next = await acknowledgePrompt(sessionId, action.code);
            break;
        }
        showPreview(next);
      } catch (err) {
        // A 422 (bad name / bad choice) keeps the prompt open with the message.
        if (!getImportPrompt(err) && err instanceof ApiError && err.status === 422) {
          setError(errorMessage(err));
          return;
        }
        handleFailure(err);
      }
    },
    [cancel, showPreview, handleFailure],
  );

  const confirm = useCallback(
    async (people: PersonConfirmation[], movedFunds: Record<string, string> = {}) => {
      const sessionId = sessionRef.current;
      if (!sessionId || confirmingRef.current || confirmedRef.current) return;
      confirmingRef.current = true;
      setError(null);
      setConfirmRejected(false);
      try {
        const result = await confirmPeopleImport(sessionId, people, movedFunds);
        sessionRef.current = null;
        confirmedRef.current = true;
        setConfirmResult(result);
        setStage("confirmed");
      } catch (err) {
        if (getImportPrompt(err)) {
          handleFailure(err);
        } else {
          // 5xx/network: stay on review with the message so the user can retry (C1).
          setError(errorMessage(err));
          // A 422 confirm_invalid is deterministic (e.g. the person is now on another
          // account): retrying the same body can never succeed, so flag it.
          setConfirmRejected(
            err instanceof ApiError && err.status === 422 &&
              (err.payload as { code?: string } | null)?.code === "confirm_invalid",
          );
        }
      } finally {
        confirmingRef.current = false;
      }
    },
    [handleFailure],
  );

  /** Moves forward one step: notices -> people (or review), people -> review. */
  const dismissNotice = useCallback(() => {
    setStage((current) => {
      if (current === "notices") return preview ? stageAfterNotices(preview) : "review";
      if (current === "people") return "review";
      return current;
    });
  }, [preview]);

  return { stage, preview, prompt, confirmResult, error, confirmRejected, upload, resolve, confirm, cancel, dismissNotice };
}
