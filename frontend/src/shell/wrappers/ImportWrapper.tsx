import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ShieldCheck, User } from "lucide-react";
import { ImportFlow } from "../../features/import/ImportFlow";
import { clearCasResumeStep2 } from "../../features/import/casResumeState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useAuth } from "../../features/auth/AuthContext";
import { useScope } from "../scope/ScopeContext";
import { ImportHeaderContext } from "../nav/ImportProvider";
import { importDoneTarget } from "../nav/importDoneTarget";

export default function ImportWrapper() {
  const { members, memberId, viewMode } = useScope();
  const { me } = useAuth();
  const [search] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const queryMember = search.get("member");
  const [choice, setChoice] = useState<string | null>(null);
  const targetAddMemberId = queryMember || choice || memberId || members[0]?.id || null;
  const addDataAllowsMemberChoice = !queryMember && viewMode === "aggregate";
  const targetMemberName = members.find(member => member.id === targetAddMemberId)?.name;
  const origin: unknown = state && typeof state === "object" && "origin" in state ? state.origin : undefined;
  const slot = useContext(ImportHeaderContext);
  const setMemberChip = slot?.setMemberChip;
  const leaving = useRef({ memberId: targetAddMemberId }).current;
  useEffect(() => { leaving.memberId = targetAddMemberId; }, [leaving, targetAddMemberId]);
  // Clear on a real leave only: React StrictMode replays effect cleanup on mount, and the old code cleared
  // on the user's back/leave action, so the clear waits a tick and is skipped if the page mounted again.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => { if (!mounted.current) clearCasResumeStep2(leaving.memberId); }, 0);
    };
  }, [leaving]);

  const memberChip = useMemo(() => addDataAllowsMemberChoice && members.length > 0 ? (
    <Select value={targetAddMemberId ?? undefined} onValueChange={setChoice}>
      <SelectTrigger
        className="h-8 w-auto min-w-[160px] gap-1.5 rounded-full border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] [&>span]:line-clamp-1"
        aria-label="Select family member to import for">
        <User className="h-3.5 w-3.5 text-[var(--color-accent)] flex-shrink-0" />
        <SelectValue placeholder="Select member" />
      </SelectTrigger>
      <SelectContent>{members.map(member => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent>
    </Select>
  ) : targetMemberName ? (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)]">
      <User className="h-3.5 w-3.5 text-[var(--color-accent)]" />
      <span>Importing for <strong className="text-[var(--color-ink)] font-semibold">{targetMemberName}</strong></span>
    </div>
  ) : null, [addDataAllowsMemberChoice, members, targetAddMemberId, targetMemberName]);
  useEffect(() => {
    setMemberChip?.(memberChip);
    return () => setMemberChip?.(null);
  }, [memberChip, setMemberChip]);

  return <>
    <h1 className="sr-only">Add data</h1>
    <div className="space-y-8">
      {targetAddMemberId && <ImportFlow key={targetAddMemberId} householdMemberId={targetAddMemberId} onDone={notice => {
        // The notice names family members and lives in history state, which outlives a logout in the same tab:
        // it carries the user it was written for so another user's Back press never shows it.
        void navigate(importDoneTarget(typeof origin === "string" ? origin : undefined), { replace: true, state: { importNotice: notice ?? null, importNoticeUser: me?.user_id ?? null } });
      }} />}
      <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--color-text-secondary)] pt-4 border-t border-[var(--color-border)]/60">
        <ShieldCheck className="h-4 w-4 text-[var(--color-positive)]" />
        <span>Read-only statement parsing · Zero transaction permissions</span>
      </div>
    </div>
  </>;
}
