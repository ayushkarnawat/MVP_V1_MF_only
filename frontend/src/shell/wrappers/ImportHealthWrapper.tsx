import { useLocation, useNavigate } from "react-router";
import { ImportHealth } from "../../features/dev/ImportHealth";
import { useScope } from "../scope/ScopeContext";
import { paths } from "../nav/paths";

export default function ImportHealthWrapper() {
  const { viewMode, memberId } = useScope();
  const navigate = useNavigate();
  const { key } = useLocation();
  // Profile is the registry's only entry point to this route. In-app, a real Back pops straight to it (a push to
  // /profile would leave this page one browser Back away, a loop). A deep link or refresh has no history entry
  // to pop to ("default" key), so it replaces itself with Profile instead.
  const onBack = () => { void (key === "default" ? navigate(paths.profile(), { replace: true }) : navigate(-1)); };
  return <ImportHealth memberId={viewMode === "member" ? memberId ?? undefined : undefined} onBack={onBack} />;
}
