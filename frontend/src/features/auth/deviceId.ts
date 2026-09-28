// Client-generated device identifier for OTP-request metadata
// (auth-flow-redesign FR-2, 2026-09-28). This is a self-issued marker the
// browser cooperates in carrying around, not a hardware identifier -- it's
// cleared by clearing site data or private browsing, which is expected.
const DEVICE_ID_STORAGE_KEY = "unifolio_device_id";

export function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const generated = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private browsing / blocked storage: fall back to a fresh,
    // non-persisted id rather than failing the request.
    return crypto.randomUUID();
  }
}
