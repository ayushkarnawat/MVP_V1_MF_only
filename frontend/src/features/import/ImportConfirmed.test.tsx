import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportConfirmed } from "./ImportConfirmed";

describe("ImportConfirmed", () => {
  it("shows added/skipped counts and calls onImportAnother", () => {
    const onImportAnother = vi.fn();
    render(<ImportConfirmed result={{ added: 3, skipped: 1, import_id: "imp1" }} onImportAnother={onImportAnother} />);

    expect(screen.getByText(/3 new transactions added, 1 duplicate skipped/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /import another cas/i }));
    expect(onImportAnother).toHaveBeenCalled();
  });

  it("uses singular wording for one transaction and no duplicates clause when zero", () => {
    render(<ImportConfirmed result={{ added: 1, skipped: 0, import_id: "imp2" }} onImportAnother={vi.fn()} />);

    expect(screen.getByText(/1 new transaction added\./i)).toBeInTheDocument();
  });

  it("uses a custom ctaLabel when provided", () => {
    const onImportAnother = vi.fn();
    render(
      <ImportConfirmed
        result={{ added: 2, skipped: 0, import_id: "imp1" }}
        onImportAnother={onImportAnother}
        ctaLabel="Continue"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onImportAnother).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /import another cas/i })).not.toBeInTheDocument();
  });
});
