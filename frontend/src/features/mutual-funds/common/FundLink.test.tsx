import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { FundLink } from "./FundLink";

const NOT_LIVE = buildRegistry().map(route => (route.id === "portfolio-mutual-funds-fund" ? { ...route, status: "placeholder" as const } : route));

describe("FundLink (Mutual Funds)", () => {
  it("is a real link to the fund page, named by the fund's name", () => {
    renderInShell(<FundLink schemeId="S-KOTAK">Kotak Multi Cap Fund</FundLink>);
    const link = screen.getByRole("link", { name: "Kotak Multi Cap Fund" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-KOTAK");
  });

  it("encodes the scheme id in the address", () => {
    renderInShell(<FundLink schemeId="a b/c">Odd Fund</FundLink>);
    expect(screen.getByRole("link", { name: "Odd Fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/a%20b%2Fc");
  });

  it.each([null, undefined, ""])("shows plain text, not a link, when the scheme id is %j", id => {
    renderInShell(<div data-testid="host"><FundLink schemeId={id}>Plain Fund</FundLink></div>);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByTestId("host")).toHaveTextContent("Plain Fund");
    expect(screen.getByTestId("host").children).toHaveLength(0);
  });

  it("can be reached with the keyboard", () => {
    renderInShell(<FundLink schemeId="S-KOTAK">Kotak Multi Cap Fund</FundLink>);
    const link = screen.getByRole("link", { name: "Kotak Multi Cap Fund" });
    link.focus();
    expect(link).toHaveFocus();
  });

  it("is greyed and inert while the fund page route is not live", () => {
    renderInShell(<FundLink schemeId="S-KOTAK">Kotak Multi Cap Fund</FundLink>, { routes: NOT_LIVE });
    const link = screen.getByRole("link", { name: "Kotak Multi Cap Fund" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("href");
  });

  it("underlines on hover by default and takes another class when one is given", () => {
    const { unmount } = renderInShell(<FundLink schemeId="S-KOTAK">Kotak Multi Cap Fund</FundLink>);
    expect(screen.getByRole("link", { name: "Kotak Multi Cap Fund" })).toHaveClass("hover:underline");
    unmount();
    renderInShell(<FundLink schemeId="S-KOTAK" className="my-own-class">Kotak Multi Cap Fund</FundLink>);
    const link = screen.getByRole("link", { name: "Kotak Multi Cap Fund" });
    expect(link).toHaveClass("my-own-class");
    expect(link).not.toHaveClass("hover:underline");
  });

  it("adds no wrapper element around the link", () => {
    renderInShell(<div data-testid="host"><FundLink schemeId="S-KOTAK">Kotak Multi Cap Fund</FundLink></div>);
    expect(screen.getByRole("link", { name: "Kotak Multi Cap Fund" }).parentElement).toBe(screen.getByTestId("host"));
  });
});
