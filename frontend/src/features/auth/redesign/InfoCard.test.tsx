import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoCard } from "./InfoCard";

describe("InfoCard", () => {
  it("shows a title and its text", () => {
    render(<InfoCard title="Why do we need your PAN name?">To match your statements to you.</InfoCard>);
    expect(screen.getByText("Why do we need your PAN name?")).toBeInTheDocument();
    expect(screen.getByText("To match your statements to you.")).toBeInTheDocument();
  });
  it("is a labelled region", () => {
    render(<InfoCard title="Why?">Because.</InfoCard>);
    expect(screen.getByRole("region", { name: "Why?" })).toBeInTheDocument();
  });
});
