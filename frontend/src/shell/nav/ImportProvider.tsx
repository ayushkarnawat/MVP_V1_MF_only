import type { ReactNode } from "react";
import { createContext, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router";
import { ImportContext, useScope } from "../scope/ScopeContext";
import { MemberPickerDialog } from "./MemberPickerDialog";
import { paths } from "./paths";

// oxlint-disable-next-line react/only-export-components -- Shared slot connects the route to its existing focus header.
export const ImportHeaderContext = createContext<{ memberChip: ReactNode; setMemberChip: Dispatch<SetStateAction<ReactNode>> } | null>(null);

export function ImportProvider({ children }: { children: ReactNode }) {
  const [memberChip, setMemberChip] = useState<ReactNode>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { viewMode, memberId, members } = useScope();
  const [picking, setPicking] = useState(false);
  // The picker belongs to the family view; any change of view or member closes it.
  useEffect(() => { setPicking(false); }, [viewMode, memberId]);
  const go = (target?: string) => {
    // Clear any notice left on the current entry before pushing the import route, so a stale
    // notice from an earlier import can never resurface via Back once a later one supersedes it.
    void navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null });
    void navigate(paths.import(target), { state: { origin: location.pathname } });
  };
  const openImport = (explicitMemberId?: string) => {
    const target = explicitMemberId || (viewMode === "member" ? memberId ?? undefined : undefined);
    if (!target && viewMode === "aggregate" && members.length >= 2) { setPicking(true); return; }
    go(target);
  };
  return (
    <ImportContext.Provider value={{ openImport }}>
      <ImportHeaderContext.Provider value={{ memberChip, setMemberChip }}>
        {children}
      </ImportHeaderContext.Provider>
      <MemberPickerDialog
        members={members}
        open={picking}
        onCancel={() => setPicking(false)}
        onContinue={id => { setPicking(false); go(id); }}
      />
    </ImportContext.Provider>
  );
}
