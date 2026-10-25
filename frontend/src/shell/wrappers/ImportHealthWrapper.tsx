import { useNavigate } from "react-router";
import { ImportHealth } from "../../features/dev/ImportHealth";
import { useScope } from "../scope/ScopeContext";
import { paths } from "../nav/paths";

export default function ImportHealthWrapper() {
  const { viewMode, memberId } = useScope();
  const navigate = useNavigate();
  // Profile is the registry's only entry point to this route, so Back always replaces this entry with Profile.
  // A push would leave this page one browser Back away (a loop), and navigate(-1) can land somewhere else or leave
  // the app once an in-page action (such as "+ Add data") has changed this entry's key.
  const onBack = () => { void navigate(paths.profile(), { replace: true }); };
  return <ImportHealth memberId={viewMode === "member" ? memberId ?? undefined : undefined} onBack={onBack} />;
}
