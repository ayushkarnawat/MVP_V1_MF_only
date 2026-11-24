import { expect, it } from "vitest";
import { buildPrintOptions } from "./buildPrintOptions";
import type { ExportChoice } from "./exportTypes";
const scope = { members: [{ id: "11111111-1111-4111-8111-111111111111", name: "Demo Holder" }, { id: "22222222-2222-4222-8222-222222222222", name: "Demo Member" }] };
const choice: ExportChoice = { who: "family", sectionIds: ["overview-sips"], cover: true, dataDates: false, showFolios: false };
it("builds family metadata and options without copying account identifiers", () => {
  expect(buildPrintOptions(choice, scope, { self_name: "Demo Holder" })).toEqual({ scope: "family", sectionIds: choice.sectionIds, cover: true, dataDates: false, showFolios: "masked", jobId: "browser", members: scope.members, meta: { holderName: "Demo Holder", scopeName: "Demo Holder", memberCount: 2 } });
});
it("uses Your family without a holder and limits a member report to that member", () => {
  expect(buildPrintOptions(choice, scope, null).meta).toEqual({ holderName: null, scopeName: "Your family", memberCount: 2 });
  const options = buildPrintOptions({ ...choice, who: scope.members[1].id, showFolios: true }, scope, { self_name: "Demo Holder" });
  expect(options.members).toEqual([scope.members[1]]); expect(options.meta).toEqual({ holderName: "Demo Holder", scopeName: "Demo Member", memberCount: 1 }); expect(options.showFolios).toBe("full");
});
