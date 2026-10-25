import { useLocation, useNavigate } from "react-router";
import { ImportHealth } from "../../features/dev/ImportHealth";
import { useScope } from "../scope/ScopeContext";
import { paths } from "../nav/paths";

export default function ImportHealthWrapper() {
  const { viewMode, memberId } = useScope();
  const navigate = useNavigate();
  const { state } = useLocation();
  // Profile is the registry's only way in and marks the entry it pushes. Back then pops straight to it, leaving no
  // duplicate Profile entry. Without that mark (a deep link, a refresh of a replaced entry, or an entry an in-page
  // action such as "+ Add data" has rewritten) there is nothing safe to pop to, so Back replaces this entry with
  // Profile: a push would leave this page one browser Back away, and navigate(-1) could leave the app.
  const fromProfile = !!state && typeof state === "object" && "from" in state && state.from === "profile";
  const onBack = () => { void (fromProfile ? navigate(-1) : navigate(paths.profile(), { replace: true })); };
  return <ImportHealth memberId={viewMode === "member" ? memberId ?? undefined : undefined} onBack={onBack} />;
}
