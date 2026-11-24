import { PRINT_SECTIONS } from "./sectionRegistry";

export interface PrintOptions {
  scope: string;
  sectionIds: string[];
  cover: boolean;
  dataDates: boolean;
  showFolios: "full" | "masked" | "none";
  jobId: string;
  members: { id: string; name: string }[];
  meta: { holderName: string | null; scopeName: string; memberCount: number };
  pages?: Record<string, number>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseMembers(value: unknown): PrintOptions["members"] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const members: PrintOptions["members"] = [];
  for (const item of value) {
    const member = record(item);
    if (!member || typeof member.id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(member.id) ||
      typeof member.name !== "string" || !member.name.trim() || member.name.length > 120) return null;
    members.push({ id: member.id, name: member.name });
  }
  return members;
}

function parseMeta(value: unknown): PrintOptions["meta"] | null {
  const meta = record(value);
  if (!meta) return null;
  const { holderName, scopeName, memberCount } = meta;
  if ((holderName !== null && typeof holderName !== "string") ||
    typeof scopeName !== "string" || !scopeName.trim() || scopeName.length > 160 ||
    typeof memberCount !== "number" || !Number.isInteger(memberCount) || memberCount < 1 || memberCount > 50) return null;
  return { holderName, scopeName, memberCount };
}

export function parsePrintFragment(hash: string): { pass: string | null; mode?: "browser"; options: PrintOptions } | null {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const pass = params.get("pass");
    const browser = params.get("mode") === "browser";
    const encoded = params.get("opts");
    if ((!browser && !pass) || (pass && pass.length > 1024) || !encoded || !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) return null;
    const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const options = value as Record<string, unknown>;
    const { scope, sectionIds, cover, dataDates, showFolios, jobId } = options;
    const members = parseMembers(options.members);
    const meta = parseMeta(options.meta);
    let pages: Record<string, number> | undefined;
    if (Object.hasOwn(options, "pages")) {
      const supplied = record(options.pages);
      if (!supplied) return null;
      pages = {};
      for (const [id, page] of Object.entries(supplied)) {
        if ((id !== "notes" && !Object.hasOwn(PRINT_SECTIONS, id)) || typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 9999) return null;
        pages[id] = page;
      }
    }
    if (typeof scope !== "string" || !scope.trim() ||
      !Array.isArray(sectionIds) || !sectionIds.every((id: unknown) => typeof id === "string" && Object.hasOwn(PRINT_SECTIONS, id)) ||
      typeof cover !== "boolean" || typeof dataDates !== "boolean" ||
      (showFolios !== "full" && showFolios !== "masked" && showFolios !== "none") ||
      typeof jobId !== "string" || !jobId.trim() || !members || !meta) return null;
    return { pass: browser ? null : pass, ...(browser ? { mode: "browser" as const } : {}), options: { scope, sectionIds, cover, dataDates, showFolios, jobId, members, meta, ...(pages ? { pages } : {}) } };
  } catch {
    return null;
  }
}

export function clearFragment(): void {
  history.replaceState(null, "", location.pathname);
}
