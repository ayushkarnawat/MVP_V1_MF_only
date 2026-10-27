import { useState } from "react";
import type { HomeSection } from "./useHomeSection";

export type StaleAwareSection<T> = HomeSection<T> & { refreshing: boolean };

export function useStaleWhileLoading<T>(
  section: HomeSection<T>,
  resetKey: string
): StaleAwareSection<T> {
  const [kept, setKept] = useState<{ key: string; data: T } | null>(null);

  if (section.status === "data" && section.data !== null) {
    if (kept === null || kept.key !== resetKey || kept.data !== section.data) {
      setKept({ key: resetKey, data: section.data });
    }
  } else if (section.status === "error" && kept !== null) {
    setKept(null);
  }

  if (section.status === "loading" && kept !== null && kept.key === resetKey) {
    return {
      ...section,
      status: "data",
      data: kept.data,
      refreshing: true,
    };
  }

  return {
    ...section,
    refreshing: false,
  };
}
