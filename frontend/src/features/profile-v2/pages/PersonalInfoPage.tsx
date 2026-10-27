import { useCallback, useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { listHouseholdMembers } from "@/features/auth/api";
import { useAuth } from "@/features/auth/AuthContext";
import type { HouseholdMember } from "@/features/auth/types";
import { CompleteProfileDialog } from "@/features/dashboard/members/CompleteProfileDialog";
import { invalidateApiCache } from "@/lib/apiClient";
import { useScope } from "@/shell/scope/ScopeContext";
import { ProfileFrame } from "../ProfileFrame";
import { FinancialDetailsCard } from "../components/FinancialDetailsCard";
import { HeaderCard, type HouseholdStatus } from "../components/HeaderCard";
import { PersonalInfoCard } from "../components/PersonalInfoCard";

export default function PersonalInfoPage() {
  const { me, refreshMe } = useAuth();
  const { refreshMembers } = useScope();

  const [household, setHousehold] = useState<{
    status: HouseholdStatus;
    members: HouseholdMember[];
  }>({
    status: "loading",
    members: [],
  });
  const [editing, setEditing] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const request = ++requestRef.current;
    listHouseholdMembers()
      .then(members => {
        if (requestRef.current === request) {
          setHousehold({ status: "ready", members });
        }
      })
      .catch(() => {
        if (requestRef.current === request) {
          setHousehold({ status: "error", members: [] });
        }
      });
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  const self = household.members.find(member => member.relationship === "self");

  const refreshEverywhere = () => {
    invalidateApiCache();
    void refreshMembers();
    void refreshMe();
  };

  return (
    <>
      <ProfileFrame>
        {me === null ? (
          <div
            data-testid="personal-loading"
            aria-busy="true"
            className="space-y-4"
          >
            <div className="h-40 animate-pulse rounded-[14px] bg-[var(--ui-card)]" />
            <div className="h-48 animate-pulse rounded-[14px] bg-[var(--ui-card)]" />
          </div>
        ) : (
          <div className="space-y-5">
            {household.status === "error" ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-4 py-3 text-sm text-[var(--warn-text)]"
              >
                <div className="flex items-center gap-2">
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span>
                    Could not load your household. Your name, email and phone
                    are still shown.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHousehold({ status: "loading", members: [] });
                    load();
                  }}
                  className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
                >
                  Retry
                </button>
              </div>
            ) : null}

            <HeaderCard
              me={me}
              members={household.members}
              status={household.status}
              onEditProfile={() => setEditing(true)}
            />

            <div className="grid items-start gap-5 lg:grid-cols-2">
              <PersonalInfoCard email={me.email} phone={me.phone_number} />
              <FinancialDetailsCard
                investorType={me.investor_type}
                goals={me.primary_goals}
              />
            </div>
          </div>
        )}
      </ProfileFrame>

      {me && editing && self ? (
        <CompleteProfileDialog
          member={self}
          accountPhone={me.phone_number}
          accountEmail={me.email}
          onSaved={saved => {
            setHousehold(current => ({
              ...current,
              members: current.members.map(member =>
                member.id === saved.id ? saved : member
              ),
            }));
            refreshEverywhere();
          }}
          onMerged={() => {
            refreshEverywhere();
            load();
          }}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
