import { useLocation, useNavigate } from "react-router";
import { DashboardView } from "../../features/dashboard/DashboardView";
import type { DashboardViewProps } from "../../features/dashboard/DashboardView";
import { useImport, useScope } from "../scope/ScopeContext";
import { TemporaryMfTabs } from "../nav/TemporaryMfTabs";
import { paths } from "../nav/paths";
import { useAppNavigate } from "../nav/useAppNavigate";

export default function DashboardWrapper() {
  const { viewMode, memberId } = useScope();
  const { openImport } = useImport();
  const location = useLocation();
  const navigate = useNavigate();
  const appNavigate = useAppNavigate();
  const importNotice = (location.state as { importNotice?: DashboardViewProps["importNotice"] } | null)?.importNotice ?? null;
  return <><TemporaryMfTabs /><DashboardView
    importNotice={importNotice}
    onDismissImportNotice={() => { void navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null }); }}
    viewMode={viewMode}
    memberId={memberId}
    onAddDataForMember={openImport}
    onOpenHistory={() => { void appNavigate(paths.mutualFunds.history()); }}
  /></>;
}
