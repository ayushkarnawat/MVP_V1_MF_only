// The name typed on sign-up screen 3 waits here until the account exists (the backend creates it only once the email
// code is verified). sessionStorage can be blocked or full, so every access is wrapped and a failure is silent.
const KEY = "unifolio.pendingSignup";

export interface PendingSignup {
  name: string;
  /** Normalised +91 number the sign-up started with; a stored name for another number is ignored. */
  phone: string;
}

export function savePendingSignup(value: PendingSignup): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Nothing to do: the name step simply asks again after a refresh.
  }
}

export function readPendingSignup(): PendingSignup | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignup> | null;
    return parsed && typeof parsed.name === "string" && typeof parsed.phone === "string" && parsed.name.trim()
      ? { name: parsed.name, phone: parsed.phone }
      : null;
  } catch {
    return null;
  }
}

export function clearPendingSignup(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // See above.
  }
}
