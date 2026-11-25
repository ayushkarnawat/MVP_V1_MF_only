import { useCallback, useEffect, useRef, useState } from "react";
import { getPendingCamsRequest, type PendingCamsRequest } from "./api";

type Status = "loading" | "none" | "waiting" | "error";

export function usePendingCamsRequest(memberId: string): {
  status: Status;
  request: PendingCamsRequest | null;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<{
    memberId: string;
    status: Status;
    request: PendingCamsRequest | null;
  }>({ memberId, status: "loading", request: null });
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const attempt = ++generation.current;
    setState({ memberId, status: "loading", request: null });
    try {
      const request = await getPendingCamsRequest(memberId);
      if (attempt === generation.current) {
        setState({ memberId, status: request ? "waiting" : "none", request });
      }
    } catch {
      if (attempt === generation.current) {
        setState({ memberId, status: "error", request: null });
      }
    }
  }, [memberId]);

  useEffect(() => {
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);

  return {
    status: state.memberId === memberId ? state.status : "loading",
    request: state.memberId === memberId ? state.request : null,
    refresh,
  };
}
