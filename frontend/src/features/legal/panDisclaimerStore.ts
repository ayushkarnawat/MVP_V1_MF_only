// Module-level on purpose: the upload passes through five layers (form →
// container → orchestration → useImportFlow → parseImport); threading a
// version through all of them for one form field is more churn than a tiny
// store. The server is the real gate (422 without it).
export type UploadSurface = "onboarding_upload" | "import_upload" | "mobile_upload";

let current: { version: string; surface: UploadSurface } | null = null;

export function setPanDisclaimer(version: string | null, surface: UploadSurface = "import_upload"): void {
  current = version === null ? null : { version, surface };
}

export function currentPanDisclaimer(): { version: string; surface: UploadSurface } | null {
  return current;
}
