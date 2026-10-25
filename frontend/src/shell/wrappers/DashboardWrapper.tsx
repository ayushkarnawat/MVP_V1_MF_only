import { useLocation, useNavigate } from "react-router";
import { DashboardView } from "../../features/dashboard/DashboardView";
import type { DashboardViewProps } from "../../features/dashboard/DashboardView";
import { useAuth } from "../../features/auth/AuthContext";
import { useImport, useScope } from "../scope/ScopeContext";
import { TemporaryMfTabs } from "../nav/TemporaryMfTabs";
import { paths } from "../nav/paths";
import { useAppNavigate } from "../nav/useAppNavigate";

type DashboardNoticeState = { importNotice?: DashboardViewProps["importNotice"]; importNoticeUser?: string | null } | null;

export default function DashboardWrapper() {
  const { viewMode, memberId } = useScope();
  const { openImport } = useImport();
  const { me } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const appNavigate = useAppNavigate();
  const state = location.state as DashboardNoticeState;
  // Browser history survives a logout, so a notice is shown only to the user it was written for (see ImportWrapper).
  const importNotice = me && state?.importNoticeUser === me.user_id ? state.importNotice ?? null : null;
  return <><TemporaryMfTabs /><DashboardView
    importNotice={importNotice}
    onDismissImportNotice={() => { void navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null }); }}
    viewMode={viewMode}
    memberId={memberId}
    onAddDataForMember={openImport}
    onOpenHistory={() => { void appNavigate(paths.mutualFunds.history()); }}
  /></>;
}
