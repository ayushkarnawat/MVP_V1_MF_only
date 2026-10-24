import { expect, it } from "vitest";
import { buildRegistry } from "../registry/buildRegistry";
import { shouldResetScope } from "./resetRule";

const routes = buildRegistry();
const cases = [
  ["/home", "/portfolio/mutual-funds", true],
  ["/portfolio/mutual-funds", "/portfolio/mutual-funds/holdings", false],
  ["/portfolio/mutual-funds", "/portfolio/mutual-funds/funds/INF123", false],
  ["/portfolio/mutual-funds/funds/INF123", "/portfolio/mutual-funds/funds/INF123/insights", false],
  ["/portfolio/mutual-funds", "/portfolio/debt", true],
  ["/portfolio/mutual-funds", "/profile", false],
  ["/home", "/profile/settings", false],
  ["/profile", "/portfolio/mutual-funds", true],
  ["/home", "/home", false],
  ["/home", "/planning", false],
  ["/home", "/import", false],
  ["/home", "/unknown", false],
  ["/unknown", "/portfolio/mutual-funds", true],
] as const;

it.each(cases)("scope reset from %s to %s is %s", (previous, next, expected) => {
  expect(shouldResetScope(previous, next, routes, 2)).toBe(expected);
});

it.each(cases)("never resets a single-member household from %s to %s", (previous, next) => {
  expect(shouldResetScope(previous, next, routes, 1)).toBe(false);
  expect(shouldResetScope(previous, next, routes, 0)).toBe(false);
});
