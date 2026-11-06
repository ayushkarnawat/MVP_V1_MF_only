export interface Refusal {
  code: "member_in_recent_head_change" | "head_change_undo_window";
  message: string;
  availableAfter: string | null;
}

export function readRefusal(err: unknown): Refusal | null {
  if (!err || typeof err !== "object") return null;
  const status = "status" in err ? (err as { status?: unknown }).status : null;
  if (status !== 409) return null;
  const payload = "payload" in err ? (err as { payload?: unknown }).payload : null;
  if (!payload || typeof payload !== "object") return null;
  const { code, message, available_after } = payload as {
    code?: unknown;
    message?: unknown;
    available_after?: unknown;
  };
  if (
    code !== "member_in_recent_head_change" &&
    code !== "head_change_undo_window"
  ) {
    return null;
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    return null;
  }
  const availableAfter = typeof available_after === "string" ? available_after : null;
  return {
    code,
    message,
    availableAfter,
  };
}
