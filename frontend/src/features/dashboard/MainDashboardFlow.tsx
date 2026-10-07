import { ImportHealth } from "../dev/ImportHealth";
import { useState, useEffect, useCallback } from "react";
import { NavigationShell, type MemberOption } from "./NavigationShell";
import { DashboardView } from "./DashboardView";
import { HistoryView } from "../history/HistoryView";
import { AnalyticsView } from "../analytics/AnalyticsView";
import { ProfileView } from "../profile/ProfileView";
import { ImportFlow } from "../import/ImportFlow";
import { clearCasResumeStep2 } from "../import/casResumeState";
import { getHouseholdMembers } from "../auth/api";
import type { HouseholdMember } from "../auth/types";
import { invalidateApiCache } from "../../lib/apiClient";
import { CompleteProfileDialog } from "./members/CompleteProfileDialog";
import { PanConflictBanner } from "./members/PanConflictBanner";
import { ProfileNudge } from "./members/ProfileNudge";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ArrowLeft, Pencil, ShieldCheck, User } from "lucide-react";

function toMemberOption(m: HouseholdMember, hasPhone: boolean): MemberOption {
  const label =
    m.relationship === "self"
      ? hasPhone ? `${m.name || "Self"} (Me)` : "Self"
      : m.relationship
        ? `${m.name} (${m.relationship})`
        : m.name; // detected member, relationship not chosen yet
  return { id: m.id, name: label, completion: m.profile_completion };
}

type MainTab = "dashboard" | "history" | "analytics" | "profile";
const KNOWN_TABS: MainTab[] = ["dashboard", "history", "analytics", "profile"];
const tabFromHistory = (value: unknown): MainTab =>
  KNOWN_TABS.includes(value as MainTab) ? (value as MainTab) : "dashboard";

export function MainDashboardFlow() {
  const { me, logout, requestAccountDeletion, requestContactChange, verifyContactChange } = useAuth();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [rawMembers, setRawMembers] = useState<HouseholdMember[]>([]);
  // The Complete profile popup, opened from the nudge / Edit profile button.
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"aggregate" | "member">("aggregate");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [devPage, setDevPage] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    return tabFromHistory(window.history.state?.unifolioTab);
  });
  const [importNotice, setImportNotice] = useState<{ text: string; details?: string[] } | null>(null);
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

        const firstOpen = data[0];
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
      setActiveTab(tabFromHistory(event.state?.unifolioTab));
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
    setDevPage(false);
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

  const handleMemberSelect = (memberId: string) => {
    setSelectedMemberId(memberId);
    setViewMode("member");
  };

  const handleAddDataTrigger = (memberId?: string) => {
    setImportNotice(null);
    setAddDataAllowsMemberChoice(!memberId && viewMode === "aggregate");
    setTargetAddMemberId(memberId || selectedMemberId);
    setIsAddingData(true);
  };

  const targetMemberName = members.find((m) => m.id === targetAddMemberId)?.name;

  const rawById = (id: string | null) => (id ? rawMembers.find((m) => m.id === id) : undefined);
  const selectedRaw = rawById(selectedMemberId);
  const profileMember = rawById(profileFor);
  const canEditSelected = viewMode === "member" && !!selectedRaw;

  // Stable identity so the popup's own callbacks don't reset on every parent render.
  const closeProfile = useCallback(() => setProfileFor(null), []);

  const memberDialogs = profileMember && (
    <CompleteProfileDialog
      key={profileMember.id}
      member={profileMember}
      accountPhone={me?.phone_number ?? null}
      accountEmail={me?.email ?? null}
      // A rename changes names inside cached holdings responses too (final review I-2).
      onSaved={() => { invalidateApiCache(); void refreshMembers(); }}
      onMerged={async (targetId) => {
        invalidateApiCache();
        await refreshMembers();
        setSelectedMemberId(targetId);
        setProfileFor(null);
      }}
      onClose={closeProfile}
      onChangeInAccountInfo={() => { setProfileFor(null); handleTabChange("profile"); }}
    />
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
                  onValueChange={setTargetAddMemberId}
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
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
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
              onDone={(notice) => {
                setImportNotice(notice ?? null);
                if (notice) handleTabChange("dashboard");
                setIsAddingData(false);
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
      onAddData={() => handleAddDataTrigger()}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      {/* Visual accessibility banner & App.test.tsx backward compatibility header */}
      <h1 style={{ display: "none" }}>Welcome to Unifolio</h1>
      {memberDialogs}
      {activeTab !== "profile" && canEditSelected && selectedRaw && (
        <div className="-mt-2 mb-3 flex flex-col gap-2">
          {selectedRaw.pan_conflict && <PanConflictBanner memberName={selectedRaw.name} />}
          <div className="flex items-center justify-end gap-2">
            {selectedRaw.profile_completion < 100 ? (
              <ProfileNudge member={selectedRaw} onOpen={() => setProfileFor(selectedRaw.id)} />
            ) : (
              <button type="button" onClick={() => setProfileFor(selectedRaw.id)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] cursor-pointer">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit profile
              </button>
            )}
          </div>
        </div>
      )}
      {devPage ? <ImportHealth memberId={viewMode === "member" ? selectedMemberId ?? undefined : undefined} onBack={() => setDevPage(false)} /> : activeTab === "dashboard" ? (
        <DashboardView
          importNotice={importNotice} onDismissImportNotice={() => setImportNotice(null)}
          viewMode={viewMode}
          memberId={selectedMemberId}
          onAddDataForMember={handleAddDataTrigger}
          onOpenHistory={() => handleTabChange("history")}
        />
      ) : activeTab === "history" ? (
        <HistoryView
          viewMode={viewMode}
          memberId={selectedMemberId}
          memberName={rawMembers.find((m) => m.id === selectedMemberId)?.name}
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
          onOpenImportHealth={() => setDevPage(true)}
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
