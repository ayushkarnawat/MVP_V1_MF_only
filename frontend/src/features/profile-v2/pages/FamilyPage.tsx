import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { cancelHeadChange, listHouseholdMembers } from "@/features/auth/api";
import type { HeadChangeStatus, HouseholdMember } from "@/features/auth/types";
import { CompleteProfileDialog } from "@/features/dashboard/members/CompleteProfileDialog";
import { deleteMemberPortfolio, getHouseholdImportHistory } from "@/features/import/api";
import { DeletePortfolioDialog } from "@/features/profile/DeletePortfolioDialog";
import { invalidateApiCache } from "@/lib/apiClient";
import { paths } from "@/shell/nav/paths";
import { useAppNavigate } from "@/shell/nav/useAppNavigate";
import { useImport, useScope } from "@/shell/scope/ScopeContext";
import { ProfileFrame } from "../ProfileFrame";
import { AddStatementDialog } from "../components/AddStatementDialog";
import { ChangeHeadDialog } from "../components/ChangeHeadDialog";
import { DeleteMemberDialog } from "../components/DeleteMemberDialog";
import { FamilyStrip } from "../components/FamilyStrip";
import { MemberCard } from "../components/MemberCard";
import { statementCount } from "../lib/statementCount";

function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

type HistoryRows = Awaited<ReturnType<typeof getHouseholdImportHistory>>;
type ListState = { status: "loading" | "ready" | "error"; members: HouseholdMember[] };

