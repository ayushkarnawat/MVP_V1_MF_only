import { useNavigate } from "react-router";
import { ImportHealth } from "../../features/dev/ImportHealth";
import { useScope } from "../scope/ScopeContext";

export default function ImportHealthWrapper() {
  const { viewMode, memberId } = useScope();
  const navigate = useNavigate();
  return <ImportHealth memberId={viewMode === "member" ? memberId ?? undefined : undefined} onBack={() => { void navigate(-1); }} />;
}
