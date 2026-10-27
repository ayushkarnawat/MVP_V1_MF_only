import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { newsFixture } from "../fixtures/newsFixtures";
import { NEWS_GENERAL_NOTE, NEWS_HOW_NOTE, NEWS_HOW_WE_PICK, NEWS_WHY_TEXT } from "../newsCopy";
import type { NewsResponse } from "../types";
import { News, type NewsProps } from "./News";

function setup(overrides: Partial<NewsProps> = {}) {
  const onRefresh = vi.fn();
  const props: NewsProps = { status: "data", data: newsFixture("news_specific_three"), refreshing: false, onRefresh, ...overrides };
  const view = render(<News {...props} />);
  return { ...view, onRefresh };
}

const items = () => screen.getAllByTestId(/^news-item-/);

describe("News: states", () => {
  it("shows a loading placeholder", () => {
    setup({ status: "loading", data: null });
    expect(screen.getByRole("status", { name: "Loading news" })).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows nothing at all when the request failed: the section never blocks the page", () => {
    const { container } = setup({ status: "error", data: null });
    expect(container.innerHTML).toBe("");
  });

  it("treats data status without data like a failure", () => {
    const { container } = setup({ status: "data", data: null });
    expect(container.innerHTML).toBe("");
  });

  it.each(["news_hidden", "news_empty", "news_disabled"])("shows nothing for %s", name => {
    const { container } = setup({ data: newsFixture(name) });
    expect(container.innerHTML).toBe("");
  });

  it("shows nothing when the feed is flagged hidden even if items came along", () => {
    const { container } = setup({ data: { ...newsFixture<NewsResponse>("news_specific_three"), hidden: true, state: "hidden" } });
    expect(container.innerHTML).toBe("");
  });
});

