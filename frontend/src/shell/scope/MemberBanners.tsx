import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Pencil } from "lucide-react";
import { useAuth } from "../../features/auth/AuthContext";
import { CompleteProfileDialog } from "../../features/dashboard/members/CompleteProfileDialog";
import { PanConflictBanner } from "../../features/dashboard/members/PanConflictBanner";
import { ProfileNudge } from "../../features/dashboard/members/ProfileNudge";
import { invalidateApiCache } from "../../lib/apiClient";
import { useRegistry } from "../registry/RegistryContext";
import { resolveRoute } from "../nav/resolve";
import { paths } from "../nav/paths";
import { useScope } from "./ScopeContext";

export function MemberBanners() {
  const { me } = useAuth();
  const { members, memberId, viewMode, refreshMembers, setMember } = useScope();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const routes = useRegistry();
  const route = resolveRoute(pathname, routes);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const closeProfile = useCallback(() => setProfileFor(null), []);
  const selectedRaw = members.find(member => member.id === memberId)?.profile;
  const profileMember = members.find(member => member.id === profileFor)?.profile;
  if (viewMode !== "member" || route?.scope !== "family-or-member" || route.id.startsWith("profile") || !selectedRaw) return null;

  return <>
    {profileMember && <CompleteProfileDialog
      key={profileMember.id}
      member={profileMember}
      accountPhone={me?.phone_number ?? null}
      accountEmail={me?.email ?? null}
      onSaved={() => { invalidateApiCache(); void refreshMembers(); }}
      onMerged={async targetId => {
        invalidateApiCache();
        await refreshMembers();
        setMember(targetId);
        setProfileFor(null);
      }}
      onClose={closeProfile}
      onChangeInAccountInfo={() => { setProfileFor(null); void navigate(paths.profile()); }}
    />}
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
  </>;
}
