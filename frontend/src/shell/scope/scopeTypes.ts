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
  refreshMembers: () => void | Promise<void>;
}

export interface ImportValue { openImport: (memberId?: string) => void }
