import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderInShell } from "../testing";
import { buildRegistry } from "../registry/buildRegistry";

// /portfolio went live with the Portfolio page (PF1), so the Investments link on a placeholder is a real link now.
it("shows the matched route title, Coming soon and the Investments link", async () => {
  renderInShell(undefined, { path: "/portfolio/gold" });
  expect(await screen.findByRole("heading", { name: "Gold" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveTextContent("Coming soon");
  expect(screen.getByRole("main").querySelector('a[href="/portfolio"]')).toHaveTextContent("Investments");
});

it("enables the Investments link using fixture registry status", async () => {
  const routes = buildRegistry().map(route => route.id === "portfolio" ? { ...route, status: "live" as const } : route);
  renderInShell(undefined, { path: "/portfolio/gold", routes });
  await screen.findByRole("heading", { name: "Gold" });
  expect(screen.getByRole("main").querySelector('a[href="/portfolio"]')).toHaveTextContent("Investments");
});
