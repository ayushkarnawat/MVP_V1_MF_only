import type { Relationship } from "./types";

// "self" is excluded on purpose: Me is created by onboarding, never picked.
export const RELATIONSHIP_OPTIONS: { value: Exclude<Relationship, "self">; label: string }[] = [
  { value: "spouse", label: "Spouse" },
  { value: "parent", label: "Parent" },
  { value: "child", label: "Child" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];
