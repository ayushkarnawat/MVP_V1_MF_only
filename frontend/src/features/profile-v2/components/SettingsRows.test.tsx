import { fireEvent, screen, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { SettingsRows } from "./SettingsRows";

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

// Every Profile route counts as live here, so the rows do not depend on which route files are already switched on.
const LIVE_ROUTES = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

function mount() {
  renderInShell(<><SettingsRows /><Probe /></>, { path: "/profile/settings", routes: LIVE_ROUTES });
  return screen.getByRole("list", { name: "Settings sections" });
}

const ROWS: Array<[string, string, string, string]> = [
  ["Notifications", "Manage how Unifolio contacts you", "/profile/settings/notifications", "Coming soon"],
  ["Preferences", "Display and other preferences", "/profile/settings/preferences", "Coming soon"],
  ["Security", "Sign-in and account security", "/profile/settings/security", "Coming soon"],
  ["Import History", "See the statements you imported, and delete one", "/profile/settings/import-history", "Live"],
];

describe("SettingsRows", () => {
  it("is a list of four rows in this order, each a real link to its page", () => {
    const list = mount();
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    ROWS.forEach(([title, , href], index) => {
      const link = within(rows[index]).getByRole("link");
      expect(link).toHaveAttribute("href", href);
      expect(link).not.toHaveAttribute("aria-disabled");
      expect(link).toHaveTextContent(title);
    });
    expect(within(list).getAllByRole("link")).toHaveLength(4);
  });

  it.each(ROWS)("%s has the line %j and the tag for its state", (title, description, _href, tag) => {
    const list = mount();
    const row = within(list).getAllByRole("listitem")[ROWS.findIndex(entry => entry[0] === title)];
    expect(row).toHaveTextContent(description);
    expect(within(row).getByTestId("settings-row-title")).toHaveTextContent(title);
    expect(within(row).getByTestId("settings-row-tag").textContent).toBe(tag);
  });

  it("marks only the first three rows Coming soon", () => {
    mount();
    expect(screen.getAllByTestId("settings-row-tag").map(tag => tag.textContent)).toEqual(["Coming soon", "Coming soon", "Coming soon", "Live"]);
  });

  it("has no button and hides its eight icons from assistive technology", () => {
    const list = mount();
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    const icons = list.querySelectorAll("svg");
    expect(icons).toHaveLength(8);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("opens the page a row names", () => {
    const list = mount();
    fireEvent.click(within(list).getAllByRole("link")[3]);
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/settings/import-history");
  });

  it("shows disabled rows, not links, when the routes are still placeholders", () => {
    const placeholders = buildRegistry().map(route => route.id.startsWith("profile-settings-") ? { ...route, status: "placeholder" as const } : route);
    renderInShell(<SettingsRows />, { path: "/profile/settings", routes: placeholders });
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("aria-disabled", "true");
      expect(link).not.toHaveAttribute("href");
    }
  });
});
