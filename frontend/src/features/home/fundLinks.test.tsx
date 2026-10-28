import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { MoverRow } from "./components/MoverRow";
import { fixture } from "./fixtures";
import { newsFixture } from "./fixtures/newsFixtures";
import { formatSignedRupees } from "./homeFormat";
import { Greeting } from "./sections/Greeting";
import { Movers } from "./sections/Movers";
import { News } from "./sections/News";
import { WorthALook } from "./sections/WorthALook";
import type { MoverBarOut, MoversResponse, NewsResponse, SummaryResponse, WorthCardOut, WorthResponse } from "./types";

// Entry points to the Individual Fund page from Home (packet IF-E). The fund page route is live in the real registry.
const LARGE = "54b8755e-6b2b-5f4f-a8fe-b41125031af6";
const GOLD = "7c906599-2ff8-5de4-83f9-b94651c683f2";
const DEBT = "cf09c887-92a1-5b49-a624-7f067ed6a2c8";
const FLEXI = "fe06ac21-f8c7-5dbf-a877-5c703ddbcdef";
const page = (id: string) => `/portfolio/mutual-funds/funds/${id}`;
const NOT_LIVE = buildRegistry().map(route => (route.id === "portfolio-mutual-funds-fund" ? { ...route, status: "placeholder" as const } : route));

const byFund = () => fixture<MoversResponse>("movers_fund");
const bySector = () => fixture<MoversResponse>("movers_sector");
const byCategory = () => fixture<MoversResponse>("movers_category_fallback");

function showMovers(data: MoversResponse, view: "fund" | "sector" | "category" = "fund", routes = buildRegistry()) {
  return renderInShell(<Movers status="data" data={data} view={view} onViewChange={vi.fn()} onRetry={vi.fn()} />, { routes });
}
const row = (key: string) => screen.getByTestId(`mover-${key}`);

function oneFundBar(overrides: Partial<MoverBarOut> = {}): MoverBarOut {
  return { key: "row-key", label: "Solo Fund", change: "5.00", funds: [{ scheme_id: "solo-id", name: "Solo Fund", change: "5.00" }], ...overrides };
}
const showRow = (bar: MoverBarOut, view: "fund" | "sector" | "category" = "fund") => {
  const onOpen = vi.fn();
  const view_ = renderInShell(<MoverRow bar={bar} view={view} maxAbs={10} onOpen={onOpen} />);
  return { onOpen, ...view_ };
};

