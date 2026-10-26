import { ProfileView } from "../../features/profile/ProfileView";
import { useAuth } from "../../features/auth/AuthContext";
import { invalidateApiCache } from "../../lib/apiClient";
import { useScope } from "../scope/ScopeContext";
import { paths } from "../nav/paths";
import { useAppNavigate } from "../nav/useAppNavigate";

export default function ProfileWrapper() {
  const { me, logout, requestAccountDeletion, requestContactChange, verifyContactChange } = useAuth();
  const { members, refreshMembers } = useScope();
  const navigate = useAppNavigate();
  return <ProfileView
    onOpenImportHealth={() => { void navigate(paths.importHealth(), { state: { from: "profile" } }); }}
    name={members.find(member => member.name.endsWith("(Me)"))?.name.replace(/\s*\(Me\)$/, "") ?? "Account holder"}
    email={me?.email ?? null}
    phoneNumber={me?.phone_number ?? ""}
    logout={logout}
    requestAccountDeletion={requestAccountDeletion}
    requestContactChange={requestContactChange}
    verifyContactChange={verifyContactChange}
    onMembersChanged={() => { invalidateApiCache(); void refreshMembers(); }}
  />;
}
