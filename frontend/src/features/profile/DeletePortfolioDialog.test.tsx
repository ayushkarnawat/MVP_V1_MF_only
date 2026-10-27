import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeletePortfolioDialog } from "./DeletePortfolioDialog";

const base = { statementsCount: 2, onDelete: vi.fn(), onKeep: vi.fn() };

describe("DeletePortfolioDialog", () => {
  it("names the member in the title", () => {
    render(<DeletePortfolioDialog {...base} member={{ name: "Aditi", relationship: "spouse" }} />);
    expect(screen.getByRole("dialog", { name: "Delete all of Aditi’s funds?" })).toBeInTheDocument();
  });

  it("falls back to 'this member' when the name is empty", () => {
    render(<DeletePortfolioDialog {...base} member={{ name: "  ", relationship: "spouse" }} />);
    expect(screen.getByRole("dialog", { name: "Delete all of this member’s funds?" })).toBeInTheDocument();
    expect(screen.getByText("Also remove this member from my family")).toBeInTheDocument();
  });
});
