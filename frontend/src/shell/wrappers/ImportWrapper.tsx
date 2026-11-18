import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ShieldCheck, User } from "lucide-react";
import { ImportFlow } from "../../features/import/ImportFlow";
import type { ImportNotice, ImportOutcome } from "../../features/import/importNotice";
import { clearCasResumeStep2 } from "../../features/import/casResumeState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useAuth } from "../../features/auth/AuthContext";
import { useScope } from "../scope/ScopeContext";
import { ImportHeaderContext } from "../nav/ImportProvider";
import { importDoneTarget } from "../nav/importDoneTarget";

const MEMBER_LIST_WAIT_MS = 5000;

export default function ImportWrapper() {
  const { members, memberId, viewMode, refreshMembers, setMember, setAggregate } = useScope();
  // The household as it was when Add data opened (the first non-empty list this page saw). "Did the household grow?" is asked
  // against this, not against the count at the moment the import finishes: another refresh can load the new member before that
  // moment (independent review of C-9, finding 3), and a count taken then would not see it.
  const openingIds = useRef<Set<string> | null>(null);
  if (openingIds.current === null && members.length > 0) openingIds.current = new Set(members.map(member => member.id));
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const memberIdRef = useRef(memberId);
  memberIdRef.current = memberId;
  const { me } = useAuth();
  const [search] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const requestedMember = search.get("member");
  // A ?member= id outside the household (a stale link, another account's) is ignored so the header and the upload
  // always name the same member. While the household is still loading it cannot be checked, so it is used as is.
  const queryMember = requestedMember && (members.length === 0 || members.some(member => member.id === requestedMember)) ? requestedMember : null;
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

  const handleImportDone = async (notice?: ImportNotice, outcome?: ImportOutcome) => {
    const opening = openingIds.current;
    const startMode = viewModeRef.current;
    const startMember = memberIdRef.current;
    // Promise.resolve().then(...) so a refresh that throws at once is caught too, and the page still navigates.
    // Waits for the fresh list, but not for ever: a request that never answers must not hold the person on this screen
    // (independent review of Batch C, M3). After 5 seconds it counts as "no list": navigate, stay on the viewed member.
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const fresh = await Promise.race([
      Promise.resolve().then(() => refreshMembers()).catch(() => null),
      new Promise<null>(resolve => { giveUp = setTimeout(() => resolve(null), MEMBER_LIST_WAIT_MS); }),
    ]);
    clearTimeout(giveUp);
    // The person left Add data while the list was loading: do not pull them back or move their view.
    if (!mounted.current) return;
    // A view the person chose themselves while the list was loading wins over our own move (independent review of C-9, finding 2).
    const personMovedTheView = viewModeRef.current !== startMode || memberIdRef.current !== startMember;
    if (Array.isArray(fresh) && !personMovedTheView) {
      const targetId = outcome?.landOnPersonId;
      if (targetId && fresh.some(member => member.id === targetId)) {
        setMember(targetId);
      } else if (opening && fresh.some(member => !opening.has(member.id)) && viewModeRef.current === "member") {
        setAggregate();
      }
    }
    // The notice names family members and lives in history state, which outlives a logout in the same tab:
    // it carries the user it was written for so another user's Back press never shows it.
    void navigate(importDoneTarget(typeof origin === "string" ? origin : undefined), { replace: true, state: { importNotice: notice ?? null, importNoticeUser: me?.user_id ?? null } });
  };

  return <>
    <h1 className="sr-only">Add data</h1>
    <div className="space-y-8">
      {targetAddMemberId && <ImportFlow key={targetAddMemberId} householdMemberId={targetAddMemberId} onDone={(notice, outcome) => {
        void handleImportDone(notice, outcome);
      }} />}
      <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--color-text-secondary)] pt-4 border-t border-[var(--color-border)]/60">
        <ShieldCheck className="h-4 w-4 text-[var(--color-positive)]" />
        <span>Read-only statement parsing · Zero transaction permissions</span>
      </div>
    </div>
  </>;
}
