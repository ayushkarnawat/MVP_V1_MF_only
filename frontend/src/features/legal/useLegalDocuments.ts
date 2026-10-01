import { useCallback, useEffect, useState } from "react";
import { getLegalDocuments } from "./api";
import type { LegalDocument } from "./types";

export function useLegalDocuments(): { docs: LegalDocument[] | null; error: boolean; refetch: () => Promise<void> } {
  const [docs, setDocs] = useState<LegalDocument[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async (force: boolean) => {
    setError(false);
    try {
      setDocs(await getLegalDocuments(force));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refetch = useCallback(() => load(true), [load]);
  return { docs, error, refetch };
}
