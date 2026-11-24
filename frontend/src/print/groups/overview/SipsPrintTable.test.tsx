import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SipRow } from "../../../features/mutual-funds/types";
import { formatDate, formatRupees } from "../../../lib/format";
import { SipsPrintTable } from "./SipsPrintTable";

const activeSips: SipRow[] = [
  {
    scheme_id: "s1",
    scheme_name: "HDFC Flexi Cap Fund",
    household_member_id: "m1",
    household_member_name: "Aarav",
    sip_date: "5",
    sip_amount: "7500.00",
    next_due_date: "2026-12-05",
    status: "active",
  },
  {
    scheme_id: "s2",
    scheme_name: "Parag Parikh Flexi Cap Fund",
    household_member_id: "m2",
    household_member_name: "Meera",
    sip_date: "15",
    sip_amount: "5000.00",
    next_due_date: "2026-12-15",
    series_count: 2,
    status: "active",
  },
];

const stoppedSips: SipRow[] = [
  {
    scheme_id: "s3",
    scheme_name: "UTI Nifty 50 Index Fund",
    household_member_id: "m1",
    household_member_name: "Aarav",
    sip_date: "10",
    sip_amount: "4000.00",
    next_due_date: "2026-10-10",
    status: "stopped",
  },
];

describe("SipsPrintTable", () => {
  it("lists every active SIP with fund, member, instalment, day and next due", () => {
    render(<SipsPrintTable sips={activeSips} stopped={[]} monthlyTotal="17500.00" />);

    expect(screen.getByRole("heading", { name: "Active SIPs" })).toBeInTheDocument();
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map(h => h.textContent?.trim());
    expect(headers).toEqual(["Fund", "Member", "Instalment", "Day", "Next due"]);

    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("HDFC Flexi Cap Fund");
    expect(rows[1]).toHaveTextContent("Aarav");
    expect(rows[1]).toHaveTextContent(formatRupees("7500.00"));
    expect(rows[1]).toHaveTextContent("5th of each month");
    expect(rows[1]).toHaveTextContent(formatDate("2026-12-05"));

    expect(rows[2]).toHaveTextContent("Parag Parikh Flexi Cap Fund");
    expect(rows[2]).toHaveTextContent("Meera");
    expect(rows[2]).toHaveTextContent(formatRupees("5000.00"));
    expect(rows[2]).toHaveTextContent("15th of each month");
    expect(rows[2]).toHaveTextContent(formatDate("2026-12-15"));
  });

  it("shows the monthly total row from monthlyTotal", () => {
    render(<SipsPrintTable sips={activeSips} stopped={[]} monthlyTotal="17500.00" />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const totalRow = rows[rows.length - 1];
    expect(totalRow).toHaveTextContent("Monthly SIP total");
    expect(totalRow).toHaveTextContent(formatRupees("17500.00"));
  });

  it("shows a Stopped SIPs card only when there are stopped SIPs", () => {
    const { rerender } = render(
      <SipsPrintTable sips={activeSips} stopped={[]} monthlyTotal="17500.00" />
    );
    expect(screen.queryByRole("heading", { name: "Stopped SIPs" })).not.toBeInTheDocument();

    rerender(<SipsPrintTable sips={activeSips} stopped={stoppedSips} monthlyTotal="17500.00" />);
    expect(screen.getByRole("heading", { name: "Stopped SIPs" })).toBeInTheDocument();
    expect(screen.getByText("UTI Nifty 50 Index Fund")).toBeInTheDocument();
    expect(screen.getByText("10th of each month")).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });

  it("does not truncate long fund names", () => {
    const longName = "Very Long Mutual Fund Scheme Name Direct Plan Growth Option Multi Cap";
    const { container } = render(
      <SipsPrintTable
        sips={[{ ...activeSips[0], scheme_name: longName }]}
        stopped={[]}
        monthlyTotal="7500.00"
      />
    );
    const cell = screen.getByText(longName);
    expect(cell).toBeInTheDocument();
    expect(cell.className).not.toMatch(/\btruncate\b/);
    expect(container.querySelector(".truncate")).toBeNull();
  });

  it("shows the empty sentence", () => {
    render(<SipsPrintTable sips={[]} stopped={[]} monthlyTotal="0" />);
    expect(screen.getByText("No active SIPs.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("rows do not split, header is a thead, no button, no title attribute", () => {
    const { container } = render(
      <SipsPrintTable sips={activeSips} stopped={stoppedSips} monthlyTotal="17500.00" />
    );
    expect(container.querySelectorAll("thead")).toHaveLength(2);
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBeGreaterThan(0);
    for (const row of bodyRows) {
      expect(row.className).toContain("break-inside-avoid");
    }
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("[role='button']")).toHaveLength(0);
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
    const src = readFileSync(resolve("src/print/groups/overview/SipsPrintTable.tsx"), "utf8");
    expect(src).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
  });
});
