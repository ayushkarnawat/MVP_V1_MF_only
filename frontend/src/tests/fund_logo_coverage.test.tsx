import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchemeLogo } from "@/components/SchemeLogo";
import { getAmcInfo } from "@/lib/amcLogos";
import { renderInShell } from "@/shell/testing";
import * as fx from "@/features/mutual-funds/fixtures";
import * as fa from "@/features/mutual-funds/fixtures/mfAsks";
import * as fb from "@/features/mutual-funds/fixtures/mfB";
import * as fc from "@/features/mutual-funds/fixtures/mfC";
import { loaded } from "@/features/mutual-funds/testing";
import { AssetClassCard } from "@/features/mutual-funds/allocation/AssetClassCard";
import { MarketCapCard } from "@/features/mutual-funds/allocation/MarketCapCard";
import { CategoryAmcCard } from "@/features/mutual-funds/allocation/CategoryAmcCard";
import { FundManagerCard } from "@/features/mutual-funds/allocation/FundManagerCard";
import { AmcAllocationCard } from "@/features/mutual-funds/overview/OverviewCards";
import { SipTimeline } from "@/features/mutual-funds/overview/SipTimeline";
import { StatStrip } from "@/features/mutual-funds/overlap/StatStrip";
import { CommonHoldings } from "@/features/mutual-funds/overlap/CommonHoldings";
import { Heatmap } from "@/features/mutual-funds/overlap/Heatmap";
import { TopPairs } from "@/features/mutual-funds/overlap/TopPairs";
import { ImpactDonut } from "@/features/mutual-funds/overlap/ImpactDonut";
import { AllStocksTable } from "@/features/mutual-funds/holdings/AllStocksTable";
import { TopHoldingsByFund } from "@/features/mutual-funds/holdings/TopHoldingsByFund";
import { Ledger } from "@/features/mutual-funds/transactions/Ledger";
import { PeriodDrill } from "@/features/mutual-funds/transactions/PeriodDrill";
import { MoverRow } from "@/features/home/components/MoverRow";
import { Movers } from "@/features/home/sections/Movers";
import { fixture as homeFixture } from "@/features/home/fixtures";
import type { MoversResponse } from "@/features/home/types";
import { TopOverlapFunds } from "@/features/individual-fund/overlap/TopOverlapFunds";
import { CommonHoldingsTable } from "@/features/individual-fund/overlap/CommonHoldingsTable";
import { CommonHoldingsPanel, UniqueHoldingsPanel } from "@/features/individual-fund/overlap/HoldingsPanels";
import { MarketCapPanel, SectorComparisonPanel } from "@/features/individual-fund/overlap/BarPanels";
import { ComparisonOverview } from "@/features/individual-fund/overlap/ComparisonOverview";
import { fixture as ifFixture } from "@/features/individual-fund/fixtures";
import type { OverlapCompareResponse, OverlapResponse } from "@/features/individual-fund/types";
import { QuickInsights } from "@/features/portfolio/sections/QuickInsights";
import { fixture as insightsFixture } from "@/features/portfolio/fixtures/insights";
import type { PortfolioInsightsResponse } from "@/features/portfolio/types";

