import { RELATIONSHIP_OPTIONS } from "@/features/auth/relationships";
import type { HouseholdMember } from "@/features/auth/types";

export function cleanName(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/\s*\([Mm][Ee]\)\s*$/, "").trim();
}

export function firstName(name: string | null | undefined): string {
  return cleanName(name).split(/\s+/)[0] ?? "";
}

export function relationshipText(member: HouseholdMember): string {
  if (member.relationship === "self") return "Me";
  if (member.relationship === "other") {
    return member.relationship_other_label?.trim() || "Other";
  }
  const match = RELATIONSHIP_OPTIONS.find(option => option.value === member.relationship);
  return match?.label ?? "Not set";
}