describe("News: the card", () => {
  it("is a labelled region whose title, subtext and disclaimer come from the server's texts", () => {
    const data = newsFixture<NewsResponse>("news_specific_three");
    data.texts = { ...data.texts, title: "A server title", subtext: "A server subtext", disclaimer: "A server disclaimer" };
    setup({ data });
    const region = screen.getByRole("region", { name: "A server title" });
    expect(within(region).getByRole("heading", { level: 3, name: "A server title" })).toBeInTheDocument();
    expect(within(region).getByTestId("news-subtext")).toHaveTextContent("A server subtext");
    expect(within(region).getByTestId("news-disclaimer")).toHaveTextContent("A server disclaimer");
  });

  it("uses the golden texts, with the disclaimer last and the GDELT credit nowhere on the card", () => {
    setup();
    const region = screen.getByRole("region", { name: "News affecting top holdings" });
    expect(screen.getByTestId("news-subtext")).toHaveTextContent("Headlines about companies your funds hold");
    const disclaimer = screen.getByTestId("news-disclaimer");
    expect(disclaimer).toHaveTextContent("Headlines are from third-party sources and shown for information. They are not investment advice or research.");
    expect(region.lastElementChild).toBe(disclaimer);
    expect(region.textContent).not.toMatch(/GDELT/);
  });

  it("lists the headlines in the order the server sent them", () => {
    setup();
    expect(items()).toHaveLength(3);
    const names = items().map(item => within(item).getByTestId("news-headline").textContent);
    expect(names).toEqual([
      "HDFC Bank shares rally after strong quarterly results",
      "HDFC Mutual Fund AUM crosses record high as fund house expands",
      "Gold prices hit a new all-time high amid global uncertainty",
    ]);
    expect(items().map(item => item.getAttribute("data-testid"))).toEqual(newsFixture<NewsResponse>("news_specific_three").items.map(item => `news-item-${item.id}`));
  });

  it("opens each publisher in a new tab, safely", () => {
    setup();
    const link = screen.getByRole("link", { name: "HDFC Bank shares rally after strong quarterly results" });
    expect(link).toHaveAttribute("href", "https://example.com/bf7c1c8d-0922-5020-9f47-b56e7a133eed");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")?.split(" ").sort()).toEqual(["noopener", "noreferrer"]);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("does not turn an address that is not a web address into a link", () => {
    const data = newsFixture<NewsResponse>("news_specific_three");
    data.items[0].url = "javascript:alert(1)";
    setup({ data });
    expect(screen.getAllByRole("link")).toHaveLength(2);
    const headline = within(items()[0]).getByTestId("news-headline");
    expect(headline.tagName).toBe("SPAN");
    expect(headline).toHaveTextContent("HDFC Bank shares rally after strong quarterly results");
  });

  it("gives each row an icon tile for its category", () => {
    setup();
    expect(items().map(item => within(item).getByTestId("news-icon").getAttribute("data-icon"))).toEqual(["chart-candlestick", "chart-pie", "coins"]);
  });

  it("writes one grey meta line per row: kind, publisher, how long ago (by the server's clock)", () => {
    setup();
    expect(items().map(item => within(item).getByTestId("news-meta").textContent)).toEqual([
      "Company news · Moneycontrol · 2 h ago",
      "Fund house · Mint · 4 h ago",
      "Gold and silver · The Economic Times · 6 h ago",
    ]);
  });

  it("writes the exposure line the server composed, followed by the Why this? button", () => {
    setup();
    const lines = items().map(item => within(item).getByTestId("news-exposure").textContent);
    expect(lines).toEqual([
      "About 5% of your portfolio (holdings as of Sep 2026) · Why this?",
      "About 100% of your portfolio · Why this?",
      "About 19.4% of your portfolio · Why this?",
    ]);
  });

  it("shows only Why this? when the server sent no exposure (low coverage)", () => {
    setup({ data: newsFixture("news_low_coverage") });
    const first = items()[0];
    expect(within(first).getByTestId("news-exposure").textContent).toBe("Why this?");
    expect(first.textContent).not.toMatch(/About \d/);
    expect(within(items()[2]).getByTestId("news-exposure")).toHaveTextContent("About 19.4% of your portfolio");
  });

  it("gives a general headline no exposure line and no Why this? button", () => {
    setup({ data: newsFixture("news_general_only") });
    expect(screen.queryByTestId("news-exposure")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Why this\?/ })).toBeNull();
  });

  it("mixes a general filler with specific rows: only the specific ones explain themselves", () => {
    setup({ data: newsFixture("news_member_debt") });
    expect(screen.getAllByRole("button", { name: /^Why this\?/ })).toHaveLength(2);
    expect(within(items()[2]).queryByTestId("news-exposure")).toBeNull();
    expect(screen.queryByTestId("news-general-note")).toBeNull();
  });

  it("says so when every shown headline is general", () => {
    setup({ data: newsFixture("news_general_only") });
    expect(screen.getByTestId("news-general-note")).toHaveTextContent(NEWS_GENERAL_NOTE);
    expect(screen.getByRole("heading", { level: 3, name: "News affecting top holdings" })).toBeInTheDocument();
    expect(items()).toHaveLength(3);
  });

  it("has no general note when some headline is specific", () => {
    setup();
    expect(screen.queryByTestId("news-general-note")).toBeNull();
  });
});

describe("News: stale feed", () => {
  it("shows no stale label for a fresh feed", () => {
    setup();
    expect(screen.queryByTestId("news-stale")).toBeNull();
  });

  it("labels a feed older than 36 hours with when it was last updated, keeping the headlines", () => {
    setup({ data: newsFixture("news_stale") });
    expect(screen.getByTestId("news-stale")).toHaveTextContent("Updated 1 d ago");
    expect(items()).toHaveLength(1);
  });

  it("follows the server's flag, not its own arithmetic", () => {
    const data = newsFixture<NewsResponse>("news_specific_three");
    data.stale = true;
    setup({ data });
    expect(screen.getByTestId("news-stale")).toHaveTextContent("Updated 1 h ago");
  });
});