const hasLogo = (el: HTMLElement | null) =>
  Boolean(el?.querySelector('[data-testid="scheme-logo"], div.shadow-2xs'));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SchemeLogo and AMC logo map", () => {
  it("fallback_tile_renders_for_a_fund_house_not_in_the_map", () => {
    const { container } = render(
      <SchemeLogo
        amcName="Unlisted Boutique Mutual Fund"
        schemeName="Unlisted Boutique Opportunities Fund"
        size="sm"
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    const tile = screen.getByTitle("Unlisted Boutique Mutual Fund");
    expect(tile).toBeInTheDocument();
    expect(tile.querySelector("[data-initial]")?.getAttribute("data-initial") ?? tile.textContent).toBe("U");
  });

  it("an empty fund house or an Others bucket gets a neutral tile, not an initial that looks like a house", () => {
    for (const amc of ["", "   ", "Others", "others"]) {
      const { container, unmount } = render(<SchemeLogo amcName={amc} size="sm" />);
      expect(container.querySelector("img")).toBeNull();
      const tile = screen.getByTestId("scheme-logo");
      expect(tile.querySelector("[data-initial]")?.getAttribute("data-initial") ?? tile.textContent).toBe("–");
      unmount();
    }
  });

  it("logo_map_matches_the_real_list_of_fund_houses", () => {
    const realHouses: Array<[string, string, string]> = [
      ["HDFC Mutual Fund", "HDFC Flexi Cap Fund", "hdfc"],
      ["ICICI Prudential Mutual Fund", "ICICI Prudential Bluechip Fund", "icici"],
      ["SBI Mutual Fund", "SBI Bluechip Fund", "sbi"],
      ["Axis Mutual Fund", "Axis Midcap Fund", "axis"],
      ["Kotak Mahindra Mutual Fund", "Kotak Multi Cap Fund", "kotak"],
      ["Nippon India Mutual Fund", "Nippon India Small Cap Fund", "nippon"],
      ["Mirae Asset Mutual Fund", "Mirae Asset Large Cap Fund", "mirae"],
      ["PPFAS Mutual Fund", "Parag Parikh Flexi Cap Fund", "ppfas"],
      ["UTI Mutual Fund", "UTI Nifty 50 Index Fund", "uti"],
      ["Bandhan Mutual Fund", "Bandhan Core Equity Fund", "bandhan"],
      ["DSP Mutual Fund", "DSP Midcap Fund", "dsp"],
      ["Tata Mutual Fund", "Tata Digital India Fund", "tata"],
      ["Aditya Birla Sun Life Mutual Fund", "Aditya Birla Sun Life Frontline Equity Fund", "birla"],
      ["Motilal Oswal Mutual Fund", "Motilal Oswal Midcap Fund", "motilal"],
      ["Quant Mutual Fund", "Quant Small Cap Fund", "quant"],
      ["Quantum Mutual Fund", "Quantum Long Term Equity Value Fund", "quantum"],
      ["Franklin Templeton Mutual Fund", "Franklin India Prima Fund", "franklin"],
      ["Invesco India Mutual Fund", "Invesco India Contra Fund", "invesco"],
      ["Canara Robeco Mutual Fund", "Canara Robeco Emerging Equities", "canara"],
      ["Sundaram Mutual Fund", "Sundaram Mid Cap Fund", "sundaram"],
      ["Edelweiss Mutual Fund", "Edelweiss Mid Cap Fund", "edelweiss"],
      ["HSBC Mutual Fund", "HSBC Small Cap Fund", "hsbc"],
      ["Bajaj Finserv Mutual Fund", "Bajaj Finserv Flexi Cap Fund", "bajaj"],
      ["Jio BlackRock Mutual Fund", "Jio BlackRock Liquid Fund", "jio"],
      ["Zerodha Fund House", "Zerodha Nifty LargeMidcap 250 Index Fund", "zerodha"],
      ["Groww Mutual Fund", "Groww Value Fund", "groww"],
      ["Navi Mutual Fund", "Navi Nifty 50 Index Fund", "navi"],
      ["Samco Mutual Fund", "Samco Flexi Cap Fund", "samco"],
      ["NJ Mutual Fund", "NJ Balanced Advantage Fund", "nj"],
      ["WhiteOak Capital Mutual Fund", "WhiteOak Capital Flexi Cap Fund", "whiteoak"],
      ["Helios Mutual Fund", "Helios Flexi Cap Fund", "helios"],
      ["Old Bridge Mutual Fund", "Old Bridge Focused Equity Fund", "oldbridge"],
      ["PGIM India Mutual Fund", "PGIM India Midcap Opportunities Fund", "pgim"],
      ["Baroda BNP Paribas Mutual Fund", "Baroda BNP Paribas Large Cap Fund", "baroda"],
      ["Mahindra Manulife Mutual Fund", "Mahindra Manulife Mid Cap Fund", "mahindra"],
      ["LIC Mutual Fund", "LIC MF Large Cap Fund", "lic"],
      ["Union Mutual Fund", "Union Flexi Cap Fund", "union"],
      ["ITI Mutual Fund", "ITI Small Cap Fund", "iti"],
      ["JM Financial Mutual Fund", "JM Flexi Cap Fund", "jm"],
      ["Bank of India Mutual Fund", "Bank of India Flexi Cap Fund", "boi"],
      ["Trust Mutual Fund", "TrustMF Banking & PSU Debt Fund", "trust"],
      ["Shriram Mutual Fund", "Shriram Aggressive Hybrid Fund", "shriram"],
      ["Taurus Mutual Fund", "Taurus Ethical Fund", "taurus"],
      ["360 ONE Mutual Fund", "360 ONE Focused Equity Fund", "360one"],
    ];

    for (const [amcName, schemeName, expectedKey] of realHouses) {
      expect(getAmcInfo(amcName)?.key, `amcName=${amcName}`).toBe(expectedKey);
      expect(getAmcInfo(undefined, schemeName)?.key, `schemeName=${schemeName}`).toBe(expectedKey);
    }

    // Substring collision guards: unknown houses must not receive another house's logo
    expect(getAmcInfo("Alpha Opportunities Mutual Fund", "Alpha Opportunities Fund")).toBeNull();
    expect(getAmcInfo("Public Sector Mutual Fund", "Public Equity Fund")).toBeNull();
    expect(getAmcInfo("Retirement Solutions Mutual Fund", "Retirement Solutions Fund")).toBeNull();
    expect(getAmcInfo("Unlisted Boutique Mutual Fund", "Unlisted Boutique Opportunities Fund")).toBeNull();
  });
});

