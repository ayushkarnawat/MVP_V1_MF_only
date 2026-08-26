import { useEffect, useState } from "react";
import { FamilyCasUpload } from "./FamilyCasUpload";
import type { FamilyUpload } from "./FamilyCasUpload";
import { UploadMyCas } from "./UploadMyCas";
import { ParseQueue } from "./ParseQueue";
import { ParsingIndicator } from "../import/ParsingIndicator";
import { ReviewTable } from "../import/ReviewTable";
import { ImportError } from "../import/ImportError";
import { ImportConfirmed } from "../import/ImportConfirmed";
import { ApiError, confirmImport, parseImport } from "../import/api";
import type { ImportConfirmResponse, ImportPreviewResponse, ParseErrorPayload, SchemeConfirmation } from "../import/types";
import { useAuth } from "./AuthContext";
import { createHouseholdMember, listHouseholdMembers } from "./api";
import type { HouseholdMember } from "./types";
import styles from "./onboarding.module.css";

interface FamilyImportFlowProps {
  selfName: string;
}

type Stage = "cards" | "own-choice" | "own-upload" | "queue" | "processing" | "done";

interface ProcessingState {
  index: number;
  status: "parsing" | "review" | "error";
  preview: ImportPreviewResponse | null;
  error: ParseErrorPayload | null;
}

const GENERIC_NETWORK_ERROR: ParseErrorPayload = {
  code: "network_error",
  message: "Couldn't reach the server. Check your connection and try again.",
};

function toParseErrorPayload(err: unknown): ParseErrorPayload {
  if (err instanceof ApiError) {
    // ApiError.payload is `unknown`; the import API only ever throws ParseErrorPayload | string.
    const payload = err.payload as ParseErrorPayload | string;
    return typeof payload === "string" ? { code: "error", message: payload } : payload;
  }
  return GENERIC_NETWORK_ERROR;
}

