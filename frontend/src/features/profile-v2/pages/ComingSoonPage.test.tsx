import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { ComingSoonPage } from "./ComingSoonPage";

const routes = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

type Variant = "connected-accounts" | "notifications" | "preferences" | "security" | "tax" | "financial-details";

// Draft copy approved 23 Oct (G10 A), spec section 5.
const COPY: Array<[Variant, string, string]> = [
  ["connected-accounts", "Connected Accounts", "Connected accounts are coming. Today you add mutual fund data by importing a statement."],
  ["notifications", "Notifications", "Notification settings are coming. Today Unifolio only emails you the code you sign in with."],
  ["preferences", "Preferences", "Display and other preferences are coming. You can switch between light and dark mode from the top bar."],
  ["security", "Security", "Security settings are coming. You sign in with a one-time code or your Google account, so there is no password to manage."],
  ["tax", "Tax Information", "Tax information is coming."],
  ["financial-details", "Financial Details", "Financial details are coming."],
];

describe("ComingSoonPage", () => {
  it.each(COPY)("%s: heading, one line, one Coming soon tag", (variant, heading, line) => {
    renderInShell(<ComingSoonPage variant={variant} />, { path: "/profile/tax", routes });
    expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByTestId("coming-soon-tag")).toHaveTextContent("Coming soon");
    expect(screen.getAllByTestId("coming-soon-tag")).toHaveLength(1);
  });

  it.each(COPY)("%s: has no control (no button, no field)", (variant) => {
    renderInShell(<ComingSoonPage variant={variant} />, { path: "/profile/tax", routes });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it.each(["notifications", "preferences", "security"] as const)("%s: offers a Back link to Settings", variant => {
    renderInShell(<ComingSoonPage variant={variant} />, { path: "/profile/settings/security", routes });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Settings");
    expect(links[0]).toHaveAttribute("href", "/profile/settings");
    expect(links[0].querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it.each(["connected-accounts", "tax", "financial-details"] as const)("%s: has no link at all", variant => {
    renderInShell(<ComingSoonPage variant={variant} />, { path: "/profile/tax", routes });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("connected-accounts also lists the six planned account types in muted rows (G5)", () => {
    renderInShell(<ComingSoonPage variant="connected-accounts" />, { path: "/profile/connected-accounts", routes });
    expect(screen.getByText("What we plan to connect")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Planned accounts" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map(row => row.textContent)).toEqual([
      "Bank accountsComing soon", "Stocks & ETFsComing soon", "Fixed deposits & bondsComing soon",
      "GoldComing soon", "US stocksComing soon", "Real estateComing soon",
    ]);
    for (const row of rows) {
      expect(row).toHaveAttribute("data-status", "planned");
      expect(row.className).toContain("opacity-60");
      expect(within(row).queryAllByRole("button")).toHaveLength(0);
      expect(within(row).queryAllByRole("link")).toHaveLength(0);
      expect(row).not.toHaveAttribute("tabindex");
    }
    expect(screen.getAllByTestId("coming-soon-tag")).toHaveLength(1);
  });

  it("the other variants list no planned accounts", () => {
    renderInShell(<ComingSoonPage variant="tax" />, { path: "/profile/tax", routes });
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("What we plan to connect")).not.toBeInTheDocument();
  });

  it("uses the dashed neutral card of the mockup, with the tag as a pill", () => {
    renderInShell(<ComingSoonPage variant="tax" />, { path: "/profile/tax", routes });
    const card = screen.getByTestId("coming-soon");
    expect(card).toHaveAttribute("data-variant", "tax");
    expect(card.className).toContain("border-dashed");
    expect(card.className).toContain("bg-[var(--ui-elevated)]");
    expect(screen.getByTestId("coming-soon-tag").className).toContain("rounded-full");
  });
});
