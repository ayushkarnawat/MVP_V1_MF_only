import { AnalyticsView } from "../../features/analytics/AnalyticsView";
import { useImport, useScope } from "../scope/ScopeContext";
import { TemporaryMfTabs } from "../nav/TemporaryMfTabs";

export default function AnalyticsWrapper() {
  const { viewMode, memberId, members } = useScope();
  const { openImport } = useImport();
  return <><TemporaryMfTabs /><AnalyticsView viewMode={viewMode} memberId={memberId} onAddDataForMember={openImport} activeMemberName={members.find(member => member.id === memberId)?.name} /></>;
}
