import { describe, expect, it } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { paths } from "@/shell/nav/paths";
import { PROFILE_NAV, isNavItemCurrent } from "./profileNav";

const item = (id: string) => PROFILE_NAV.find(entry => entry.id === id)!;

describe("PROFILE_NAV (contract v1.4, spec section 1: one constant for the nav, the tests and the section map)", () => {
  it("lists the seven items in contract order with their paths", () => {
    expect(PROFILE_NAV.map(entry => [entry.id, entry.label, entry.path])).toEqual([
      ["personal", "Personal Information", "/profile/personal"],
      ["family", "Family Members", "/profile/family"],
      ["connected-accounts", "Connected Accounts", "/profile/connected-accounts"],
      ["settings", "Settings", "/profile/settings"],
      ["subscription", "Subscription & Billing", "/profile/subscription"],
      ["tax", "Tax Information", "/profile/tax"],
      ["data-privacy", "Data & Privacy", "/profile/data-privacy"],
    ]);
  });

  it("gives only Settings children, four of them, in order", () => {
    expect(PROFILE_NAV.filter(entry => entry.children).map(entry => entry.id)).toEqual(["settings"]);
    expect(item("settings").children!.map(child => [child.id, child.label, child.path])).toEqual([
      ["notifications", "Notifications", "/profile/settings/notifications"],
      ["preferences", "Preferences", "/profile/settings/preferences"],
      ["security", "Security", "/profile/settings/security"],
      ["import-history", "Import History", "/profile/settings/import-history"],
    ]);
  });

  it("gives every item an icon component", () => {
    for (const entry of PROFILE_NAV) expect(entry.icon, entry.id).toBeTruthy();
  });

  it("uses the shell path builders (every path equals the builder's output)", () => {
    expect(PROFILE_NAV.map(entry => entry.path)).toEqual([
      paths.profilePersonal(), paths.profileFamily(), paths.profileConnectedAccounts(), paths.profileSettings(),
      paths.profileSubscription(), paths.profileTax(), paths.profileDataPrivacy(),
    ]);
    expect(item("settings").children!.map(child => child.path)).toEqual([
      paths.profileNotifications(), paths.profilePreferences(), paths.profileSecurity(), paths.profileImportHistory(),
    ]);
  });

  it("matches the shell registry: each item and child is a route `profile-<id>` with the same path and label", () => {
    const registry = buildRegistry();
    for (const entry of PROFILE_NAV) {
      const route = registry.find(candidate => candidate.id === `profile-${entry.id}`);
      expect(route?.path, entry.id).toBe(entry.path);
      expect(route?.label, entry.id).toBe(entry.label);
      for (const child of entry.children ?? []) {
        const childRoute = registry.find(candidate => candidate.id === `profile-${entry.id}-${child.id}`);
        expect(childRoute?.path, child.id).toBe(child.path);
        expect(childRoute?.label, child.id).toBe(child.label);
      }
    }
  });
});

describe("isNavItemCurrent", () => {
  it.each([
    ["family", "/profile/family", true],
    ["family", "/profile/Family", true],
    ["family", "/profile/family/", true],
    ["family", "/profile/personal", false],
    ["family", "/profile/family/extra", false],
    ["settings", "/profile/settings", true],
    ["settings", "/profile/settings/", true],
    ["settings", "/profile/settings/security", true],
    ["settings", "/profile/settings/import-history", true],
    ["settings", "/profile/settings-x", false],
    ["settings", "/profile/subscription", false],
    ["personal", "/profile/settings/security", false],
    ["personal", "/profile/unknown", false],
  ])("%s at %s is %s", (id, pathname, expected) => {
    expect(isNavItemCurrent(item(id), pathname)).toBe(expected);
  });
});
