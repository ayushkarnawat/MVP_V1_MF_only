const RESUME_STEP2_KEY_PREFIX = "unifolio_cas_resume_step2";
const CHECKLIST_KEY_PREFIX = "unifolio_cams_checklist_";

export interface ChecklistState {
  ticks: boolean[];
  step: "form" | "waiting" | "ready";
}

export function getChecklistState(memberId: string): ChecklistState | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(`${CHECKLIST_KEY_PREFIX}${memberId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("ticks" in parsed) || !("step" in parsed)) return null;
    if (!Array.isArray(parsed.ticks) || parsed.ticks.length !== 5 || !parsed.ticks.every((tick: unknown) => typeof tick === "boolean")) return null;
    if (parsed.step !== "form" && parsed.step !== "waiting" && parsed.step !== "ready") return null;
    return { ticks: [...parsed.ticks], step: parsed.step };
  } catch {
    return null;
  }
}

export function setChecklistState(memberId: string, state: ChecklistState): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(`${CHECKLIST_KEY_PREFIX}${memberId}`, JSON.stringify({ ticks: state.ticks, step: state.step }));
  } catch {
    // Storage is optional; the in-memory checklist still works.
  }
}

export function clearChecklistState(memberId: string): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(`${CHECKLIST_KEY_PREFIX}${memberId}`);
  } catch {
    // Match the resume marker's storage fallback.
  }
}

export function getCasResumeKey(memberId?: string | null): string {
  return memberId ? `${RESUME_STEP2_KEY_PREFIX}_${memberId}` : RESUME_STEP2_KEY_PREFIX;
}

export function setCasResumeStep2(memberId?: string | null): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (memberId) {
      window.localStorage.setItem(getCasResumeKey(memberId), "true");
    }
    window.localStorage.setItem(RESUME_STEP2_KEY_PREFIX, "true");
  } catch {
    // Gracefully ignore local storage availability/quota errors
  }
}

export function hasCasResumeStep2(memberId?: string | null): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    if (memberId) {
      return window.localStorage.getItem(getCasResumeKey(memberId)) === "true";
    }
    return window.localStorage.getItem(RESUME_STEP2_KEY_PREFIX) === "true";
  } catch {
    return false;
  }
}

export function clearCasResumeStep2(memberId?: string | null): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (memberId) {
      window.localStorage.removeItem(getCasResumeKey(memberId));
    }
    window.localStorage.removeItem(RESUME_STEP2_KEY_PREFIX);
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(RESUME_STEP2_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Gracefully ignore local storage errors
  }
}
