import type { HouseholdMember } from "@/features/auth/types";

/** Name only (7 Oct decision): no relationship suffix in member pickers. */
export const memberLabel = (m: HouseholdMember) => m.name || "Self";