export default function FamilyPage() {
  const { me, refreshMe } = useAuth();
  const { refreshMembers } = useScope();
  const { openImport } = useImport();
  const navigate = useAppNavigate();

  const [list, setList] = useState<ListState>({ status: "loading", members: [] });
  // If the statements cannot load, the count is unknown, so never show 0: disable Delete all funds
  const [history, setHistory] = useState<{ rows: HistoryRows; failed: boolean }>({ rows: [], failed: false });
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<HouseholdMember | null>(null);
  const [fundsFor, setFundsFor] = useState<HouseholdMember | null>(null);
  const [fundsPending, setFundsPending] = useState(false);
  const [fundsError, setFundsError] = useState<string | null>(null);
  const [headDialog, setHeadDialog] = useState<{
    open: boolean;
    initialRequest: HeadChangeStatus | null;
  }>({ open: false, initialRequest: null });
  const [localPendingHeadChange, setLocalPendingHeadChange] = useState<HeadChangeStatus | null>(
    null,
  );
  // The banner's clock; the time left is worked out from the request's end time on every tick.
  const [clock, setClock] = useState<number>(() => Date.now());
  const [cancellingHeadChange, setCancellingHeadChange] = useState(false);

  const requestRef = useRef(0);
  const listRef = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    const request = ++requestRef.current;
    Promise.all([listHouseholdMembers(), getHouseholdImportHistory().catch(() => null)])
      .then(([householdMembers, rows]) => {
        if (requestRef.current !== request) return;
        setList({ status: "ready", members: householdMembers });
        setHistory(rows === null ? { rows: [], failed: true } : { rows, failed: false });
      })
      .catch(() => {
        if (requestRef.current === request) setList({ status: "error", members: [] });
      });
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  const members = list.members;
  const editing = members.find(member => member.id === editingId) ?? null;
  const selfMember = members.find(member => member.relationship === "self") ?? null;
  const isHead = Boolean(
    me?.head_member_id && selfMember && me.head_member_id === selfMember.id,
  );
  // The account's own answer wins; the local copy only bridges the moment between the dialog closing
  // and the account being read again (it is cleared as soon as that read comes back).
  const pendingHeadChange = me?.head_change_pending ?? localPendingHeadChange;
  // The time left is counted from when this copy of the request arrived, so a refreshed copy restarts
  // from the server's own number and a hidden tab cannot drift.
  const bannerTimes = useMemo(() => {
    if (!pendingHeadChange) return null;
    const startedAt = Date.now();
    return { startedAt, endAt: startedAt + pendingHeadChange.expires_in_seconds * 1000 };
  }, [pendingHeadChange]);
  const bannerSeconds = bannerTimes
    ? Math.max(0, Math.ceil((bannerTimes.endAt - Math.max(clock, bannerTimes.startedAt)) / 1000))
    : 0;
  // A banner with no time left is not shown ("0:00 left" would be a lie: the request has expired).
  const showPendingBanner = Boolean(
    pendingHeadChange && bannerSeconds > 0 && (!me?.head_member_id || isHead),
  );

  useEffect(() => {
    if (!bannerTimes) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [bannerTimes]);

  // Read the account again after a failed or finished change so the banner is what the server says.
  // (refreshMe is not a stable function, so it is read through a ref to keep this one stable.)
  const refreshMeRef = useRef(refreshMe);
  useEffect(() => {
    refreshMeRef.current = refreshMe;
  });
  const readAccountAgain = useCallback(async () => {
    try {
      await refreshMeRef.current();
      setLocalPendingHeadChange(null);
    } catch {
      // The read failed; keep what is shown rather than guess.
    }
  }, []);

  // Read the account once on arrival, so a request started elsewhere (or before the last sign-in)
  // is shown, and one that has ended is not.
  useEffect(() => {
    void readAccountAgain();
  }, [readAccountAgain]);

  // When the request runs out, take the banner away and ask the server what is true now.
  const expiredRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingHeadChange || !bannerTimes || bannerSeconds > 0) return;
    if (expiredRequestRef.current === pendingHeadChange.request_id) return;
    expiredRequestRef.current = pendingHeadChange.request_id;
    setLocalPendingHeadChange(null);
    void readAccountAgain();
  }, [pendingHeadChange, bannerTimes, bannerSeconds, readAccountAgain]);

  const handleCancelPendingHeadChange = async () => {
    if (cancellingHeadChange) return;
    setCancellingHeadChange(true);
    try {
      await cancelHeadChange();
    } catch {
      // Whatever went wrong (it may already have expired), the local copy must not bring the banner
      // back; the account read below says whether the request is still open.
    }
    setLocalPendingHeadChange(null);
    await readAccountAgain();
    setCancellingHeadChange(false);
  };

  // Clear cache first so nothing reads a warm copy; then shell reloads members to drop any non-existent pick; then list reloads.
  const afterChange = () => {
    invalidateApiCache();
    void refreshMembers();
    load();
  };

  // After a profile save or merge: clear cache and refresh both shell members and auth profile everywhere.
  const refreshEverywhere = () => {
    invalidateApiCache();
    void refreshMembers();
    void refreshMe();
  };

  const selectMember = (id: string) => {
    setHighlightId(id);
    const card = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-member-id]") ?? []).find(
      element => element.dataset.memberId === id,
    );
    card?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  };

  const addStatement = () => {
    if (members.length > 0) setPicking(true);
    else openImport();
  };

  const openAccountInfo = () => {
    setEditingId(null);
    void navigate(paths.profilePersonal());
  };

  const deleteFunds = async (removeMember: boolean) => {
    if (!fundsFor) return;
    setFundsPending(true);
    setFundsError(null);
    try {
      await deleteMemberPortfolio(fundsFor.id, removeMember);
      setFundsFor(null);
      afterChange();
    } catch {
      setFundsError("Could not delete these funds. Please try again.");
    } finally {
      setFundsPending(false);
    }
  };

  return (
    <>
      <ProfileFrame>
        {me === null || list.status === "loading" ? (
          <div data-testid="family-loading" aria-busy="true" className="space-y-4">
            <div className="h-36 animate-pulse rounded-[14px] bg-[var(--ui-card)]" />
            <div className="h-28 animate-pulse rounded-[14px] bg-[var(--ui-card)]" />
            <div className="h-28 animate-pulse rounded-[14px] bg-[var(--ui-card)]" />
            <div className="h-28 animate-pulse rounded-[14px] bg-[var(--ui-card)]" />
          </div>
        ) : list.status === "error" ? (
          <div
            data-testid="family-error"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-4 py-3 text-sm text-[var(--warn-text)]"
          >
            <div className="flex items-center gap-2">
              <TriangleAlert size={16} aria-hidden="true" />
              <span>Could not load your family members.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setList({ status: "loading", members: [] });
                load();
              }}
              className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {history.failed ? (
              <p role="alert" className="text-sm text-[var(--neg-text)]">
                Could not load your statements, so deleting funds is unavailable right now. Please try again later.
              </p>
            ) : null}
            <FamilyStrip
              members={members}
              onManage={() => listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
              onAddStatement={addStatement}
              onSelect={selectMember}
            />
            {showPendingBanner && pendingHeadChange ? (
              <div
                data-testid="head-change-pending-banner"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-4 py-3 text-sm text-[var(--ui-text)]"
              >
                <span>
                  {`A Head of Family change is waiting for codes. ${formatCountdown(bannerSeconds)} left.`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={cancellingHeadChange}
                    onClick={() => void handleCancelPendingHeadChange()}
                    className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
                  >
                    Cancel
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={cancellingHeadChange}
                    onClick={() =>
                      // Hand over the time that is left now, not the number the account was read with.
                      setHeadDialog({
                        open: true,
                        initialRequest: { ...pendingHeadChange, expires_in_seconds: bannerSeconds },
                      })
                    }
                  >
                    Continue
                  </Button>
                </div>
              </div>
            ) : null}
            <section
              ref={listRef}
              data-testid="family-list"
              className="rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg font-semibold text-[var(--ui-text)]">
                    Family Members
                  </h2>
                  <p className="mt-1 text-sm text-[var(--shell-text-body)]">
                    The people whose portfolios you track. Add a statement to bring in their funds.
                  </p>
                </div>
                {isHead && !showPendingBanner ? (
                  <Button
                    type="button"
                    onClick={() => setHeadDialog({ open: true, initialRequest: null })}
                  >
                    Change Head of Family
                  </Button>
                ) : null}
              </div>
              {members.length === 0 ? (
                <p data-testid="family-empty" className="mt-4 text-sm text-[var(--shell-text-body)]">
                  No family members yet. Add a statement and we will find the people in it.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {members.map((member, index) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      tone={index}
                      accountPhone={me.phone_number}
                      accountEmail={me.email}
                      highlighted={highlightId === member.id}
                      deleteFundsDisabled={history.failed}
                      onEdit={() => setEditingId(member.id)}
                      onChangeInAccountInfo={openAccountInfo}
                      onDeleteMember={() => setMemberToDelete(member)}
                      onDeleteFunds={() => {
                        setFundsError(null);
                        setFundsFor(member);
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </ProfileFrame>

      {picking ? (
        <AddStatementDialog
          members={members}
          onPick={member => {
            setPicking(false);
            openImport(member.id);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}

      {me && editing ? (
        <CompleteProfileDialog
          key={editing.id}
          member={editing}
          accountPhone={me.phone_number}
          accountEmail={me.email}
          onChangeInAccountInfo={openAccountInfo}
          onSaved={saved => {
            setList(current => ({
              ...current,
              members: current.members.map(member => (member.id === saved.id ? saved : member)),
            }));
            refreshEverywhere();
          }}
          onMerged={() => {
            setEditingId(null);
            refreshEverywhere();
            load();
          }}
          onClose={() => setEditingId(null)}
        />
      ) : null}

      {memberToDelete ? (
        <DeleteMemberDialog
          member={memberToDelete}
          onClose={() => setMemberToDelete(null)}
          onDeleted={() => {
            setMemberToDelete(null);
            afterChange();
          }}
        />
      ) : null}

      {fundsFor ? (
        <DeletePortfolioDialog
          member={fundsFor}
          statementsCount={statementCount(fundsFor.id, history.rows)}
          pending={fundsPending}
          error={fundsError}
          onKeep={() => {
            setFundsFor(null);
            setFundsError(null);
          }}
          onDelete={removeMember => void deleteFunds(removeMember)}
        />
      ) : null}

      {headDialog.open ? (
        <ChangeHeadDialog
          members={members}
          initialRequest={headDialog.initialRequest}
          onClose={openRequest => {
            setHeadDialog({ open: false, initialRequest: null });
            // A request that was just made may not have reached the dialog (a lost reply), so the
            // account is read again on every close, not only when a request is handed back.
            if (openRequest) setLocalPendingHeadChange(openRequest);
            void readAccountAgain();
          }}
          onCancelled={() => setLocalPendingHeadChange(null)}
        />
      ) : null}
    </>
  );
}
