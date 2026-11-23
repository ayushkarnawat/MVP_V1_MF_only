import { expect, it } from "vitest";
import { clearFragment, parsePrintFragment } from "./printFragment";

const options = { scope: "family", sectionIds: ["overview-sips"], cover: true, dataDates: false, showFolios: "masked", jobId: "job-demo" };
const fragment = (value: unknown = options, pass = "invented-pass") => `#pass=${pass}&opts=${btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;

it("parses a valid fragment and ignores unknown keys", () => {
  expect(parsePrintFragment(fragment({ ...options, ignored: true }))).toEqual({ pass: "invented-pass", options });
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
