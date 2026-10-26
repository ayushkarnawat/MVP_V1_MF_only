import { HistoryView } from "../../features/history/HistoryView";
import { useScope } from "../scope/ScopeContext";
import { TemporaryMfTabs } from "../nav/TemporaryMfTabs";

export default function HistoryWrapper() {
  const { viewMode, memberId, members } = useScope();
  const member = members.find(value => value.id === memberId);
  return <><TemporaryMfTabs /><HistoryView viewMode={viewMode} memberId={memberId} memberName={member?.profile?.name ?? member?.name} /></>;
}
