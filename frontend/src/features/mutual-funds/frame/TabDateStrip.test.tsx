import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInShell } from "../../../shell/testing";
import type { MfTabId } from "../types";
import { MutualFundsFrame } from "./MutualFundsFrame";
import { TabDateStrip } from "./TabDateStrip";

const mock = vi.hoisted(() => ({
  sections: {} as Record<string, unknown>,
}));

vi.mock("../data/analyticsStore", () => ({
  useMfAnalytics: (section: string) => ({
    data: mock.sections[section] ?? null,
    status: "ready",
    retry: vi.fn(),
    updating: false,
  }),
}));

beforeEach(() => {
  mock.sections = {
    asset_allocation: {
      nav_as_of: "2026-10-24",
      holdings_as_of: "2026-09-30",
      coverage: {
        covered_value_pct: "100",
        not_published_yet: [],
        not_available_from_amc: [],
        missing_value_schemes: [],
        funds: [
          {
            scheme_id: "F1",
            scheme_name: "Example Equity Fund",
            holdings_as_of: "2026-09-30",
            cadence: "monthly",
            age_tag: "on_cycle",
          },
        ],
      },
    },
    cap_allocation: {
      classification_as_of: "2026-07-01",
    },
    valuation: {
      nav_as_of: "2026-10-24",
      holdings_as_of: "2026-09-30",
      pe: { as_of_date: "2026-10-23" },
      pb: { as_of_date: "2026-10-22" },
      coverage: {
        covered_value_pct: "100",
        not_published_yet: [],
        not_available_from_amc: [],
        missing_value_schemes: [],
        funds: [
          {
            scheme_id: "F1",
            scheme_name: "Example Equity Fund",
            holdings_as_of: "2026-09-30",
            cadence: "monthly",
            age_tag: "on_cycle",
          },
        ],
      },
    },
    ter: {
      reference_period: "2026-03-01",
    },
  };
});

describe("TabDateStrip", () => {
  it("Allocation shows prices, holdings and the market-cap list from the section payloads", () => {
    render(<TabDateStrip tab="allocation" />);
    expect(screen.getByTestId("date-strip-line")).toHaveTextContent(
      "Prices as on 24 Oct 2026 · Holdings as on September 2026 · Market-cap list effective 1 Jul 2026"
    );
  });

  it("Other analytics shows prices, holdings, ratios and fees", () => {
    render(<TabDateStrip tab="analytics" />);
    expect(screen.getByTestId("date-strip-line")).toHaveTextContent(
      "Prices as on 24 Oct 2026 · Holdings as on September 2026 · Ratios as on 23 Oct 2026 · Fees as on March 2026"
    );
  });

  it("no other tab renders a strip", () => {
    const otherTabs: MfTabId[] = ["overview", "performance", "holdings", "transactions", "overlap"];
    for (const tab of otherTabs) {
      const { container, unmount } = render(<TabDateStrip tab={tab} />);
      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId("date-strip")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("a missing payload leaves that entry out without a crash", () => {
    mock.sections.cap_allocation = null;
    const { unmount } = render(<TabDateStrip tab="allocation" />);
    expect(screen.getByTestId("date-strip-line")).toHaveTextContent(
      "Prices as on 24 Oct 2026 · Holdings as on September 2026"
    );
    unmount();

    mock.sections.asset_allocation = null;
    const { container } = render(<TabDateStrip tab="allocation" />);
    expect(container.firstChild).toBeNull();
  });

  it("the older-holdings marker appears only when a fund is tagged older than 60 days and its info names the fund", () => {
    const { unmount } = render(<TabDateStrip tab="allocation" />);
    expect(screen.queryByTestId("date-strip-older")).not.toBeInTheDocument();
    unmount();

    mock.sections.asset_allocation = {
      nav_as_of: "2026-10-24",
      holdings_as_of: "2026-09-30",
      coverage: {
        covered_value_pct: "100",
        not_published_yet: [],
        not_available_from_amc: [],
        missing_value_schemes: [],
        funds: [
          {
            scheme_id: "F1",
            scheme_name: "Example Equity Fund",
            holdings_as_of: "2026-09-30",
            cadence: "monthly",
            age_tag: "on_cycle",
          },
          {
            scheme_id: "F2",
            scheme_name: "Example Value Fund",
            holdings_as_of: "2026-06-30",
            cadence: "quarterly",
            age_tag: "older_than_60_days",
          },
        ],
      },
    };
    render(<TabDateStrip tab="allocation" />);
    const older = screen.getByTestId("date-strip-older");
    expect(older).toHaveTextContent("1 fund has older holdings");
    const info = within(older).getByTestId("date-strip-older-info");
    expect(info).toHaveAttribute("aria-label", "Example Value Fund");
    expect(info).toHaveAttribute("data-tooltip", "Example Value Fund");
  });

  it("the strip sits under the tab bar and the page header slots are unchanged", () => {
    renderInShell(
      <MutualFundsFrame tab="allocation">
        <div data-testid="page-content">Body</div>
      </MutualFundsFrame>,
      { path: "/portfolio/mutual-funds/allocation" }
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Allocation" });
    const nav = screen.getByRole("navigation", { name: "Mutual Funds sections" });
    const strip = screen.getByTestId("date-strip");
    const content = screen.getByTestId("page-content");

    expect(heading.closest("header")?.querySelector('[data-testid="date-strip"]')).toBeNull();
    expect(nav.querySelector('[data-testid="date-strip"]')).toBeNull();
    expect(nav.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
