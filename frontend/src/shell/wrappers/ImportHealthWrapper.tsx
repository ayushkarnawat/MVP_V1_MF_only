import { useNavigate } from "react-router";
import { ImportHealth } from "../../features/dev/ImportHealth";
import { useScope } from "../scope/ScopeContext";
import { paths } from "../nav/paths";

export default function ImportHealthWrapper() {
  const { viewMode, memberId } = useScope();
  const navigate = useNavigate();
  // Registry's only entry point to this route is Profile, so Back always lands there
  // rather than navigate(-1), which does nothing on a deep-linked/fresh history stack.
  return <ImportHealth memberId={viewMode === "member" ? memberId ?? undefined : undefined} onBack={() => { void navigate(paths.profile()); }} />;
}
