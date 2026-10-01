import type { HouseholdMember } from "@/features/auth/types";

/** A person with no relationship yet must not render a "(null)" suffix. */
export const memberLabel = (m: HouseholdMember) => (m.relationship ? `${m.name} (${m.relationship})` : m.name);
