import { useCallback, useEffect, useMemo, useState } from "react";
import { getHouseholdMembers } from "../auth/api";
import type { HouseholdMember } from "../auth/types";
import { deleteMemberPortfolio, getHouseholdImportHistory } from "../import/api";
import type { DeleteImportResponse, HouseholdImportHistoryItem } from "../import/types";
import { CompleteProfileDialog } from "../dashboard/members/CompleteProfileDialog";
import { DeletePortfolioDialog } from "./DeletePortfolioDialog";
import { FamilyMemberCard } from "./FamilyMemberCard";

interface HouseholdMembersSectionProps {
  loadMembers?: () => Promise<HouseholdMember[]>;
  loadImportHistory?: () => Promise<HouseholdImportHistoryItem[]>;
  deletePortfolio?: (memberId: string, removeMember: boolean) => Promise<DeleteImportResponse>;
  /** The account holder's contact, shown read-only on the self card. */
  accountPhone?: string;
  accountEmail?: string | null;
  /** Called after a portfolio was deleted, so the page can refresh anything that shows members or funds. */
  onChanged?: () => void;
  /** Self's "Change in Account Info": the page switches to its Account Info section. */
  onChangeInAccountInfo?: () => void;
}

/** How many statements a member's funds come from: rows of one upload group count once. */
export function statementsFor(memberId: string, history: HouseholdImportHistoryItem[]): number {
  return new Set(history.filter((h) => h.household_member_id === memberId).map((h) => h.upload_group_id ?? h.import_id)).size;
}

// M17: "a member's whole portfolio". The spec says "a member's menu" but doesn't place it;
// the plan puts it on the profile page next to Import History.
export function HouseholdMembersSection({
  loadMembers = getHouseholdMembers,
  loadImportHistory = getHouseholdImportHistory,
  deletePortfolio = deleteMemberPortfolio,
  accountPhone,
  accountEmail,
  onChanged,
  onChangeInAccountInfo,
}: HouseholdMembersSectionProps) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [history, setHistory] = useState<HouseholdImportHistoryItem[]>([]);
  // If the history can't load the statement count is unknown; never show it as 0.
  const [historyFailed, setHistoryFailed] = useState(false);
  const [selected, setSelected] = useState<HouseholdMember | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      let failed = false;
      const [m, h] = await Promise.all([
        loadMembers(),
        loadImportHistory().catch(() => {
          failed = true;
          return [] as HouseholdImportHistoryItem[];
        }),
      ]);
      setMembers(m);
      setHistory(h);
      setHistoryFailed(failed);
    },
    [loadMembers, loadImportHistory],
  );

  // Stable identity: the success popup's 2.5 s timer restarts whenever its onDone changes,
  // and onSaved re-renders this section (final review M-4).
  const closeProfile = useCallback(() => {
    setProfileFor(null);
    onChanged?.();
  }, [onChanged]);

  useEffect(() => {
    let active = true;
    load().catch(() => active && setMembers([]));
    return () => { active = false; };
  }, [load]);

  if (members.length === 0) return null;
  const profileMember = members.find((m) => m.id === profileFor) ?? null;

  const close = () => {
    setSelected(null);
    setError(null);
  };

  return (
    <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
      <h2 className="font-display text-lg font-semibold">Family Members</h2>
      {historyFailed && (
        <p role="alert" className="text-sm text-[var(--color-negative)]">
          Could not load your statements, so deleting funds is unavailable right now. Please try again later.
        </p>
      )}
      <div className="space-y-3">
        {members.map((m) => (
          <FamilyMemberCard
            key={m.id}
            member={m}
            accountPhone={accountPhone}
            accountEmail={accountEmail}
            deleteDisabled={historyFailed}
            onOpenProfile={() => setProfileFor(m.id)}
            onChangeInAccountInfo={onChangeInAccountInfo}
            onDeleteFunds={() => {
              setError(null);
              setSelected(m);
            }}
          />
        ))}
      </div>
      {profileMember && (
        <CompleteProfileDialog
          key={profileMember.id}
          member={profileMember}
          accountPhone={accountPhone}
          accountEmail={accountEmail}
          onChangeInAccountInfo={onChangeInAccountInfo}
          // Never unmount from onSaved: the dialog still shows its own warning/success stage.
          onSaved={(saved) => setMembers((ms) => ms.map((x) => (x.id === saved.id ? saved : x)))}
          onMerged={() => { setProfileFor(null); void load().catch(() => undefined); onChanged?.(); }}
          onClose={closeProfile}
        />
      )}
      {selected && (
        <DeletePortfolioDialog
          member={selected}
          statementsCount={statementsFor(selected.id, history)}
          pending={pending}
          error={error}
          onKeep={close}
          onDelete={async (removeMember) => {
            setPending(true);
            setError(null);
            try {
              await deletePortfolio(selected.id, removeMember);
              close();
              await load().catch(() => undefined);
              onChanged?.();
            } catch {
              setError("Could not delete these funds. Please try again.");
            } finally {
              setPending(false);
            }
          }}
        />
      )}
    </section>
  );
}