describe("T7.1 worklist coverage — every listed component renders SchemeLogo when naming a fund or AMC", () => {
  it("allocation cards render SchemeLogo on drill-downs and By AMC rows", () => {
    const assetData = fb.assetAllocation();
    assetData.as_disclosed.classes[0].funds = [
      { scheme_id: "S-KOTAK", scheme_name: "Kotak Multi Cap Fund", value: "1000", percentage: "100" },
    ];
    const assetView = renderInShell(<AssetClassCard state="ready" data={assetData} onRetry={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("list", { name: "Look-through asset breakdown" })).getByRole("button", { name: /Equity/ }));
    expect(hasLogo(screen.getByTestId("drill-fund-S-KOTAK"))).toBe(true);
    assetView.unmount();

    const capData = fb.capAllocation();
    Object.assign(capData, { unclassified_share_pct: "0.00" });
    capData.buckets.forEach((b, i) => Object.assign(b, { percentage_classified: ["61.76", "29.41", "8.83", "0.00"][i] }));
    const capView = renderInShell(<MarketCapCard state="ready" data={capData} onRetry={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("list", { name: "Market-cap breakdown" })).getByRole("button", { name: /Large Cap/ }));
    fireEvent.click(within(screen.getByTestId("stock-0")).getByRole("button"));
    expect(hasLogo(screen.getByTestId("stock-0-fund-S-KOTAK"))).toBe(true);
    capView.unmount();

    const catAmcView = renderInShell(
      <CategoryAmcCard state="ready" data={fb.analyticsAllocation()} onRetry={vi.fn()} holdings={loaded(fx.holdings())} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "By AMC" }));
    expect(hasLogo(screen.getByRole("list", { name: "AMC breakdown" }))).toBe(true);
    fireEvent.click(within(screen.getByRole("list", { name: "AMC breakdown" })).getByRole("button", { name: /HDFC Mutual Fund/ }));
    expect(hasLogo(screen.getByTestId("drill-fund-S-HDFC"))).toBe(true);
    catAmcView.unmount();

    const fmData = fb.fundManager();
    fmData.manager_groups.forEach(g => Object.assign(g, { main_source: "marked" }));
    const fmView = renderInShell(<FundManagerCard state="ready" data={fmData} onRetry={vi.fn()} xirrByScheme={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Harsha Upadhyaya" }));
    expect(hasLogo(screen.getByTestId("manager-fund-harsha-upadhyaya-kotak-mahindra-mf-S-KOTAK"))).toBe(true);
    fmView.unmount();
  });

  it("overview AmcAllocationCard and SipTimeline render SchemeLogo", () => {
    const amcView = renderInShell(
      <AmcAllocationCard allocation={loaded(fx.allocation().allocation)} holdings={loaded(fx.holdings())} />,
    );
    expect(hasLogo(screen.getByTestId("legend-kotak-mahindra-mutual-fund"))).toBe(true);
    fireEvent.click(within(screen.getByTestId("legend-hdfc-mutual-fund")).getByRole("button"));
    expect(hasLogo(screen.getByRole("dialog", { name: "HDFC Mutual Fund" }))).toBe(true);
    amcView.unmount();

    const sipView = renderInShell(<SipTimeline sips={loaded(fx.sips().sips)} />);
    expect(hasLogo(screen.getByTestId("sip-next"))).toBe(true);
    expect(hasLogo(screen.getByTestId("sip-detail"))).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Stopped (1)" }));
    expect(hasLogo(screen.getByTestId("sip-stopped-S-SBI"))).toBe(true);
    sipView.unmount();
  });

  it("overlap components render SchemeLogo", () => {
    const summary = fc.overlapSummary();
    const stripView = renderInShell(<StatStrip summary={summary} />);
    expect(hasLogo(screen.getByTestId("stat-highest"))).toBe(true);
    stripView.unmount();

    const chView = renderInShell(<CommonHoldings state="ready" data={fc.stockHoldings()} onRetry={vi.fn()} />);
    fireEvent.click(screen.getByTestId("common-toggle-INE040A01034"));
    expect(hasLogo(screen.getByTestId("common-fund-INE040A01034-S-KOTAK"))).toBe(true);
    chView.unmount();

    const hmView = renderInShell(
      <Heatmap state="ready" data={summary} onRetry={vi.fn()} selectedKey="S-KOTAK~S-SBI" onSelect={vi.fn()} />,
    );
    expect(hasLogo(screen.getByTestId("hm-col-S-KOTAK"))).toBe(true);
    expect(hasLogo(screen.getByTestId("hm-row-S-SBI"))).toBe(true);
    expect(hasLogo(screen.getByTestId("pair-detail"))).toBe(true);
    hmView.unmount();

    const tpView = renderInShell(
      <TopPairs state="ready" data={summary} onRetry={vi.fn()} selectedKey="S-KOTAK~S-SBI" onSelect={vi.fn()} />,
    );
    expect(hasLogo(screen.getByTestId("pair-row-S-KOTAK~S-SBI"))).toBe(true);
    tpView.unmount();

    const idView = renderInShell(<ImpactDonut state="ready" data={fa.overlapSummaryWithAsks()} onRetry={vi.fn()} />);
    expect(hasLogo(screen.getByTestId("impact-pair-title-S-KOTAK~S-SBI"))).toBe(true);
    idView.unmount();
  });

  it("holdings AllStocksTable and TopHoldingsByFund render SchemeLogo", () => {
    const stocksView = renderInShell(<AllStocksTable state="ready" data={fb.stockHoldings()} onRetry={vi.fn()} />);
    fireEvent.click(within(screen.getByTestId("stock-row-INE040A01034")).getByRole("button"));
    expect(hasLogo(screen.getByTestId("stock-fund-INE040A01034-S-KOTAK"))).toBe(true);
    stocksView.unmount();

    const topView = render(<TopHoldingsByFund state="ready" data={fb.stockHoldings()} onRetry={vi.fn()} />);
    expect(hasLogo(screen.getByTestId("chip-S-KOTAK"))).toBe(true);
    expect(hasLogo(screen.getByTestId("fund-strip"))).toBe(true);
    topView.unmount();
  });

  it("transactions Ledger and PeriodDrill render SchemeLogo", () => {
    const buckets = fb.investmentWithdrawal().monthly;
    const ledgerView = render(<Ledger buckets={buckets} filter="all" onFilter={vi.fn()} />);
    expect(hasLogo(screen.getByTestId("ledger-row-t-0067"))).toBe(true);
    ledgerView.unmount();

    const month = buckets.find(b => b.period === "2026-03")!;
    const drillView = render(<PeriodDrill bucket={month} />);
    expect(hasLogo(screen.getByTestId("drill-row-SBI Bluechip Fund"))).toBe(true);
    drillView.unmount();
  });

  it("home MoverRow (fund view) and Movers dialog render SchemeLogo", () => {
    const moversFund = homeFixture<MoversResponse>("movers_fund");
    const rowView = renderInShell(<MoverRow bar={moversFund.gains[0]} view="fund" maxAbs={100} onOpen={vi.fn()} />);
    expect(hasLogo(screen.getByTestId(`mover-tile-${moversFund.gains[0].key}`))).toBe(true);
    rowView.unmount();

    const moversSector = homeFixture<MoversResponse>("movers_sector");
    const moversView = renderInShell(
      <Movers status="data" data={moversSector} view="sector" onViewChange={vi.fn()} onRetry={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId(`mover-${moversSector.gains[0].key}`));
    expect(hasLogo(screen.getByRole("dialog"))).toBe(true);
    moversView.unmount();
  });

  it("individual-fund overlap panels render SchemeLogo", () => {
    const overlap = ifFixture<OverlapResponse>("overlap_fund");
    const compare = ifFixture<OverlapCompareResponse>("overlap_compare");

    const topView = render(<TopOverlapFunds funds={overlap.top_overlap_funds} fundName="Alpha Fund" onCompare={vi.fn()} />);
    expect(hasLogo(screen.getByRole("listbox", { name: "Funds to compare" }))).toBe(true);
    topView.unmount();

    const chTableView = render(<CommonHoldingsTable holdings={overlap.common_holdings} />);
    expect(hasLogo(screen.getByRole("table", { name: "Common holdings" }))).toBe(true);
    chTableView.unmount();

    const chPanelView = render(<CommonHoldingsPanel data={compare} />);
    expect(hasLogo(screen.getByRole("table", { name: "Common holdings of the two funds" }))).toBe(true);
    chPanelView.unmount();

    const uhPanelView = render(<UniqueHoldingsPanel data={compare} />);
    expect(hasLogo(screen.getByRole("region", { name: `Unique to ${compare.fund_a.scheme_name}` }))).toBe(true);
    uhPanelView.unmount();

    const secPanelView = render(<SectorComparisonPanel data={compare} />);
    expect(hasLogo(screen.getByRole("table", { name: "Sector comparison" }))).toBe(true);
    secPanelView.unmount();

    const mcPanelView = render(<MarketCapPanel data={compare} />);
    expect(hasLogo(screen.getByRole("table", { name: "Market cap comparison" }))).toBe(true);
    mcPanelView.unmount();

    const coView = render(<ComparisonOverview data={compare} />);
    expect(hasLogo(screen.getByTestId("count-unique-a"))).toBe(true);
    expect(hasLogo(screen.getByTestId("impact-row-unique_a"))).toBe(true);
    coView.unmount();
  });

  it("portfolio QuickInsights renders SchemeLogo on largest holding and largest AMC", () => {
    const view = renderInShell(
      <QuickInsights status="data" data={insightsFixture<PortfolioInsightsResponse>("insights_family")} onRetry={vi.fn()} />,
    );
    expect(hasLogo(screen.getByTestId("insight-largest-holding"))).toBe(true);
    expect(hasLogo(screen.getByTestId("insight-largest-amc"))).toBe(true);
    view.unmount();
  });
});
