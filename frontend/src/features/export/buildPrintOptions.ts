import type { PrintOptions } from "../../print/printFragment";
import type { ScopeValue } from "../../shell/scope/scopeTypes";
import type { ExportChoice } from "./exportTypes";

export function buildPrintOptions(choice: ExportChoice, scope: Pick<ScopeValue, "members">, me: { self_name: string | null } | null): PrintOptions {
  const holderName = me?.self_name?.trim() || scope.members.find(member => member.profile?.relationship === "self")?.name || null;
  const members = (choice.who === "family" ? scope.members : scope.members.filter(member => member.id === choice.who)).map(({ id, name }) => ({ id, name }));
  if (!members.length) throw new Error("Invalid export scope");
  return { scope: choice.who, sectionIds: [...choice.sectionIds], cover: choice.cover, dataDates: choice.dataDates, showFolios: choice.showFolios ? "full" : "masked", jobId: "browser", members, meta: { holderName, scopeName: choice.who === "family" ? holderName ?? "Your family" : members[0].name, memberCount: members.length } };
}
