import type { ReactNode } from "react";
import { createContext, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router";
import { ImportContext, useScope } from "../scope/ScopeContext";
import { paths } from "./paths";

// oxlint-disable-next-line react/only-export-components -- Shared slot connects the route to its existing focus header.
export const ImportHeaderContext = createContext<{ memberChip: ReactNode; setMemberChip: Dispatch<SetStateAction<ReactNode>> } | null>(null);

export function ImportProvider({ children }: { children: ReactNode }) {
  const [memberChip, setMemberChip] = useState<ReactNode>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { viewMode, memberId } = useScope();
  const openImport = (explicitMemberId?: string) => {
    const target = explicitMemberId || (viewMode === "member" ? memberId ?? undefined : undefined);
    void navigate(paths.import(target), { state: { origin: pathname } });
  };
  return <ImportContext.Provider value={{ openImport }}><ImportHeaderContext.Provider value={{ memberChip, setMemberChip }}>{children}</ImportHeaderContext.Provider></ImportContext.Provider>;
}
