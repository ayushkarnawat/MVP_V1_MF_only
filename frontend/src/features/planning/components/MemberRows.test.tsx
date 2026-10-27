import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { ASHA_ID, DEV_ID, freezeResult, memberDevResult, noFundDataResult, standardResult } from "../testData";
import type { ScenarioResult } from "../types";
import { MemberRows } from "./MemberRows";

const LIVE_FUND_ROUTE = buildRegistry().map(route => route.id === "portfolio-mutual-funds-fund" ? { ...route, status: "live" as const } : route);
const show = (result: ScenarioResult, selected = "family", routes = LIVE_FUND_ROUTE) =>
  renderInShell(<MemberRows result={result} selectedMemberId={selected} />, { routes });
const header = (name: RegExp) => screen.getByRole("button", { name });
const GOLD = "7c906599-2ff8-5de4-83f9-b94651c683f2";
const DEBT = "cf09c887-92a1-5b49-a624-7f067ed6a2c8";
const LARGE = "54b8755e-6b2b-5f4f-a8fe-b41125031af6";

describe("MemberRows: family mode", () => {
  it("is a titled card with one expandable row per member, biggest loss first", () => {
    show(standardResult());
    expect(screen.getByRole("heading", { level: 3, name: "By family member" })).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("Asha Rao");
    expect(buttons[1]).toHaveTextContent("Dev Rao");
  });

  it("shows each member's rupee impact and percent in the row", () => {
    show(standardResult());
    expect(screen.getByTestId(`member-total-${ASHA_ID}`)).toHaveTextContent("−₹757 (−34.4%)");
    expect(screen.getByTestId(`member-total-${DEV_ID}`)).toHaveTextContent("+₹101 (+3.4%)");
    expect(screen.getByTestId(`member-total-${ASHA_ID}`)).toHaveClass("text-[var(--neg-text)]");
    expect(screen.getByTestId(`member-total-${DEV_ID}`)).toHaveClass("text-[var(--pos-text)]");
  });

  it("labels the first row Biggest contributor and opens it at first", () => {
    show(standardResult());
    expect(within(header(/Asha Rao/)).getByText("Biggest contributor")).toBeInTheDocument();
    expect(within(header(/Dev Rao/)).queryByText("Biggest contributor")).toBeNull();
    expect(header(/Asha Rao/)).toHaveAttribute("aria-expanded", "true");
    expect(header(/Dev Rao/)).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Asha Flexi Cap")).toBeInTheDocument();
    expect(screen.queryByText("Dev Gold Fund")).toBeNull();
  });

  it("puts the biggest gain first when nobody lost money", () => {
    const result = standardResult();
    result.by_member[0].rupee_impact = "50.00";
    show(result);
    expect(screen.getAllByRole("button")[0]).toHaveTextContent("Dev Rao");
    expect(within(header(/Dev Rao/)).getByText("Biggest contributor")).toBeInTheDocument();
  });

  it("does not reorder the result it was given", () => {
    const result = standardResult();
    result.by_member.reverse();
    const before = result.by_member.map(member => member.household_member_id);
    show(result);
    expect(result.by_member.map(member => member.household_member_id)).toEqual(before);
    expect(screen.getAllByRole("button")[0]).toHaveTextContent("Asha Rao");
  });

  it("opens and closes a row with a click, one row independent of the other", () => {
    show(standardResult());
    fireEvent.click(header(/Dev Rao/));
    expect(header(/Dev Rao/)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Dev Gold Fund")).toBeInTheDocument();
    expect(screen.getByText("Asha Flexi Cap")).toBeInTheDocument();
    fireEvent.click(header(/Asha Rao/));
    expect(screen.queryByText("Asha Flexi Cap")).toBeNull();
    expect(header(/Asha Rao/)).toHaveAttribute("aria-expanded", "false");
  });

  it("shows a fund's rupee impact, signed and coloured", () => {
    show(standardResult());
    expect(screen.getByTestId(`fund-amount-${ASHA_ID}-${LARGE}`)).toHaveTextContent("−₹460");
    expect(screen.getByTestId(`fund-amount-${ASHA_ID}-${LARGE}`)).toHaveClass("text-[var(--neg-text)]");
    fireEvent.click(header(/Dev Rao/));
    expect(screen.getByTestId(`fund-amount-${DEV_ID}-${DEBT}`)).toHaveTextContent("+₹20");
    expect(screen.getByTestId(`fund-amount-${DEV_ID}-${DEBT}`)).toHaveClass("text-[var(--pos-text)]");
  });

  it("marks an estimated fund with an Estimate chip whose tooltip names the basis, and a real one with nothing", () => {
    show(standardResult());
    fireEvent.click(header(/Dev Rao/));
    const chip = screen.getByTestId(`estimate-${DEV_ID}-${GOLD}`);
    expect(chip).toHaveTextContent("Estimate");
    expect(chip).toHaveAttribute("title", "Asset-class average estimate");
    expect(screen.queryByTestId(`estimate-${DEV_ID}-${DEBT}`)).toBeNull();
    expect(screen.queryByTestId(`estimate-${ASHA_ID}-${LARGE}`)).toBeNull();
    expect(screen.queryByTestId(`frozen-${DEV_ID}-${GOLD}`)).toBeNull();
  });

  it("names a category-average basis as such", () => {
    const result = standardResult();
    result.by_member[0].funds[0].is_proxied = true;
    result.by_member[0].funds[0].proxy_basis = "sebi_category_average:Equity Scheme - Large Cap Fund|Equity";
    show(result);
    expect(screen.getByTestId(`estimate-${ASHA_ID}-${LARGE}`)).toHaveAttribute("title", "Category average estimate");
  });

  it("gives the same fund the same label under two members", () => {
    const result = standardResult();
    const shared = { ...result.by_member[1].funds.find(fund => fund.scheme_id === GOLD)! };
    result.by_member[0].funds.push({ ...shared });
    show(result);
    fireEvent.click(header(/Dev Rao/));
    expect(screen.getByTestId(`estimate-${ASHA_ID}-${GOLD}`)).toHaveAttribute("title", "Asset-class average estimate");
    expect(screen.getByTestId(`estimate-${DEV_ID}-${GOLD}`)).toHaveAttribute("title", "Asset-class average estimate");
    expect(screen.getAllByText("Dev Gold Fund")).toHaveLength(2);
  });

  it("shows Redemptions frozen instead of an amount for a frozen fund", () => {
    show(freezeResult());
    fireEvent.click(header(/Dev Rao/));
    expect(screen.getByTestId(`frozen-${DEV_ID}-${DEBT}`)).toHaveTextContent("Redemptions frozen");
    expect(screen.queryByTestId(`fund-amount-${DEV_ID}-${DEBT}`)).toBeNull();
    expect(screen.queryByTestId(`estimate-${DEV_ID}-${DEBT}`)).toBeNull();
    expect(screen.getByTestId(`fund-amount-${DEV_ID}-${GOLD}`)).toHaveTextContent("+₹20");
  });

  it("says there is not enough data, with no Estimate chip, for a fund that has no rupee impact", () => {
    show(noFundDataResult());
    expect(screen.getAllByText("Not enough historical data to estimate")).toHaveLength(2);
    expect(screen.queryByText("Estimate")).toBeNull();
    expect(screen.queryByText(/null|NaN/)).toBeNull();
    expect(screen.getByTestId(`member-total-${ASHA_ID}`)).toHaveTextContent("₹0");
    expect(screen.getByTestId(`member-total-${ASHA_ID}`).textContent).not.toContain("(");
  });

  it("does not call anyone Biggest contributor when nobody moved", () => {
    show(noFundDataResult());
    expect(screen.queryByText("Biggest contributor")).toBeNull();
  });

  it("says so when an open member has no holdings", () => {
    const result = standardResult();
    result.by_member[0].funds = [];
    show(result);
    expect(screen.getByText("No holdings for this member.")).toBeInTheDocument();
  });

  it("keeps a very long fund name inside its row", () => {
    const result = standardResult();
    result.by_member[0].funds[0].scheme_name = "Fund ".repeat(80).trim();
    show(result);
    const name = screen.getByTestId(`fund-name-${ASHA_ID}-${LARGE}`);
    expect(name).toHaveClass("min-w-0", "break-words");
  });
});

describe("MemberRows: fund names open the fund page", () => {
  it("links a fund name to its page when that page is live", () => {
    show(standardResult());
    const link = screen.getByRole("link", { name: "Asha Large Cap" });
    expect(link).toHaveAttribute("href", `/portfolio/mutual-funds/funds/${LARGE}`);
  });

  it("keeps the name readable, but not a link, while the fund page is not live", () => {
    show(standardResult(), "family", buildRegistry());
    expect(screen.getByText("Asha Large Cap")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Asha Large Cap" })).toBeNull();
  });

  it("encodes the scheme id in the address", () => {
    const result = standardResult();
    result.by_member[0].funds[0].scheme_id = "a b/c";
    show(result);
    expect(screen.getByRole("link", { name: "Asha Large Cap" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/a%20b%2Fc");
  });
});

describe("MemberRows: one member chosen", () => {
  it("is titled Funds for the member, with the funds open and no rows to click", () => {
    show(memberDevResult(), DEV_ID);
    expect(screen.getByRole("heading", { level: 3, name: "Funds for Dev Rao" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Dev Short Duration Debt")).toBeInTheDocument();
    expect(screen.getByText("Dev Gold Fund")).toBeInTheDocument();
    expect(screen.queryByText("By family member")).toBeNull();
  });

  it("shows the same amounts and labels as the family list", () => {
    show(memberDevResult(), DEV_ID);
    expect(screen.getByTestId(`fund-amount-${DEV_ID}-${DEBT}`)).toHaveTextContent("+₹20");
    expect(screen.getByTestId(`fund-amount-${DEV_ID}-${GOLD}`)).toHaveTextContent("+₹81");
    expect(screen.getByTestId(`estimate-${DEV_ID}-${GOLD}`)).toHaveAttribute("title", "Asset-class average estimate");
  });

  it("title-cases an all-capitals name in the heading", () => {
    const result = standardResult();
    result.by_member = [result.by_member[0]];
    show(result, ASHA_ID);
    expect(screen.getByRole("heading", { level: 3, name: "Funds for Asha Rao" })).toBeInTheDocument();
  });

  it("says so when the member has no funds", () => {
    const result = memberDevResult();
    result.by_member[0].funds = [];
    show(result, DEV_ID);
    expect(screen.getByText("No holdings for this member.")).toBeInTheDocument();
  });

  it("shows the frozen label here too", () => {
    const result = freezeResult();
    result.by_member = [result.by_member[1]];
    show(result, DEV_ID);
    expect(screen.getByTestId(`frozen-${DEV_ID}-${DEBT}`)).toHaveTextContent("Redemptions frozen");
  });
});