export function FamilyImportFlow({ selfName }: FamilyImportFlowProps) {
  const { updateMe } = useAuth();
  const [stage, setStage] = useState<Stage>("cards");
  const [familyMembers, setFamilyMembers] = useState<HouseholdMember[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [queue, setQueue] = useState<FamilyUpload[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [results, setResults] = useState<ImportConfirmResponse[]>([]);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [ownUploadError, setOwnUploadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [selfMember, setSelfMember] = useState<HouseholdMember | null>(null);

  // Fetch the roster from the backend rather than trusting a prop: React state
  // (OnboardingFlow's answers.familyMembers) doesn't survive a page reload, only
  // the backend does, so a resumed family-onboarding session must re-fetch to
  // avoid showing zero member cards.
  useEffect(() => {
    let cancelled = false;
    listHouseholdMembers()
      .then((members) => {
        if (!cancelled) {
          setFamilyMembers(members.filter((member) => member.relationship !== "self"));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRosterError("Couldn't load your family members. Please try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Strictly sequential: one parse at a time — the next item only starts after
  // the current one is confirmed or skipped (the backend's preview-session
  // store is not safe under concurrent parses).
  const startParsing = async (index: number) => {
    setReviewNotice(null);
    setProcessing({ index, status: "parsing", preview: null, error: null });
    try {
      const preview = await parseImport(queue[index].file, queue[index].password);
      setProcessing({ index, status: "review", preview, error: null });
    } catch (err) {
      setProcessing({ index, status: "error", preview: null, error: toParseErrorPayload(err) });
    }
  };

  useEffect(() => {
    if (stage === "processing" && processing === null) {
      void startParsing(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const advanceOrFinish = (updatedResults: ImportConfirmResponse[]) => {
    const nextIndex = (processing?.index ?? 0) + 1;
    if (nextIndex >= queue.length) {
      setResults(updatedResults);
      setStage("done");
      return;
    }
    setResults(updatedResults);
    void startParsing(nextIndex);
  };

  const handleConfirm = async (confirmations: SchemeConfirmation[]) => {
    if (!processing?.preview) return;
    const item = queue[processing.index];
    setReviewNotice(null);
    setConfirming(true);
    try {
      const result = await confirmImport(processing.preview.session_id, item.memberId, confirmations);
      advanceOrFinish([...results, result]);
    } catch (err) {
      // 409 (needs an override) / 404 (session expired) are recoverable from the
      // review screen — keep the parsed preview rendered with an inline notice,
      // mirroring ImportFlow.handleConfirm.
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setReviewNotice(
          err.status === 404
            ? "This import session has expired. Please re-upload your CAS."
            : toParseErrorPayload(err).message,
        );
        return;
      }
      setProcessing({ ...processing, status: "error", error: toParseErrorPayload(err) });
    } finally {
      setConfirming(false);
    }
  };

  const handleRetryFailedItem = () => {
    if (processing) {
      void startParsing(processing.index);
    }
  };

  const handleSkipFailedItem = () => {
    advanceOrFinish(results);
  };

  const resolveSelfMember = async (): Promise<HouseholdMember> => {
    const existing = await listHouseholdMembers();
    const self = existing.find((member) => member.relationship === "self");
    return self ?? createHouseholdMember(selfName.trim() || "Me", "self");
  };

  // Resolved eagerly on entering "own-upload" (rather than only inside
  // Step 2's onSubmit) — Step 1 (Request from CAMS) needs the real UUID too,
  // and it never goes through onSubmit at all. See UploadMyCas.tsx.
  useEffect(() => {
    if (stage !== "own-upload" || selfMember) return;
    let cancelled = false;
    resolveSelfMember()
      .then((member) => {
        if (!cancelled) setSelfMember(member);
      })
      .catch(() => {
        if (!cancelled) setOwnUploadError("Couldn't set up your profile. Please try again.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, selfMember]);

  if (rosterError) {
    return (
      <p role="alert" className={styles.error}>
        {rosterError}
      </p>
    );
  }
  if (familyMembers === null) {
    return <p>Loading...</p>;
  }

  if (stage === "cards") {
    return (
      <FamilyCasUpload
        members={familyMembers}
        queue={queue}
        skipped={skipped}
        onQueueUpload={(upload) => setQueue((q) => [...q, upload])}
        onSkip={(memberId) => setSkipped((s) => new Set(s).add(memberId))}
        onContinue={() => setStage("own-choice")}
      />
    );
  }

  if (stage === "own-choice") {
    return (
      <UploadMyCas
        awaitingUpload={false}
        onUploadNow={() => setStage("own-upload")}
        onUploadLater={() => setStage(queue.length === 0 ? "done" : "queue")}
        onSubmit={() => {}}
      />
    );
  }

  if (stage === "own-upload") {
    if (!selfMember) {
      return (
        <>
          {ownUploadError && <p className={styles.error}>{ownUploadError}</p>}
          <p>Setting up your profile...</p>
        </>
      );
    }
    return (
      <UploadMyCas
        awaitingUpload
        memberId={selfMember.id}
        onUploadNow={() => {}}
        onUploadLater={() => {}}
        onSubmit={(file, password) => {
          setQueue((q) => [...q, { memberId: selfMember.id, memberName: selfMember.name, file, password }]);
          setStage("queue");
        }}
      />
    );
  }

  if (stage === "queue") {
    return <ParseQueue queue={queue} onParseFiles={() => setStage("processing")} />;
  }

  if (stage === "processing" && processing) {
    const item = queue[processing.index];
    if (processing.status === "parsing") {
      return <ParsingIndicator />;
    }
    if (processing.status === "review" && processing.preview) {
      return (
        <>
          {reviewNotice && <p role="alert">{reviewNotice}</p>}
          <ReviewTable
            preview={processing.preview}
            confirming={confirming}
            onConfirm={handleConfirm}
            memberName={item.memberName}
          />
        </>
      );
    }
    return (
      <>
        <p>{`${item.memberName}'s CAS`}</p>
        <ImportError
          error={processing.error ?? GENERIC_NETWORK_ERROR}
          onRetry={handleRetryFailedItem}
        />
        <button type="button" onClick={handleSkipFailedItem}>
          {`Skip ${item.memberName} for now`}
        </button>
      </>
    );
  }

  if (stage === "done") {
    const aggregate: ImportConfirmResponse = {
      added: results.reduce((sum, r) => sum + r.added, 0),
      skipped: results.reduce((sum, r) => sum + r.skipped, 0),
      import_id: results.length > 0 ? results[results.length - 1].import_id : "",
    };
    return (
      <ImportConfirmed
        result={aggregate}
        ctaLabel="Get my first score"
        onImportAnother={async () => {
          await updateMe({ onboarding_completed: true });
        }}
      />
    );
  }

  return null;
}
