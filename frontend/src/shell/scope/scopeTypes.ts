export interface ScopeMember { id: string; name: string }

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
