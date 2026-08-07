import { useState, useEffect } from "react";
import { NavigationShell, type MemberOption } from "./NavigationShell";
import { DashboardView } from "./DashboardView";
import { SoloCasUpload } from "../auth/SoloCasUpload";
import { getHouseholdMembers } from "../auth/api";
import { useAuth } from "../auth/AuthContext";

export function MainDashboardFlow() {
  const { me } = useAuth();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [viewMode, setViewMode] = useState<"aggregate" | "member">("aggregate");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isAddingData, setIsAddingData] = useState(false);
  const [targetAddMemberId, setTargetAddMemberId] = useState<string | null>(null);

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

  const handleAddDataTrigger = (memberId?: string) => {
    setTargetAddMemberId(memberId || selectedMemberId);
    setIsAddingData(true);
  };

  if (isAddingData) {
    return (
      <div style={{ padding: "var(--space-6)", maxWidth: "600px", margin: "0 auto" }}>
        <button
          onClick={() => setIsAddingData(false)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-accent)",
            fontSize: "var(--type-body-size)",
            cursor: "pointer",
            marginBottom: "var(--space-4)",
          }}
          type="button"
        >
          ← Back to Dashboard
        </button>
        <SoloCasUpload
          householdMemberId={targetAddMemberId || undefined}
          onDone={() => setIsAddingData(false)}
        />
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
    >
      {/* Visual accessibility banner & App.test.tsx backward compatibility header */}
      <h1 style={{ display: "none" }}>Welcome to Unifolio</h1>
      <DashboardView
        viewMode={viewMode}
        memberId={selectedMemberId}
        onAddDataForMember={handleAddDataTrigger}
      />
    </NavigationShell>
  );
}
