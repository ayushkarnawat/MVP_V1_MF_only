import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { describe, expect, it } from "vitest";

const PROFILE = resolve("src/features/profile-v2");
const FEATURES = resolve("src/features");
const ROUTES = resolve("src/shell/routes");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = sourceFiles(PROFILE);
const read = (file: string) => readFileSync(file, "utf8");
const name = (file: string) => file.slice(PROFILE.length + 1).replaceAll("\\", "/");
const slash = (path: string) => path.replaceAll("\\", "/");

// Every import specifier in a file: `from "x"`, `import "x"` and `import("x")`.
function specifiers(file: string): string[] {
  return [...read(file).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(match => match[1]);
}

// A specifier resolved to a path under src/features, or null when it points elsewhere (lib, components, shell, packages).
function featureTarget(file: string, specifier: string): string | null {
  const target = specifier.startsWith("@/features/") ? resolve("src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(file), specifier) : null;
  if (!target) return null;
  const normal = slash(target);
  return normal.startsWith(`${slash(FEATURES)}/`) ? normal.slice(slash(FEATURES).length + 1) : null;
}

// Profile may reuse: its own folder, the auth feature, the existing Profile feature (but never the three screens the new pages replace),
// and the dashboard's member components (ProfileNudge, CompleteProfileDialog).
const LEGACY_SCREENS = ["profile/ProfileView", "profile/HouseholdMembersSection", "profile/FamilyMemberCard"];
function allowed(target: string): boolean {
  if (target === "profile-v2" || target.startsWith("profile-v2/")) return true;
  if (target === "auth" || target.startsWith("auth/")) return true;
  if (target.startsWith("dashboard/members/")) return true;
  if (target.startsWith("profile/")) return !LEGACY_SCREENS.some(legacy => target === legacy || target.startsWith(`${legacy}.`));
  return false;
}

describe("Profile (v2) front-end guards", () => {
  it("scans the files the packets create (not vacuous)", () => {
    const names = FILES.map(name).sort();
    for (const expected of [
      "ProfileFrame.tsx", "ProfileNav.tsx", "pages/ComingSoonPage.tsx", "pages/PendingProfilePage.tsx", "pages/comingSoonPages.tsx",
      "lib/accessLevel.ts", "lib/accountType.ts", "lib/goalChips.ts", "lib/initialsOf.ts", "lib/investorLabel.ts",
      "lib/memberSince.ts", "lib/onboardingOptions.ts", "lib/profileNav.ts",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("uses colour variables only, no hard-coded colours, in the components (comments included)", () => {
    const offenders = FILES.filter(file => file.endsWith(".tsx")).filter(file => /#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });

  it("imports no other feature except auth, the existing Profile components (not the three old screens) and the dashboard's member components", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const specifier of specifiers(file)) {
        const target = featureTarget(file, specifier);
        if (target !== null && !allowed(target)) offenders.push(`${name(file)} -> ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never imports the old Profile screens by any spelling (boundary: they are retired later)", () => {
    const offenders = FILES.filter(file => /ProfileView|HouseholdMembersSection|FamilyMemberCard/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });

  it("does not use test helpers, console, any, raw HTML injection, or anything that could touch a full PAN", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = read(file);
      if (/shell\/testing|setupTests/.test(text)) offenders.push(`${name(file)}: test helper`);
      if (/\bconsole\./.test(text)) offenders.push(`${name(file)}: console`);
      if (/:\s*any\b|\bas any\b|<any>|\bany\[\]/.test(text)) offenders.push(`${name(file)}: any`);
      if (/dangerouslySetInnerHTML/.test(text)) offenders.push(`${name(file)}: raw html`);
      if (/pan_encrypted|decrypt|\bpan\s*:/.test(text)) offenders.push(`${name(file)}: PAN`);
    }
    expect(offenders).toEqual([]);
  });

  it("never turns a value into a float for display (no parseFloat or toFixed)", () => {
    expect(FILES.filter(file => /parseFloat|toFixed/.test(read(file))).map(name)).toEqual([]);
  });
});

describe("Profile route files (shell/routes)", () => {
  const pageLine = (id: string) => (read(join(ROUTES, `${id}.route.tsx`)).match(/page:\s*\(\)\s*=>[^\n]*/) ?? [""])[0];

  it.each([
    ["profile-family", "features/profile-v2/pages/PendingProfilePage"],
    ["profile-settings", "features/profile-v2/pages/PendingProfilePage"],
    ["profile-settings-import-history", "features/profile-v2/pages/PendingProfilePage"],
    ["profile-subscription", "features/profile-v2/pages/PendingProfilePage"],
    ["profile-data-privacy", "features/profile-v2/pages/PendingProfilePage"],
    ["profile-connected-accounts", "features/profile-v2/pages/comingSoonPages"],
    ["profile-tax", "features/profile-v2/pages/comingSoonPages"],
    ["profile-settings-notifications", "features/profile-v2/pages/comingSoonPages"],
    ["profile-settings-preferences", "features/profile-v2/pages/comingSoonPages"],
    ["profile-settings-security", "features/profile-v2/pages/comingSoonPages"],
    ["profile-legacy", "wrappers/ProfileWrapper"],
    ["profile-personal", "wrappers/ProfileWrapper"],
    ["profile-import-health", "wrappers/ImportHealthWrapper"],
  ])("%s loads %s and is live", (id, module) => {
    expect(pageLine(id)).toContain(module);
    expect(read(join(ROUTES, `${id}.route.tsx`))).toContain('status: "live"');
    expect(read(join(ROUTES, `${id}.route.tsx`))).not.toContain("PlaceholderPage");
  });

  it("the Coming soon route files each pick their own named page from comingSoonPages", () => {
    const expected: Record<string, string> = {
      "profile-connected-accounts": "ConnectedAccountsPage", "profile-tax": "TaxPage", "profile-settings-notifications": "NotificationsPage",
      "profile-settings-preferences": "PreferencesPage", "profile-settings-security": "SecurityPage",
    };
    for (const [id, component] of Object.entries(expected)) expect(pageLine(id), id).toContain(`m.${component}`);
  });

  it("every Profile route file points at a module that exists", () => {
    const missing: string[] = [];
    for (const entry of readdirSync(ROUTES).filter(file => /^profile.*\.route\.tsx$/.test(file))) {
      const module = (read(join(ROUTES, entry)).match(/import\("([^"]+)"\)/) ?? [])[1];
      if (!module) continue;
      const base = resolve(ROUTES, module);
      if (![".tsx", ".ts"].some(extension => existsSync(base + extension))) missing.push(`${entry} -> ${module}`);
    }
    expect(missing).toEqual([]);
  });

  it("keeps the route metadata of the shell contract (only `page` and `status` change in these files)", () => {
    for (const [id, path, parent] of [
      ["profile-family", "/profile/family", "profile"],
      ["profile-settings-security", "/profile/settings/security", "profile-settings"],
      ["profile-tax", "/profile/tax", "profile"],
    ]) {
      const text = read(join(ROUTES, `${id}.route.tsx`));
      expect(text).toContain(`path: "${path}"`);
      expect(text).toContain(`parentId: "${parent}"`);
      expect(text).toContain("section: null");
      expect(text).toContain('scope: "none"');
      expect(text).toContain('layout: "app"');
    }
  });
});
