// Client-generated device identifier for OTP-request metadata
// (auth-flow-redesign FR-2, 2026-09-28). This is a self-issued marker the
// browser cooperates in carrying around, not a hardware identifier -- it's
// cleared by clearing site data or private browsing, which is expected.
const DEVICE_ID_STORAGE_KEY = "unifolio_device_id";

// I7 fix (final review, 2026-09-28): crypto.randomUUID doesn't exist
// outside secure contexts (e.g. dev over http://<LAN-IP>, used for phone
// testing) or on Safari < 15.4 -- calling it unconditionally could crash
// every OTP request, since this id rides on every auth call. Falls back to
// crypto.getRandomValues (broader support), then Math.random as a last
// resort. This is metadata for analytics, never allowed to block auth.
function generateId(): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto?.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const generated = generateId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private browsing / blocked storage: fall back to a fresh,
    // non-persisted id rather than failing the request.
    return generateId();
  }
}
