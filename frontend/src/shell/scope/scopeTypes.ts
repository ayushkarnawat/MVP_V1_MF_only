import type { HouseholdMember } from "../../features/auth/types";

export interface ScopeMember { id: string; name: string; profile?: HouseholdMember }

export interface ScopeValue {
  viewMode: "aggregate" | "member";
  memberId: string | null;
  members: ScopeMember[];
  selectedMember?: ScopeMember;
  scopeKey: string;
  setMember: (id: string) => void;
  setAggregate: () => void;
  /** Resolves with the fresh list (Batch C 17d), or null when the refresh failed or a newer one replaced it. */
  refreshMembers: () => void | Promise<ScopeMember[] | null | void>;
  /**
   * Set when a search jump changed the selector. `label` is the member's name or "Family"; `undo()` puts the previous selector back.
   * Cleared by undo, by any manual selector change and by moving to another page. Optional so existing providers still type-check.
   */
  scopeJump?: { label: string; undo: () => void } | null;
}

export interface ImportValue { openImport: (memberId?: string) => void }
