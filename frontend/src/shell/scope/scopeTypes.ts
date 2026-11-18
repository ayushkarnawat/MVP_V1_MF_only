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
}

export interface ImportValue { openImport: (memberId?: string) => void }
