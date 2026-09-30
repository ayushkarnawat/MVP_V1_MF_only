import { ApiError } from "./api";
import type { ImportPrompt, ImportPromptCode } from "./types";

const PROMPT_CODES_409: readonly string[] = [
  "member_details_required",
  "member_pan_mismatch",
  "member_not_in_file",
  "locked_member_only",
  "cross_account_pan_blocked",
  "statement_pan_on_other_account",
  "self_name_mismatch",
  "which_is_self",
  "pan_belongs_to_other_member",
  "pan_mismatch_for_member",
];

/**
 * The upload-time prompt carried by a 409 (or the 410 session_expired) from
 * /imports/parse, the resolve/acknowledge routes or /imports/confirm; null for
 * anything else. Replaces panConflict.ts.
 */
export function getImportPrompt(err: unknown): ImportPrompt | null {
  if (!(err instanceof ApiError) || (err.status !== 409 && err.status !== 410)) return null;
  const payload = err.payload as Record<string, unknown> | string | null;
  if (!payload || typeof payload === "string") return null;
  const code = payload.code;
  if (typeof code !== "string") return null;
  const allowed = err.status === 410 ? code === "session_expired" : PROMPT_CODES_409.includes(code);
  if (!allowed) return null;
  const details = payload.details;
  return {
    code: code as ImportPromptCode,
    message: String(payload.message ?? ""),
    sessionId: typeof payload.session_id === "string" ? payload.session_id : null,
    details: details && typeof details === "object" ? (details as Record<string, unknown>) : {},
  };
}
