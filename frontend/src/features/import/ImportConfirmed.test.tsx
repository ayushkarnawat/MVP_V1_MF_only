import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportConfirmed } from "./ImportConfirmed";

describe("ImportConfirmed", () => {
  it("shows added/skipped counts and calls onImportAnother", () => {
    const onImportAnother = vi.fn();
    render(<ImportConfirmed result={{ added: 3, skipped: 1, import_id: "imp1", warnings: [], people: [], upload_group_id: null }} onImportAnother={onImportAnother} />);

    expect(screen.getByText(/3 new transactions added, 1 duplicate skipped/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /import another cas/i }));
    expect(onImportAnother).toHaveBeenCalled();
  });

  it("uses singular wording for one transaction and no duplicates clause when zero", () => {
    render(<ImportConfirmed result={{ added: 1, skipped: 0, import_id: "imp2", warnings: [], people: [], upload_group_id: null }} onImportAnother={vi.fn()} />);

    expect(screen.getByText(/1 new transaction added\./i)).toBeInTheDocument();
  });

  it("uses a custom ctaLabel when provided", () => {
    const onImportAnother = vi.fn();
    render(
      <ImportConfirmed
        result={{ added: 2, skipped: 0, import_id: "imp1", warnings: [], people: [], upload_group_id: null }}
        onImportAnother={onImportAnother}
        ctaLabel="Continue"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onImportAnother).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /import another cas/i })).not.toBeInTheDocument();
  });

  it("shows a generic, non-blocking warning after a successful import", () => {
    render(
      <ImportConfirmed
        result={{
          added: 2,
          skipped: 0,
          import_id: "imp3",
          warnings: [
            "This investment may already be tracked under a different Unifolio account. If that's you, consider using that account instead.",
          ],
        }}
        onImportAnother={vi.fn()}
      />,
    );

    expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /may already be tracked under a different Unifolio account/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss warning/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lists per-person totals when the import covered several people", () => {
    render(
      <ImportConfirmed
        result={{
          added: 7, skipped: 2, import_id: "imp1", warnings: [], upload_group_id: "g1",
          people: [
            { person_key: "me", member_id: "m1", name: "Aditi Sharma", import_id: "i1", added: 5, skipped: 1 },
            { person_key: "r", member_id: "m2", name: "Ramesh Sharma", import_id: "i2", added: 2, skipped: 1 },
          ],
        }}
        onImportAnother={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Aditi Sharma");
    expect(rows[0]).toHaveTextContent("5 added");
    expect(rows[0]).toHaveTextContent("1 skipped");
    expect(rows[1]).toHaveTextContent("Ramesh Sharma");
    expect(rows[1]).toHaveTextContent("2 added");
  });

  it("shows no per-person list for a single person", () => {
    render(
      <ImportConfirmed
        result={{
          added: 5, skipped: 0, import_id: "imp1", warnings: [], upload_group_id: null,
          people: [{ person_key: "me", member_id: "m1", name: "Aditi Sharma", import_id: "i1", added: 5, skipped: 0 }],
        }}
        onImportAnother={vi.fn()}
      />,
    );
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
