import { ApiError } from "./api";

export type PanConflictCode =
  | "cross_account_pan_blocked"
  | "pan_belongs_to_other_member"
  | "pan_mismatch_for_member";

const PAN_CONFLICT_CODES: readonly string[] = [
  "cross_account_pan_blocked",
  "pan_belongs_to_other_member",
  "pan_mismatch_for_member",
];

export interface PanConflict {
  code: PanConflictCode;
  message: string;
}

/** The upload-time PAN conflict carried by a /imports/parse 409, or null. */
export function getPanConflict(err: unknown): PanConflict | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const payload = err.payload as { code?: unknown; message?: unknown } | string | null;
  if (!payload || typeof payload === "string") return null;
  if (typeof payload.code !== "string" || !PAN_CONFLICT_CODES.includes(payload.code)) return null;
  return { code: payload.code as PanConflictCode, message: String(payload.message ?? "") };
}
