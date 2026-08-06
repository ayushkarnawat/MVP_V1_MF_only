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

interface FamilyImportFlowProps {
  familyMembers: HouseholdMember[];
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

export function FamilyImportFlow({ familyMembers, selfName }: FamilyImportFlowProps) {
  const { updateMe } = useAuth();
  const [stage, setStage] = useState<Stage>("cards");
  const [queue, setQueue] = useState<FamilyUpload[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [results, setResults] = useState<ImportConfirmResponse[]>([]);

  // Strictly sequential: one parse at a time — the next item only starts after
  // the current one is confirmed or skipped (the backend's preview-session
  // store is not safe under concurrent parses).
  const startParsing = async (index: number) => {
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
    try {
      const result = await confirmImport(processing.preview.session_id, item.memberId, confirmations);
      advanceOrFinish([...results, result]);
    } catch {
      setProcessing({ ...processing, status: "error", error: GENERIC_NETWORK_ERROR });
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
        onUploadLater={() => setStage("queue")}
        onSubmit={() => {}}
      />
    );
  }

  if (stage === "own-upload") {
    return (
      <UploadMyCas
        awaitingUpload
        onUploadNow={() => {}}
        onUploadLater={() => {}}
        onSubmit={async (file, password) => {
          const self = await resolveSelfMember();
          setQueue((q) => [...q, { memberId: self.id, memberName: self.name, file, password }]);
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
          <p>{`Reviewing: ${item.memberName}'s CAS`}</p>
          <ReviewTable preview={processing.preview} confirming={false} onConfirm={handleConfirm} />
        </>
      );
    }
    return (
      <ImportError
        error={processing.error ?? GENERIC_NETWORK_ERROR}
        onRetry={handleSkipFailedItem}
      />
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
        ctaLabel="Continue"
        onImportAnother={async () => {
          await updateMe({ onboarding_completed: true });
        }}
      />
    );
  }

  return null;
}
