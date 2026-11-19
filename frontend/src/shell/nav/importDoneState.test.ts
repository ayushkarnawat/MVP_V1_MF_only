import { expect, it } from "vitest";
import { isImportDoneState } from "./importDoneTarget";

// Batch C 17d (C-9): the one place that knows what the import-done navigation looks like, so the scope reset rule can leave
// that single navigation alone. ImportWrapper writes { importNotice, importNoticeUser } into the history state when an import ends.
it.each([
  [{ importNotice: null, importNoticeUser: "u1" }, true],
  [{ importNotice: { text: "3 transactions added" }, importNoticeUser: null }, true],
  [{ importNotice: undefined }, true],
  [{}, false],
  [{ origin: "/home" }, false],
  [null, false],
  [undefined, false],
  ["importNotice", false],
  [42, false],
])("a navigation with state %j is the import-done navigation: %s", (state, expected) => {
  expect(isImportDoneState(state)).toBe(expected);
});
