import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { FundLink } from "./FundLink";

const ID = "54b8755e-6b2b-5f4f-a8fe-b41125031af6";
const NOT_LIVE = buildRegistry().map(route => (route.id === "portfolio-mutual-funds-fund" ? { ...route, status: "placeholder" as const } : route));

describe("FundLink (Home)", () => {
  it("is a real link to the fund page, named by the fund's name", () => {
    renderInShell(<FundLink schemeId={ID}>Asha Large Cap</FundLink>);
    const link = screen.getByRole("link", { name: "Asha Large Cap" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", `/portfolio/mutual-funds/funds/${ID}`);
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
    renderInShell(<FundLink schemeId={ID}>Asha Large Cap</FundLink>);
    const link = screen.getByRole("link", { name: "Asha Large Cap" });
    link.focus();
    expect(link).toHaveFocus();
  });

  it("is greyed and inert while the fund page route is not live", () => {
    renderInShell(<FundLink schemeId={ID}>Asha Large Cap</FundLink>, { routes: NOT_LIVE });
    const link = screen.getByRole("link", { name: "Asha Large Cap" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("href");
  });

  it("underlines on hover by default and takes another class when one is given", () => {
    const { unmount } = renderInShell(<FundLink schemeId={ID}>Asha Large Cap</FundLink>);
    expect(screen.getByRole("link", { name: "Asha Large Cap" })).toHaveClass("hover:underline");
    unmount();
    renderInShell(<FundLink schemeId={ID} className="my-own-class">Asha Large Cap</FundLink>);
    const link = screen.getByRole("link", { name: "Asha Large Cap" });
    expect(link).toHaveClass("my-own-class");
    expect(link).not.toHaveClass("hover:underline");
  });

  it("adds no wrapper element around the link by default", () => {
    renderInShell(<div data-testid="host"><FundLink schemeId={ID}>Asha Large Cap</FundLink></div>);
    expect(screen.getByRole("link", { name: "Asha Large Cap" }).parentElement).toBe(screen.getByTestId("host"));
  });

  it("lets a click and a key press reach the surrounding row by default", () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    renderInShell(<div onClick={onClick} onKeyDown={onKeyDown}><FundLink schemeId={ID}>Asha Large Cap</FundLink></div>);
    const link = screen.getByRole("link", { name: "Asha Large Cap" });
    fireEvent.click(link);
    fireEvent.keyDown(link, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("keeps a click and a key press on the link when it sits in a row with its own action (inClickableRow)", () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    renderInShell(<div onClick={onClick} onKeyDown={onKeyDown}><FundLink schemeId={ID} inClickableRow>Asha Large Cap</FundLink></div>);
    const link = screen.getByRole("link", { name: "Asha Large Cap" });
    fireEvent.click(link);
    fireEvent.keyDown(link, { key: "Enter" });
    fireEvent.keyDown(link, { key: " " });
    expect(onClick).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(link).toHaveAttribute("href", `/portfolio/mutual-funds/funds/${ID}`);
  });

  it("with inClickableRow, the greyed link also keeps its clicks to itself", () => {
    const onClick = vi.fn();
    renderInShell(<div onClick={onClick}><FundLink schemeId={ID} inClickableRow>Asha Large Cap</FundLink></div>, { routes: NOT_LIVE });
    fireEvent.click(screen.getByRole("link", { name: "Asha Large Cap" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
