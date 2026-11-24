import { expect, it } from "vitest";
import { clearFragment, parsePrintFragment } from "./printFragment";

const member = { id: "11111111-1111-4111-8111-111111111111", name: "Demo Member" };
const options = { scope: "family", sectionIds: ["overview-sips"], cover: true, dataDates: false, showFolios: "masked", jobId: "job-demo", members: [member], meta: { holderName: "Demo Holder", scopeName: "Demo Family", memberCount: 1 } };
const fragment = (value: unknown = options, pass = "invented-pass") => `#pass=${pass}&opts=${btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;

it("accepts optional section and notes page numbers including the bounds", () => {
  for (const pages of [{}, { "overview-sips": 1, notes: 9999 }]) expect(parsePrintFragment(fragment({ ...options, pages }))?.options.pages).toEqual(pages);
  expect(parsePrintFragment(fragment())?.options).not.toHaveProperty("pages");
});
it.each<unknown>([null, [], 1, { unknown: 1 }, { toString: 1 }, { notes: 0 }, { notes: -1 }, { notes: 10000 }, { notes: 1.5 }, { notes: "2" }, { notes: true }])("rejects malformed pages %j", (pages: unknown) => {
  expect(parsePrintFragment(fragment({ ...options, pages }))).toBeNull();
});

it("parses a valid fragment and ignores unknown keys", () => {
  expect(parsePrintFragment(fragment({ ...options, ignored: true, members: [{ ...member, profile: "discard" }], meta: { ...options.meta, ignored: true } }))).toEqual({ pass: "invented-pass", options });
});
it("accepts null holder names, UTF-8 names and the member/name limits", () => {
  const value = { ...options, members: Array.from({ length: 50 }, () => ({ ...member, name: "न".repeat(120) })), meta: { holderName: null, scopeName: "x".repeat(160), memberCount: 50 } };
  const utf8 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  expect(parsePrintFragment(`#pass=demo&opts=${utf8}`)?.options).toEqual(value);
});
it.each([
  ["missing members", undefined], ["empty members", []], ["51 members", Array.from({ length: 51 }, () => member)],
  ["non-UUID id", [{ ...member, id: "member-demo" }]], ["empty name", [{ ...member, name: "" }]],
  ["blank name", [{ ...member, name: "  " }]], ["over-long name", [{ ...member, name: "x".repeat(121) }]],
  ["null member", [null]], ["wrong members type", {}],
])("rejects %s", (_label, members) => {
  expect(parsePrintFragment(fragment({ ...options, members }))).toBeNull();
});
it.each([
  ["missing meta", undefined], ["missing memberCount", { holderName: null, scopeName: "Family" }],
  ["non-integer memberCount", { ...options.meta, memberCount: 1.5 }],
  ["zero memberCount", { ...options.meta, memberCount: 0 }], ["51 memberCount", { ...options.meta, memberCount: 51 }],
  ["missing scopeName", { holderName: null, memberCount: 1 }], ["empty scopeName", { ...options.meta, scopeName: " " }],
  ["over-long scopeName", { ...options.meta, scopeName: "x".repeat(161) }],
  ["missing holderName", { scopeName: "Family", memberCount: 1 }], ["wrong holderName type", { ...options.meta, holderName: 1 }],
])("rejects %s", (_label, meta) => {
  expect(parsePrintFragment(fragment({ ...options, meta }))).toBeNull();
});
it.each(["none", "masked", "full"])("accepts %s folios", showFolios => {
  expect(parsePrintFragment(fragment({ ...options, showFolios }))?.options.showFolios).toBe(showFolios);
});
it("rejects bad base64", () => expect(parsePrintFragment("#pass=demo&opts=%%%" )).toBeNull());
it("rejects an oversized pass", () => expect(parsePrintFragment(fragment(options, "x".repeat(1025)))).toBeNull());
it("rejects missing keys", () => {
  for (const key of Object.keys(options)) {
    const incomplete: Record<string, unknown> = { ...options };
    delete incomplete[key];
    expect(parsePrintFragment(fragment(incomplete))).toBeNull();
  }
  expect(parsePrintFragment("#opts=e30")).toBeNull();
});
it("rejects unknown ids and malformed option types", () => {
  for (const change of [{ sectionIds: ["unknown"] }, { sectionIds: ["toString"] }, { cover: "true" }, { scope: "" }, { showFolios: "visible" }, { jobId: "" }]) {
    expect(parsePrintFragment(fragment({ ...options, ...change }))).toBeNull();
  }
});
it("clears the fragment and query from the address", () => {
  history.replaceState(null, "", `/print/report?discard=1${fragment()}`);
  clearFragment();
  expect(location.pathname + location.search + location.hash).toBe("/print/report");
});
