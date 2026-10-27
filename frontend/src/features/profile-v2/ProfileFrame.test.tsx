import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { ProfileFrame } from "./ProfileFrame";

vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const routes = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

describe("ProfileFrame", () => {
  it("draws the page title, the plain subtitle, the section list and the content slot", () => {
    renderInShell(<ProfileFrame><p>Inner page</p></ProfileFrame>, { path: "/profile/family", routes });
    expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
    expect(screen.getByText("Manage your account, family members, preferences and data.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Profile sections" })).toBeInTheDocument();
    expect(within(screen.getByTestId("profile-content")).getByText("Inner page")).toBeInTheDocument();
  });

  it("keeps the list and the content as siblings in one body, the list first", () => {
    renderInShell(<ProfileFrame><p>Inner page</p></ProfileFrame>, { path: "/profile/family", routes });
    const body = screen.getByTestId("profile-body");
    const nav = screen.getByRole("navigation", { name: "Profile sections" });
    const content = screen.getByTestId("profile-content");
    expect(nav.parentElement).toBe(body);
    expect(content.parentElement).toBe(body);
    expect(nav.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is a 232 px list beside a content column that may shrink (the mockup's grid)", () => {
    renderInShell(<ProfileFrame><p>x</p></ProfileFrame>, { path: "/profile/family", routes });
    expect(screen.getByTestId("profile-body").className).toContain("md:grid-cols-[232px_minmax(0,1fr)]");
    expect(screen.getByTestId("profile-content").className).toContain("min-w-0");
  });

  it("renders without children", () => {
    renderInShell(<ProfileFrame />, { path: "/profile/family", routes });
    expect(screen.getByTestId("profile-content")).toBeEmptyDOMElement();
  });
});
