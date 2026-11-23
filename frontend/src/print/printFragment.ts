import { PRINT_SECTIONS } from "./sectionRegistry";

export interface PrintOptions {
  scope: string;
  sectionIds: string[];
  cover: boolean;
  dataDates: boolean;
  showFolios: "full" | "masked" | "none";
  jobId: string;
}

export function parsePrintFragment(hash: string): { pass: string; options: PrintOptions } | null {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const pass = params.get("pass");
    const encoded = params.get("opts");
    if (!pass || pass.length > 1024 || !encoded || !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) return null;
    const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const options = value as Record<string, unknown>;
    const { scope, sectionIds, cover, dataDates, showFolios, jobId } = options;
    if (typeof scope !== "string" || !scope.trim() ||
      !Array.isArray(sectionIds) || !sectionIds.every((id: unknown) => typeof id === "string" && Object.hasOwn(PRINT_SECTIONS, id)) ||
      typeof cover !== "boolean" || typeof dataDates !== "boolean" ||
      (showFolios !== "full" && showFolios !== "masked" && showFolios !== "none") ||
      typeof jobId !== "string" || !jobId.trim()) return null;
    return { pass, options: { scope, sectionIds, cover, dataDates, showFolios, jobId } };
  } catch {
    return null;
  }
}

export function clearFragment(): void {
  history.replaceState(null, "", location.pathname);
}
