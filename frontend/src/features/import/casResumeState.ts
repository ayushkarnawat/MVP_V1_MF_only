const RESUME_STEP2_KEY_PREFIX = "unifolio_cas_resume_step2";

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
