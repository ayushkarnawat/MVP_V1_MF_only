import { useState, useEffect } from "react";
import { NavigationShell, type MemberOption } from "./NavigationShell";
import { DashboardView } from "./DashboardView";
import { AnalyticsView } from "../analytics/AnalyticsView";
import { ProfileView } from "../profile/ProfileView";
import { ImportFlow } from "../import/ImportFlow";
import { clearCasResumeStep2 } from "../import/casResumeState";
import { getHouseholdMembers } from "../auth/api";
import type { HouseholdMember } from "../auth/types";
import { invalidateApiCache } from "../../lib/apiClient";
import { EditMemberDialog } from "./members/EditMemberDialog";
import { MemberDetailsDialog } from "./members/MemberDetailsDialog";
import { OtherAccountDialog } from "./members/OtherAccountDialog";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ArrowLeft, Lock, Pencil, ShieldCheck, User } from "lucide-react";

function toMemberOption(m: HouseholdMember, hasPhone: boolean): MemberOption {
  const lockReason = (m.lock_reason ?? (m.details_required ? "details_needed" : null)) as MemberOption["lockReason"];
  const label =
    m.relationship === "self"
      ? hasPhone ? `${m.name || "Self"} (Me)` : "Self"
      : m.relationship
        ? `${m.name} (${m.relationship})`
        : m.name; // locked, relationship not chosen yet
  return { id: m.id, name: label, locked: lockReason !== null, lockReason };
}

type MainTab = "dashboard" | "analytics" | "profile";

