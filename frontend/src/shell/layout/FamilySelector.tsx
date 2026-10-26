import { useLocation } from "react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useScope } from "../scope/ScopeContext";
import { useRegistry } from "../registry/RegistryContext";
import { resolveRoute } from "../nav/resolve";

export function FamilySelector() {
  const scope = useScope();
  const { pathname } = useLocation();
  const routes = useRegistry();
  if (resolveRoute(pathname, routes)?.scope !== "family-or-member" || scope.members.length === 0) return null;
  const single = scope.members.length === 1;
  const value = single ? scope.members[0].id : scope.viewMode === "aggregate" ? "aggregate" : scope.memberId ?? "aggregate";
  return <Select value={value} onValueChange={id => id === "aggregate" ? scope.setAggregate() : scope.setMember(id)}>
    <SelectTrigger aria-label="Portfolio scope" className="w-48 border-[var(--shell-border-input)] bg-[var(--shell-card)] font-body text-[var(--shell-text)] focus:ring-[var(--shell-accent)]"><SelectValue /></SelectTrigger>
    <SelectContent className="border-[var(--shell-divider)] bg-[var(--shell-card)] text-[var(--shell-text)]">
      {!single && <SelectItem value="aggregate" className="text-[var(--shell-text)] focus:bg-[var(--shell-page)] focus:text-[var(--shell-text)]">Family Combined</SelectItem>}
      {scope.members.map(member => <SelectItem key={member.id} value={member.id} className="text-[var(--shell-text)] focus:bg-[var(--shell-page)] focus:text-[var(--shell-text)]">{member.name}</SelectItem>)}
    </SelectContent>
  </Select>;
}