describe("News: refresh button", () => {
  it("is a button named Refresh news that says when the feed was last updated", () => {
    const { onRefresh } = setup();
    const button = screen.getByRole("button", { name: "Refresh news" });
    expect(button).toHaveAttribute("title", "Updated 1 h ago");
    expect(button).toHaveAttribute("aria-busy", "false");
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows it is working, keeps the headlines, and ignores clicks until done", () => {
    const { onRefresh } = setup({ refreshing: true });
    const button = screen.getByRole("button", { name: "Refresh news" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).toHaveClass("animate-spin");
    fireEvent.click(button);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(items()).toHaveLength(3);
  });

  it("does not spin when idle", () => {
    setup();
    expect(screen.getByRole("button", { name: "Refresh news" }).querySelector("svg")).not.toHaveClass("animate-spin");
  });
});

describe("News: Why this?", () => {
  const open = (index: number) => fireEvent.click(within(items()[index]).getByRole("button", { name: /^Why this\?/ }));

  it("names the button after the headline too, so the buttons differ", () => {
    setup();
    const names = screen.getAllByRole("button", { name: /^Why this\?/ }).map(button => button.getAttribute("aria-label"));
    expect(names).toEqual([
      "Why this? HDFC Bank shares rally after strong quarterly results",
      "Why this? HDFC Mutual Fund AUM crosses record high as fund house expands",
      "Why this? Gold prices hit a new all-time high amid global uncertainty",
    ]);
  });

  it("opens a dialog with the reason and how the card works, and no dialog before that", () => {
    setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    open(0);
    const dialog = screen.getByRole("dialog", { name: "Why this?" });
    expect(within(dialog).getByTestId("why-reason")).toHaveTextContent("Mentions Top Stock 1, which your funds invest in");
    expect(dialog).toHaveTextContent(NEWS_WHY_TEXT);
  });

  it("lists the funds involved in the order sent, as plain greyed names (their pages do not exist yet)", () => {
    setup();
    open(1);
    const dialog = screen.getByRole("dialog", { name: "Why this?" });
    expect(within(dialog).getByText("Funds involved")).toBeInTheDocument();
    const rows = within(within(dialog).getByTestId("why-funds")).getAllByRole("listitem");
    const names = ["Dev Short Duration Debt", "Asha Large Cap", "Dev Gold Fund", "Asha Flexi Cap"];
    const weights = ["38.41%", "23.22%", "19.38%", "18.99%"];
    expect(rows.map(row => row.textContent)).toEqual(names.map((name, index) => `${name}${weights[index]}`));
    rows.forEach((row, index) => {
      const name = within(row).getByText(names[index]);
      expect(name).toHaveAttribute("aria-disabled", "true");
      expect(name).toHaveAttribute("title", "Coming soon");
    });
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("shows each fund's share of the portfolio as the server's own text with a percent sign, one per fund, in the sent order", () => {
    setup();
    open(1);
    const dialog = screen.getByRole("dialog", { name: "Why this?" });
    const shown = within(dialog).getAllByTestId("why-fund-weight");
    expect(shown.map(node => node.textContent)).toEqual(["38.41%", "23.22%", "19.38%", "18.99%"]);
    // The weight belongs to its own row, and is not styled as the disabled name.
    const rows = within(within(dialog).getByTestId("why-funds")).getAllByRole("listitem");
    rows.forEach((row, index) => {
      expect(within(row).getByTestId("why-fund-weight")).toBe(shown[index]);
      expect(shown[index]).not.toHaveAttribute("aria-disabled");
    });
  });

  it("shows the weight exactly as sent, whatever the digits (no rounding, no reformatting)", () => {
    const data = newsFixture<NewsResponse>("news_specific_three");
    data.items[1].funds[0].weight_pct = "0.05";
    data.items[1].funds[1].weight_pct = "100.00";
    setup({ data });
    open(1);
    const shown = within(screen.getByRole("dialog", { name: "Why this?" })).getAllByTestId("why-fund-weight");
    expect(shown.map(node => node.textContent).slice(0, 2)).toEqual(["0.05%", "100.00%"]);
  });

  it("leaves out the weight of a fund the server sends none for (null or missing), keeping its name and the rest", () => {
    const data = newsFixture<NewsResponse>("news_specific_three");
    data.items[1].funds[0].weight_pct = null;
    delete data.items[1].funds[1].weight_pct;
    setup({ data });
    open(1);
    const rows = within(within(screen.getByRole("dialog", { name: "Why this?" })).getByTestId("why-funds")).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).queryByTestId("why-fund-weight")).toBeNull();
    expect(within(rows[1]).queryByTestId("why-fund-weight")).toBeNull();
    expect(rows[0].textContent).toBe("Dev Short Duration Debt");
    expect(rows[1].textContent).toBe("Asha Large Cap");
    expect(within(rows[2]).getByTestId("why-fund-weight")).toHaveTextContent("19.38%");
    expect(within(rows[3]).getByTestId("why-fund-weight")).toHaveTextContent("18.99%");
  });

  it("shows no weight at all on an older server that sends none", () => {
    const data = newsFixture<NewsResponse>("news_specific_three");
    for (const fund of data.items[1].funds) delete fund.weight_pct;
    setup({ data });
    open(1);
    const dialog = screen.getByRole("dialog", { name: "Why this?" });
    expect(within(dialog).queryByTestId("why-fund-weight")).toBeNull();
    expect(within(within(dialog).getByTestId("why-funds")).getAllByRole("listitem").map(row => row.textContent))
      .toEqual(["Dev Short Duration Debt", "Asha Large Cap", "Dev Gold Fund", "Asha Flexi Cap"]);
  });

  it("offers See affected holdings greyed, never as a button or link, only when funds are listed", () => {
    setup();
    open(1);
    let dialog = screen.getByRole("dialog", { name: "Why this?" });
    const cta = within(dialog).getByText("See affected holdings");
    expect(cta).toHaveAttribute("aria-disabled", "true");
    expect(cta).toHaveAttribute("title", "Coming soon");
    expect(within(dialog).queryByRole("button", { name: "See affected holdings" })).toBeNull();
    expect(within(dialog).queryByRole("link", { name: "See affected holdings" })).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    open(0);
    dialog = screen.getByRole("dialog", { name: "Why this?" });
    expect(within(dialog).queryByText("Funds involved")).toBeNull();
    expect(within(dialog).queryByText("See affected holdings")).toBeNull();
    expect(within(dialog).queryByTestId("why-funds")).toBeNull();
  });

  it("explains how headlines are picked, in the seven steps", () => {
    setup();
    open(2);
    const how = within(screen.getByRole("dialog", { name: "Why this?" })).getByTestId("why-how");
    expect(within(how).getByText("How we pick these headlines")).toBeInTheDocument();
    expect(within(how).getAllByRole("listitem").map(row => row.textContent)).toEqual([...NEWS_HOW_WE_PICK]);
    expect(how).toHaveTextContent(NEWS_HOW_NOTE);
  });

  it("shows the reason of the row that was clicked", () => {
    setup();
    open(2);
    expect(screen.getByTestId("why-reason")).toHaveTextContent("About gold and silver, which your funds invest in");
  });

  it("closes with Escape or the close button and puts focus back on the Why this? button", async () => {
    setup();
    const button = within(items()[1]).getByRole("button", { name: /^Why this\?/ });
    button.focus();
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Why this?" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(button).toHaveFocus());

    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Why this?" })).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(button).toHaveFocus());
    expect(dialog).not.toBeInTheDocument();
  });

  it("does not follow the publisher link when Why this? is pressed", () => {
    setup();
    const link = screen.getAllByRole("link")[0];
    const followed = vi.fn();
    link.addEventListener("click", followed);
    open(0);
    expect(followed).not.toHaveBeenCalled();
  });
});
