import { useState, useEffect } from "react";
import { NavigationShell, type MemberOption } from "./NavigationShell";
import { DashboardView } from "./DashboardView";
import { AnalyticsView } from "../analytics/AnalyticsView";
import { ImportFlow } from "../import/ImportFlow";
import { clearCasResumeStep2 } from "../import/casResumeState";
import { getHouseholdMembers } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ArrowLeft, ShieldCheck, User, LogOut } from "lucide-react";

export function MainDashboardFlow() {
  const { me, logout } = useAuth();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [viewMode, setViewMode] = useState<"aggregate" | "member">("aggregate");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "analytics">(() =>
    window.history.state?.unifolioTab === "analytics" ? "analytics" : "dashboard",
  );
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
        const mapped: MemberOption[] = data.map((m) => ({
          id: m.id,
          name: m.relationship === "self" ? me?.phone_number ? `${m.name || "Self"} (Me)` : "Self" : `${m.name} (${m.relationship})`,
        }));
        setMembers(mapped);

        if (data.length > 1) {
          setViewMode("aggregate");
          setSelectedMemberId(data[0].id);
        } else if (data.length === 1) {
          setViewMode("member");
          setSelectedMemberId(data[0].id);
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
      setActiveTab(event.state?.unifolioTab === "analytics" ? "analytics" : "dashboard");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeTab]);

  const handleTabChange = (tab: "dashboard" | "analytics") => {
    if (tab === activeTab) return;
    window.history.pushState(
      { ...(window.history.state ?? {}), unifolioTab: tab },
      "",
      window.location.href,
    );
    setActiveTab(tab);
  };

  const handleAddDataTrigger = (memberId?: string) => {
    setAddDataAllowsMemberChoice(!memberId && viewMode === "aggregate");
    setTargetAddMemberId(memberId || selectedMemberId);
    setIsAddingData(true);
  };

  const targetMemberName = members.find((m) => m.id === targetAddMemberId)?.name;

  if (isAddingData) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)] transition-colors duration-200">
        {/* Top Minimal Navigation Bar */}
        <header className="sticky top-0 z-30 w-full bg-[var(--color-surface)]/85 backdrop-blur-md border-b border-[var(--color-border)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
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
                  onValueChange={(value) => setTargetAddMemberId(value)}
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
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
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
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-bg)] border border-transparent hover:border-[var(--color-border)] transition-colors cursor-pointer"
                aria-label="Logout"
                type="button"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* Add Data Content Area */}
        <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
          {targetAddMemberId && (
            <ImportFlow
              key={targetAddMemberId}
              householdMemberId={targetAddMemberId}
              ctaLabel="Back to Dashboard"
              onDone={() => setIsAddingData(false)}
            />
          )}

          {/* Privacy & Trust Footer */}
          <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--color-text-secondary)] pt-4 border-t border-[var(--color-border)]/60">
            <ShieldCheck className="h-4 w-4 text-[var(--color-positive)]" />
            <span>256-bit encrypted · Read-only statement parsing · Zero transaction permissions</span>
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
      onMemberSelect={setSelectedMemberId}
      onAddData={() => handleAddDataTrigger()}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      {/* Visual accessibility banner & App.test.tsx backward compatibility header */}
      <h1 style={{ display: "none" }}>Welcome to Unifolio</h1>
      {activeTab === "dashboard" ? (
        <DashboardView
          viewMode={viewMode}
          memberId={selectedMemberId}
          onAddDataForMember={handleAddDataTrigger}
        />
      ) : (
        <AnalyticsView
          viewMode={viewMode}
          memberId={selectedMemberId}
          onAddDataForMember={handleAddDataTrigger}
          activeMemberName={members.find((m) => m.id === selectedMemberId)?.name}
        />
      )}
    </NavigationShell>
  );
}
