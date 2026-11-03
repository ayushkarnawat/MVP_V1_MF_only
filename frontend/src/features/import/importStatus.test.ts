import { describe, expect, it } from "vitest";
import { isCompletedImport } from "./importStatus";

describe("isCompletedImport (backend, 3 Nov: a statement upload is saved as confirmed)", () => {
  it.each(["confirmed", "import_successful"])("%s is a completed import", (status) => {
    expect(isCompletedImport(status)).toBe(true);
  });
  it.each([
    "failed", "import_failed", "processing", "retry_pending", "upload_started", "password_required",
    "validation_failed", "not_started", "pending", "previewing", "requesting_cas", "waiting_for_user", "expired", "",
  ])("%s is not", (status) => {
    expect(isCompletedImport(status)).toBe(false);
  });
});
