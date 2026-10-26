import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderInShell } from "../testing";
import { TemporaryMfTabs } from "./TemporaryMfTabs";

it.each([
  ["/portfolio/mutual-funds", "Dashboard"],
  ["/portfolio/mutual-funds/history", "History"],
  ["/portfolio/mutual-funds/analytics", "Analytics"],
])("marks only %s current and links all three live pages", (path, label) => {
  renderInShell(<TemporaryMfTabs />, { path });
  const navigation = screen.getByRole("navigation", { name: "Mutual Fund pages" });
  const links = within(navigation).getAllByRole("link");
  expect(links.map(link => [link.textContent, link.getAttribute("href")])).toEqual([
    ["Dashboard", "/portfolio/mutual-funds"],
    ["History", "/portfolio/mutual-funds/history"],
    ["Analytics", "/portfolio/mutual-funds/analytics"],
  ]);
  expect(links.filter(link => link.getAttribute("aria-current") === "page")).toEqual([within(navigation).getByRole("link", { name: label })]);
});
