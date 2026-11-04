// An import counts as completed when the backend saved it as "confirmed" (a statement upload confirmed from the
// preview, the normal path) or "import_successful" (the CAMS portal and manual-entry paths). Every other status is
// unfinished or failed.
const COMPLETED = new Set(["confirmed", "import_successful"]);

export const isCompletedImport = (status: string): boolean => COMPLETED.has(status);