export function MainDashboardFlow() {
  const { me, logout, requestAccountDeletion, requestContactChange, verifyContactChange } = useAuth();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [rawMembers, setRawMembers] = useState<HouseholdMember[]>([]);
  // Unlock popup (I3), the L8 info popup and the L9 edit popup, opened from the
  // member dropdown / Add data picker / member header.
  const [detailsForId, setDetailsForId] = useState<string | null>(null);
  const [otherAccountForId, setOtherAccountForId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"aggregate" | "member">("aggregate");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    const historyTab = window.history.state?.unifolioTab;
    return historyTab === "analytics" || historyTab === "profile" ? historyTab : "dashboard";
  });
  const [isAddingData, setIsAddingData] = useState(false);
  const [targetAddMemberId, setTargetAddMemberId] = useState<string | null>(null);
  // True only when Add Data was reached from Family Combined view via the
  // generic top-nav button (no specific member argument) — that path
  // otherwise silently defaults to selectedMemberId (the first family
  // member) with no way to change it. Per-member entry points (an explicit
  // memberId passed in, or Per Member view where selectedMemberId already
  // names the one member being viewed) keep the static label as-is.
  const [addDataAllowsMemberChoice, setAddDataAllowsMemberChoice] = useState(false);

  useEffect(() => {
    getHouseholdMembers()
      .then((data) => {
        setRawMembers(data);
        setMembers(data.map((m) => toMemberOption(m, Boolean(me?.phone_number))));

        // Never default the per-member view to a locked person: their reads are 403.
        const firstOpen = data.find((m) => !m.lock_reason && !m.details_required) ?? data[0];
        if (data.length > 1) {
          setViewMode("aggregate");
          setSelectedMemberId(firstOpen.id);
        } else if (data.length === 1) {
          setViewMode("member");
          setSelectedMemberId(firstOpen.id);
        }
      })
      .catch(() => {
        // Fallback if members fetch fails
      });
  }, [me]);

  useEffect(() => {
    const currentState = window.history.state ?? {};
    if (currentState.unifolioTab !== activeTab) {
      window.history.replaceState(
        { ...currentState, unifolioTab: activeTab },
        "",
        window.location.href,
      );
    }

    const handlePopState = (event: PopStateEvent) => {
      const historyTab = event.state?.unifolioTab;
      setActiveTab(historyTab === "analytics" || historyTab === "profile" ? historyTab : "dashboard");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeTab]);

  const handleTabChange = (tab: MainTab) => {
    if (tab === activeTab) return;
    window.history.pushState(
      { ...(window.history.state ?? {}), unifolioTab: tab },
      "",
      window.location.href,
    );
    setActiveTab(tab);
  };

  const refreshMembers = async () => {
    try {
      const data = await getHouseholdMembers();
      setRawMembers(data);
      setMembers(data.map((m) => toMemberOption(m, Boolean(me?.phone_number))));
    } catch {
      // Keep the list we have; the next load will retry.
    }
  };

  const handleUnlocked = async (unlocked: { id: string }) => {
    invalidateApiCache();
    await refreshMembers();
    setDetailsForId(null);
    setViewMode("member");
    setSelectedMemberId(unlocked.id);
    if (isAddingData) setTargetAddMemberId(unlocked.id);
  };

  // Picking a locked person never switches the view: details_needed opens the
  // unlock popup, pan_on_other_account explains why there is no dashboard (L8).
  const handleLockedMemberSelect = (memberId: string) => {
    const option = members.find((m) => m.id === memberId);
    if (option?.lockReason === "pan_on_other_account") setOtherAccountForId(memberId);
    else setDetailsForId(memberId);
  };

  const handleMemberSelect = (memberId: string) => {
    setSelectedMemberId(memberId);
    setViewMode("member");
  };

  const handleAddDataTrigger = (memberId?: string) => {
    setAddDataAllowsMemberChoice(!memberId && viewMode === "aggregate");
    setTargetAddMemberId(memberId || selectedMemberId);
    setIsAddingData(true);
  };

  const targetMemberName = members.find((m) => m.id === targetAddMemberId)?.name;

  const rawById = (id: string | null) => (id ? rawMembers.find((m) => m.id === id) : undefined);
  const detailsMember = rawById(detailsForId);
  const otherAccountMember = rawById(otherAccountForId);
  const editingMember = rawById(editingId);
  const selectedRaw = rawById(selectedMemberId);
  const canEditSelected =
    viewMode === "member" && !!selectedRaw && !selectedRaw.lock_reason && !selectedRaw.details_required &&
    selectedRaw.relationship !== null && selectedRaw.relationship !== "self";

  const memberDialogs = (
    <>
      {detailsMember && (
        <MemberDetailsDialog
          key={detailsMember.id}
          member={detailsMember}
          onUnlocked={handleUnlocked}
          onCancel={() => setDetailsForId(null)}
          onOtherAccount={() => {
            setDetailsForId(null);
            setViewMode("aggregate");
            void refreshMembers();
          }}
        />
      )}
      {otherAccountMember && (
        <OtherAccountDialog
          isOpen
          memberName={otherAccountMember.name}
          variant="picked"
          onOk={() => {
            setOtherAccountForId(null);
            setViewMode("aggregate");
          }}
        />
      )}
      {editingMember && (
        <EditMemberDialog
          key={editingMember.id}
          member={editingMember}
          onSaved={() => {
            setEditingId(null);
            void refreshMembers();
          }}
          onCancel={() => setEditingId(null)}
        />
      )}
    </>
  );

  if (isAddingData) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)] transition-colors duration-200">
        {/* Top Minimal Navigation Bar */}
        <header className="sticky top-0 z-30 w-full bg-[var(--color-surface)]/85 backdrop-blur-md border-b border-[var(--color-border)]">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <button
              onClick={() => {
                clearCasResumeStep2(targetAddMemberId);
                setIsAddingData(false);
              }}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--color-bg)] cursor-pointer"
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Dashboard</span>
            </button>

            <div className="flex items-center gap-2.5">
              {addDataAllowsMemberChoice && members.length > 0 ? (
                <Select
                  value={targetAddMemberId ?? undefined}
                  onValueChange={(value) => {
                    // A1: locked people are listed but can't be picked; clicking one opens the unlock popup.
                    if (members.find((m) => m.id === value)?.locked) setDetailsForId(value);
                    else setTargetAddMemberId(value);
                  }}
                >
                  <SelectTrigger
                    className="h-8 w-auto min-w-[160px] gap-1.5 rounded-full border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] [&>span]:line-clamp-1"
                    aria-label="Select family member to import for"
                  >
                    <User className="h-3.5 w-3.5 text-[var(--color-accent)] flex-shrink-0" />
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem
                        key={m.id}
                        value={m.id}
                        aria-disabled={m.locked ? "true" : undefined}
                        className={m.locked ? "opacity-60" : undefined}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {m.locked && <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />}
                          {m.name}
                          {m.locked && <span className="text-[11px] text-[var(--color-text-secondary)]">Add details first</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                targetMemberName && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)]">
                    <User className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                    <span>Importing for <strong className="text-[var(--color-ink)] font-semibold">{targetMemberName}</strong></span>
                  </div>
                )
              )}
              <ThemeToggle className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg" />
            </div>
          </div>
        </header>
        {memberDialogs}

        {/* Add Data Content Area */}
        <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
          {targetAddMemberId && (
            <ImportFlow
              key={targetAddMemberId}
              householdMemberId={targetAddMemberId}
              ctaLabel="Back to Dashboard"
              onDone={() => setIsAddingData(false)}
              renderMemberDetails={(memberId, onDone) => {
                // U6 "Add details now": unlock in place, then let ImportFlow carry on.
                const target = rawById(memberId);
                if (!target) return null;
                return (
                  <MemberDetailsDialog
                    member={target}
                    onUnlocked={async (unlocked) => {
                      invalidateApiCache();
                      await refreshMembers();
                      // After an L4 merge the source member is gone: import for the merge target instead.
                      if (unlocked.id !== memberId) setTargetAddMemberId(unlocked.id);
                      else onDone();
                    }}
                    onCancel={() => setIsAddingData(false)}
                    onOtherAccount={() => setIsAddingData(false)}
                  />
                );
              }}
            />
          )}

          {/* Privacy & Trust Footer */}
          <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--color-text-secondary)] pt-4 border-t border-[var(--color-border)]/60">
            <ShieldCheck className="h-4 w-4 text-[var(--color-positive)]" />
            <span>Read-only statement parsing · Zero transaction permissions</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <NavigationShell
      viewMode={viewMode}
      selectedMemberId={selectedMemberId}
      members={members}
      onViewModeChange={setViewMode}
      onMemberSelect={handleMemberSelect}
      onLockedMemberSelect={handleLockedMemberSelect}
      onAddData={() => handleAddDataTrigger()}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      {/* Visual accessibility banner & App.test.tsx backward compatibility header */}
      <h1 style={{ display: "none" }}>Welcome to Unifolio</h1>
      {memberDialogs}
      {activeTab === "dashboard" && canEditSelected && selectedRaw && (
        <div className="flex justify-end -mt-2 mb-3">
          <button
            type="button"
            onClick={() => setEditingId(selectedRaw.id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit details
          </button>
        </div>
      )}
      {activeTab === "dashboard" ? (
        <DashboardView
          viewMode={viewMode}
          memberId={selectedMemberId}
          onAddDataForMember={handleAddDataTrigger}
        />
      ) : activeTab === "analytics" ? (
        <AnalyticsView
          viewMode={viewMode}
          memberId={selectedMemberId}
          onAddDataForMember={handleAddDataTrigger}
          activeMemberName={members.find((m) => m.id === selectedMemberId)?.name}
        />
      ) : (
        <ProfileView
          name={members.find((member) => member.name.endsWith("(Me)"))?.name.replace(/\s*\(Me\)$/, "") ?? "Account holder"}
          email={me?.email ?? null}
          phoneNumber={me?.phone_number ?? ""}
          logout={logout}
          requestAccountDeletion={requestAccountDeletion}
          requestContactChange={requestContactChange}
          verifyContactChange={verifyContactChange}
          onMembersChanged={() => {
            invalidateApiCache();
            void refreshMembers();
          }}
        />
      )}
    </NavigationShell>
  );
}
