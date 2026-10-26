import { expect, it } from "vitest";
import { importDoneTarget } from "./importDoneTarget";

it.each([
  ["/portfolio", "/portfolio"],
  ["/home", "/portfolio/mutual-funds"],
  [undefined, "/portfolio/mutual-funds"],
  ["/portfolio/mutual-funds/analytics", "/portfolio/mutual-funds"],
  ["//external.example", "/portfolio/mutual-funds"],
])("completes an import from %s at %s", (origin, destination) => {
  expect(importDoneTarget(origin)).toBe(destination);
});
