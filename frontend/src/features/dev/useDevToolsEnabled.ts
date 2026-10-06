import { useEffect, useState } from "react";
import { fetchDevStatus } from "./api";

export function useDevToolsEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    fetchDevStatus().then((result) => { if (active) setEnabled(result.enabled); })
      .catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);
  return enabled;
}
