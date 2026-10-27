import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanBadge } from "./PlanBadge";

it.each([
  ["direct", undefined, "Direct"],
  ["regular", undefined, "Regular"],
  ["unclassified", undefined, "Unclassified"],
  ["regular", false, "Regular · unverified"],
] as const)("%s %s → %s", (planType, verified, label) => {
  render(<PlanBadge planType={planType} verified={verified} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});

it("direct is green", () => {
  render(<PlanBadge planType="direct" />);
  expect(screen.getByText("Direct").className).toMatch(/color-positive/);
});
