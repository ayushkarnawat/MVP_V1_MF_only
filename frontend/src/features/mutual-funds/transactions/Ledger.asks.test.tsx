import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetFolioVisibilityForTests } from "@/lib/folioVisibility";
import * as fa from "../fixtures/mfAsks";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import type { InvestmentWithdrawalBucket } from "../types";
import { Ledger } from "./Ledger";

const detailed = () => fa.investmentWithdrawalWithDetail().monthly;
const mount = (data: InvestmentWithdrawalBucket[] = detailed()) => render(<Ledger buckets={data} filter="all" onFilter={() => undefined} />);
const open = (id: string) => {
  fireEvent.click(within(screen.getByTestId(`ledger-row-${id}`)).getByRole("button"));
  return screen.getByTestId(`ledger-detail-${id}`);
};
const term = (detail: HTMLElement, label: string) => within(detail).queryByText(label, { selector: "dt" });
const value = (detail: HTMLElement, label: string) => term(detail, label)?.nextElementSibling?.textContent;
const NOTE = "Units, NAV and folio are not part of this data yet.";

describe("units, NAV and folio in the expanded row", () => {
  beforeEach(() => resetFolioVisibilityForTests());
  it("adds Units, NAV and Folio after the existing five facts, in that order", () => {
    mount();
    const detail = open("t-0067");
    expect([...detail.querySelectorAll("dt")].map(dt => dt.textContent)).toEqual(["Member", "Transaction", "Date", "Amount", "Transaction ID", "Units", "NAV", "Folio"]);
    expect(value(detail, "Units")).toBe("200.000");
    expect(value(detail, "NAV")).toBe("₹81.22");
    expect(value(detail, "Folio")).toBe("1234567890");
    expect(value(detail, "Amount")).toBe("₹16,244");
    expect(detail).not.toHaveTextContent(NOTE);
  });
  it("shows the second entry's own figures, not the first's", () => {
    mount();
    const detail = open("t-0028");
    expect(value(detail, "Units")).toBe("250.000");
    expect(value(detail, "NAV")).toBe("₹88.00");
    expect(value(detail, "Folio")).toBe("1234567/89");
    expect(detail).toHaveTextContent("Redemption");
  });
  it("shows only the folio when units and NAV are null, and no note", () => {
    mount();
    const detail = open("t-0029");
    expect(term(detail, "Units")).toBeNull();
    expect(term(detail, "NAV")).toBeNull();
    expect(value(detail, "Folio")).toBe("1234567/89");
    expect(detail).not.toHaveTextContent(NOTE);
  });
  it("keeps the old sentence and shows none of the three when an entry has no detail", () => {
    mount();
    const detail = open("t-0046");
    expect(["Units", "NAV", "Folio"].map(label => term(detail, label))).toEqual([null, null, null]);
    expect(detail).toHaveTextContent(NOTE);
  });
  it("behaves as before on an old payload (no fields anywhere)", () => {
    mount(fb.investmentWithdrawal().monthly);
    const detail = open("t-0067");
    expect([...detail.querySelectorAll("dt")].map(dt => dt.textContent)).toEqual(["Member", "Transaction", "Date", "Amount", "Transaction ID"]);
    expect(detail).toHaveTextContent(NOTE);
  });
  it("reads the detail from the yearly buckets too", () => {
    mount(fa.investmentWithdrawalWithDetail().yearly);
    const detail = open("t-0067");
    expect(value(detail, "Units")).toBe("200.000");
  });
  it("does not add columns to the table and keeps every control marked", () => {
    const { container } = mount();
    expect(within(screen.getByRole("table", { name: "All transactions" })).getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Date", "Fund", "Type", "Amount"]);
    open("t-0067");
    expectInteractivity(container, 6);
  });
});

// Batch C 17c: the ledger's Folio fact is the full number with an eye beside it (the shared FolioNumber).
describe("the ledger Folio fact: full number with an eye", () => {
  beforeEach(() => resetFolioVisibilityForTests());
  it("has an eye beside the number, and one click hides it as XXXX4567/89 (the sub-folio stays)", () => {
    mount();
    const detail = open("t-0028");
    fireEvent.click(within(detail).getByRole("button", { name: "Hide folio numbers" }));
    expect(value(detail, "Folio")).toBe("XXXX4567/89");
    expect(within(detail).getByRole("button", { name: "Show folio numbers" })).toHaveAttribute("aria-pressed", "true");
  });
  it("never shows the old masked text", () => {
    mount();
    expect(open("t-0067")).not.toHaveTextContent("XXXX7890");
  });
});