describe("Home: the Movers rows of the fund grouping link to the fund page", () => {
  it("makes the name of every fund row a link to that fund's page, gains and losses alike", () => {
    showMovers(byFund());
    expect(within(row(LARGE)).getByRole("link", { name: "Asha Large Cap" })).toHaveAttribute("href", page(LARGE));
    expect(within(row(GOLD)).getByRole("link", { name: "Dev Gold Fund" })).toHaveAttribute("href", page(GOLD));
    expect(within(row(FLEXI)).getByRole("link", { name: "Asha Flexi Cap" })).toHaveAttribute("href", page(FLEXI));
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("takes the fund page from the fund the row stands for, not from the row key", () => {
    showRow(oneFundBar());
    expect(screen.getByRole("link", { name: "Solo Fund" })).toHaveAttribute("href", page("solo-id"));
  });

  it("encodes the scheme id in the address", () => {
    showRow(oneFundBar({ funds: [{ scheme_id: "a b/c", name: "Solo Fund", change: "5.00" }] }));
    expect(screen.getByRole("link", { name: "Solo Fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/a%20b%2Fc");
  });

  it("can be reached with the keyboard; the link is never inside a button, the row has its own separate open button", () => {
    showRow(oneFundBar());
    const link = screen.getByRole("link", { name: "Solo Fund" });
    link.focus();
    expect(link).toHaveFocus();
    expect(link.closest("button, [role='button']")).toBeNull();
    const rowElement = screen.getByTestId("mover-row-key");
    expect(rowElement).not.toHaveAttribute("role");
    expect(rowElement).not.toHaveAttribute("tabindex");
    const opener = within(rowElement).getByRole("button", { name: "Show the funds in Solo Fund" });
    opener.focus();
    expect(opener).toHaveFocus();
    expect(opener.querySelector("a")).toBeNull();
    expect(within(rowElement).getAllByRole("button")).toHaveLength(1);
  });

  it("has no link inside a button anywhere in the fund grouping, and keeps a row without a link as a focusable button", () => {
    const { unmount } = showMovers(byFund());
    for (const link of screen.getAllByRole("link")) expect(link.closest("button, [role='button']")).toBeNull();
    unmount();
    showRow(oneFundBar({ funds: [] }));
    const plain = screen.getByTestId("mover-row-key");
    expect(plain).toHaveAttribute("role", "button");
    expect(plain).toHaveAttribute("tabindex", "0");
    expect(within(plain).queryAllByRole("button")).toHaveLength(0);
  });

  it("does not open the funds popup when the name is clicked or Enter or Space is pressed on it", () => {
    showMovers(byFund());
    const link = within(row(LARGE)).getByRole("link", { name: "Asha Large Cap" });
    fireEvent.click(link);
    fireEvent.keyDown(link, { key: "Enter" });
    fireEvent.keyDown(link, { key: " " });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still opens the popup, exactly once per press, from the row or from its open button (a button's Enter or Space arrives as a click)", () => {
    const { onOpen } = showRow(oneFundBar());
    const rowElement = screen.getByTestId("mover-row-key");
    fireEvent.click(rowElement);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(within(rowElement).getByRole("button", { name: "Show the funds in Solo Fund" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("link", { name: "Solo Fund" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("still opens the popup from a row without a link by click, Enter and Space", () => {
    const { onOpen } = showRow(oneFundBar({ funds: [] }));
    const rowElement = screen.getByTestId("mover-row-key");
    fireEvent.click(rowElement);
    fireEvent.keyDown(rowElement, { key: "Enter" });
    fireEvent.keyDown(rowElement, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it("still opens the popup on a click on the change amount of a real row", () => {
    showMovers(byFund());
    fireEvent.click(within(row(LARGE)).getByText(formatSignedRupees("10.00")));
    expect(screen.getByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("has no fund link in the sector or the category grouping, where a row is not one fund", () => {
    const { unmount } = showMovers(bySector(), "sector");
    expect(within(row("Banks")).queryByRole("link")).toBeNull();
    expect(within(row("Banks")).getByText("Banks")).toBeInTheDocument();
    unmount();
    showMovers(byCategory(), "category");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows plain text when the row stands for several funds, or when the fund has no id", () => {
    const two = oneFundBar({ funds: [oneFundBar().funds[0], { scheme_id: "other-id", name: "Other", change: "1.00" }] });
    const { unmount } = showRow(two);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Solo Fund")).toBeInTheDocument();
    unmount();
    showRow(oneFundBar({ funds: [{ scheme_id: "", name: "Solo Fund", change: "5.00" }] }));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Solo Fund")).toBeInTheDocument();
  });

  it("shows plain text for a row with no fund at all", () => {
    showRow(oneFundBar({ funds: [] }));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Solo Fund")).toBeInTheDocument();
  });

  it("is greyed and inert while the fund page is not live, and a click on it still does not open the popup", () => {
    showMovers(byFund(), "fund", NOT_LIVE);
    const link = within(row(LARGE)).getByRole("link", { name: "Asha Large Cap" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("href");
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Home: the funds in the Movers popup link to the fund page", () => {
  it("links the fund inside the popup of a fund row, keeping its amount", () => {
    showMovers(byFund());
    fireEvent.click(within(row(LARGE)).getByText(formatSignedRupees("10.00")));
    const dialog = screen.getByRole("dialog", { name: "Asha Large Cap funds" });
    expect(within(dialog).getByRole("link", { name: "Asha Large Cap" })).toHaveAttribute("href", page(LARGE));
    expect(within(dialog).getByText(formatSignedRupees("10.00"))).toBeInTheDocument();
    expect(within(dialog).getAllByRole("link")).toHaveLength(1);
  });

  it("links every fund of a sector row, in the order sent", () => {
    showMovers(bySector(), "sector");
    fireEvent.click(row("Banks"));
    const dialog = screen.getByRole("dialog", { name: "Banks funds" });
    const links = within(dialog).getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["Asha Large Cap", "Dev Gold Fund", "Dev Short Duration Debt", "Asha Flexi Cap"]);
    expect(links.map(link => link.getAttribute("href"))).toEqual([page(LARGE), page(GOLD), page(DEBT), page(FLEXI)]);
  });

  it("shows a fund without an id as plain text and links the others", () => {
    const data = bySector();
    data.gains[0].funds[1].scheme_id = "";
    showMovers(data, "sector");
    fireEvent.click(row("Banks"));
    const dialog = screen.getByRole("dialog", { name: "Banks funds" });
    expect(within(dialog).getAllByRole("link")).toHaveLength(3);
    expect(within(dialog).queryByRole("link", { name: "Dev Gold Fund" })).toBeNull();
    expect(within(dialog).getByText("Dev Gold Fund")).toBeInTheDocument();
  });

  it("still opens from the greeting's request and still closes with Escape", () => {
    renderInShell(
      <Movers status="data" data={byFund()} view="fund" onViewChange={vi.fn()} onRetry={vi.fn()} openRequest={{ name: "Asha Large Cap", schemeId: LARGE, token: 1 }} />
    );
    const dialog = screen.getByRole("dialog", { name: "Asha Large Cap funds" });
    expect(within(dialog).getByRole("link", { name: "Asha Large Cap" })).toHaveAttribute("href", page(LARGE));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Home: the greeting keeps its own behaviour (register C149)", () => {
  it("leaves the top mover's name a button that opens the popup, not a link to the fund page", () => {
    const onTopMover = vi.fn();
    renderInShell(<Greeting status="data" summary={fixture<SummaryResponse>("summary_family")} onImport={vi.fn()} onTopMover={onTopMover} />);
    expect(within(screen.getByTestId("greeting-sentence")).queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Asha Large Cap" }));
    expect(onTopMover).toHaveBeenCalledTimes(1);
  });
});

describe("Home: the funds in the news popup link to the fund page", () => {
  const openWhy = (data: NewsResponse, index: number, routes = buildRegistry()) => {
    renderInShell(<News status="data" data={data} refreshing={false} onRefresh={vi.fn()} />, { routes });
    fireEvent.click(within(screen.getAllByTestId(/^news-item-/)[index]).getByRole("button", { name: /^Why this\?/ }));
    return within(screen.getByRole("dialog", { name: "Why this?" }));
  };

  it("links every fund involved to its page, in the order sent, with the weight beside it", () => {
    const dialog = openWhy(newsFixture<NewsResponse>("news_specific_three"), 1);
    const links = dialog.getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["Dev Short Duration Debt", "Asha Large Cap", "Dev Gold Fund", "Asha Flexi Cap"]);
    expect(links.map(link => link.getAttribute("href"))).toEqual([page(DEBT), page(LARGE), page(GOLD), page(FLEXI)]);
    expect(dialog.getAllByTestId("why-fund-weight").map(node => node.textContent)).toEqual(["38.41%", "23.22%", "19.38%", "18.99%"]);
  });

  it("shows a fund with no id as plain text and links the rest", () => {
    const data = newsFixture<NewsResponse>("news_specific_three");
    data.items[1].funds[2].scheme_id = "";
    const dialog = openWhy(data, 1);
    expect(dialog.getAllByRole("link")).toHaveLength(3);
    expect(dialog.queryByRole("link", { name: "Dev Gold Fund" })).toBeNull();
    expect(dialog.getByText("Dev Gold Fund")).toBeInTheDocument();
  });

  it("keeps See affected holdings greyed, as it was", () => {
    const dialog = openWhy(newsFixture<NewsResponse>("news_specific_three"), 1);
    const cta = dialog.getByText("See affected holdings");
    expect(cta).toHaveAttribute("aria-disabled", "true");
    expect(dialog.queryByRole("link", { name: "See affected holdings" })).toBeNull();
  });

  it("greys the names while the fund page is not live", () => {
    const dialog = openWhy(newsFixture<NewsResponse>("news_specific_three"), 1, NOT_LIVE);
    const link = dialog.getByRole("link", { name: "Asha Large Cap" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("href");
  });
});

describe("Home: Worth a look links 'Review this fund' to the fund page", () => {
  const cards = () => fixture<WorthResponse>("worth_three_cards");
  const show = (data: WorthResponse, routes = buildRegistry()) => renderInShell(<WorthALook status="data" data={data} />, { routes });
  const expense: WorthCardOut = {
    kind: "high_expense", rank: 4, scheme_id: "s", scheme_name: "Summit Small Cap Fund",
    evidence: { ter: "0.95", category_avg_ter: "0.25", gap_pp: "0.70", plan_type: "direct", share_pct: "5.00" },
  };

  it("opens the weak fund's and the lagging fund's own page", () => {
    show(cards());
    expect(within(screen.getByTestId("worth-card-weak_fund")).getByRole("link", { name: "Review this fund" })).toHaveAttribute("href", page(LARGE));
    expect(within(screen.getByTestId("worth-card-underperforming")).getByRole("link", { name: "Review this fund" })).toHaveAttribute("href", page(FLEXI));
  });

  it("keeps the concentration link greyed: it is not about one fund", () => {
    show(cards());
    const card = screen.getByTestId("worth-card-concentration");
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(card).getByText("See what is driving it").closest("[aria-disabled]")).toHaveAttribute("title", "Coming soon");
  });

  it("keeps the cost link greyed even though the card names a fund: its target is a cost comparison, not the fund page", () => {
    const data = cards();
    data.cards = [expense];
    show(data);
    const card = screen.getByTestId("worth-card-high_expense");
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(card).getByText("See how costs compare").closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps the link greyed when the card has no scheme id, and encodes an odd one", () => {
    const data = cards();
    data.cards[0].scheme_id = null;
    data.cards[1].scheme_id = "a b/c";
    show(data);
    const weak = screen.getByTestId("worth-card-weak_fund");
    expect(within(weak).queryByRole("link")).toBeNull();
    expect(within(weak).getByText("Review this fund").closest("[aria-disabled]")).toHaveAttribute("title", "Coming soon");
    expect(within(screen.getByTestId("worth-card-underperforming")).getByRole("link", { name: "Review this fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/a%20b%2Fc");
  });

  it("greys the link while the fund page is not live", () => {
    show(cards(), NOT_LIVE);
    const link = within(screen.getByTestId("worth-card-weak_fund")).getByRole("link", { name: "Review this fund" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("href");
  });
});
