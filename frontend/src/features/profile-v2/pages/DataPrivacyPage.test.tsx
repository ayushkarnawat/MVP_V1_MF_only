import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@/features/auth/types";
import { getLegalDocuments, getMyConsents } from "@/features/legal/api";
import { DOCS } from "@/features/legal/testFixtures";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { CONSENTS_FIXTURE } from "../fixtures/consents";
import { ME_FIXTURE } from "../fixtures/me";
import DataPrivacyPage from "./DataPrivacyPage";

const auth = vi.hoisted(() => ({
  me: null as MeResponse | null,
  logout: vi.fn(),
  refreshMe: vi.fn(),
  requestAccountDeletion: vi.fn(),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
// The terms block is the existing section, unchanged; it reads the legal documents through this module.
vi.mock("@/features/legal/api", async importOriginal => ({
  ...(await importOriginal<typeof import("@/features/legal/api")>()),
  getLegalDocuments: vi.fn(),
  getMyConsents: vi.fn(),
}));

const LIVE_ROUTES = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

function mount() {
  renderInShell(<DataPrivacyPage />, { path: "/profile/data-privacy", routes: LIVE_ROUTES });
}

const content = () => screen.getByTestId("profile-content");
const consentsCard = () => screen.getByTestId("consents-card");

async function ready() {
  await screen.findAllByTestId("consent-row");
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.me = ME_FIXTURE;
  auth.requestAccountDeletion.mockResolvedValue(undefined);
  vi.mocked(getLegalDocuments).mockResolvedValue(DOCS);
  vi.mocked(getMyConsents).mockResolvedValue(CONSENTS_FIXTURE);
});

describe("DataPrivacyPage: the page", () => {
  it("sits in the Profile frame with Data & Privacy as the current item", async () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
    const current = screen.getByRole("navigation", { name: "Profile sections" }).querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Data & Privacy");
    await ready();
  });

  it("shows four blocks, in this order: terms, consents, what we store, delete account", async () => {
    mount();
    await ready();
    const headings = within(content()).getAllByRole("heading", { level: 2 }).map(heading => heading.textContent);
    expect(headings).toEqual(["Terms of Service", "Your consents", "What we store", "Delete account"]);
  });

  it("loads the consents once and writes nothing on load", async () => {
    mount();
    await ready();
    expect(getMyConsents).toHaveBeenCalledTimes(1);
    expect(auth.requestAccountDeletion).not.toHaveBeenCalled();
    expect(auth.refreshMe).not.toHaveBeenCalled();
  });

  it("offers no export and no consent withdrawal (both wait for the lawyer)", async () => {
    mount();
    await ready();
    expect(content().textContent).not.toMatch(/export|withdraw|download my data/i);
  });
});

describe("DataPrivacyPage: the terms block (the existing section, unchanged)", () => {
  it("lists the documents with a View button for each", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "View Terms & Conditions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View PAN Disclaimer" })).toBeInTheDocument();
  });

  it("View opens the existing document viewer", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "View Privacy Policy" }));
    expect(await screen.findByText("Privacy body.")).toBeInTheDocument();
  });
});

describe("DataPrivacyPage: your consents", () => {
  it("shows what was agreed, with version and date", async () => {
    mount();
    await ready();
    const rows = within(consentsCard()).getAllByTestId("consent-row");
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining("Terms of Service"),
      expect.stringContaining("Privacy Policy"),
      expect.stringContaining("PAN disclaimer"),
    ]);
    expect(rows[0]).toHaveTextContent("Version tos-2025-10-14");
    expect(rows[0]).toHaveTextContent("agreed 14 Oct 2025");
    expect(rows[2]).toHaveTextContent("agreed 21 Oct 2025");
  });

  it("shows a skeleton until the consents arrive, while the other blocks are already there", async () => {
    mount();
    expect(within(consentsCard()).getByTestId("consents-loading")).toBeInTheDocument();
    expect(screen.getByTestId("stored-data-card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();
    await ready();
    expect(screen.queryByTestId("consents-loading")).not.toBeInTheDocument();
  });

  it("an empty answer says 'No consents recorded.'", async () => {
    vi.mocked(getMyConsents).mockResolvedValue([]);
    mount();
    expect(await screen.findByTestId("consents-empty")).toHaveTextContent("No consents recorded.");
  });

  it("a failure shows a block-level message with Retry and leaves every other block standing", async () => {
    vi.mocked(getMyConsents).mockRejectedValue(new Error("down"));
    mount();
    const alert = await within(consentsCard()).findByRole("alert");
    expect(alert).toHaveTextContent("Could not load your consents.");
    expect(screen.getByRole("button", { name: "View Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "What we store" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("Retry loads the consents again and then shows them in place of the message", async () => {
    vi.mocked(getMyConsents).mockRejectedValueOnce(new Error("down"));
    mount();
    fireEvent.click(await within(consentsCard()).findByRole("button", { name: "Retry" }));
    expect(within(consentsCard()).getByTestId("consents-loading")).toBeInTheDocument();
    await ready();
    expect(getMyConsents).toHaveBeenCalledTimes(2);
    expect(within(consentsCard()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("when the terms cannot be loaded, that block shows its own message and the consents block still shows", async () => {
    vi.mocked(getLegalDocuments).mockRejectedValue(new Error("down"));
    mount();
    await ready();
    expect(await screen.findByText(/Could not load the documents\./)).toBeInTheDocument();
    expect(within(consentsCard()).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "What we store" })).toBeInTheDocument();
  });
});

describe("DataPrivacyPage: what we store", () => {
  it("shows the fixed text", async () => {
    mount();
    await ready();
    const card = screen.getByTestId("stored-data-card");
    expect(within(card).getAllByRole("listitem")).toHaveLength(4);
    expect(card).toHaveTextContent("Your PAN is stored encrypted.");
  });
});

describe("DataPrivacyPage: Delete account", () => {
  const card = () => screen.getByTestId("delete-account-card");

  it("is a danger card with the grace-period sentence and a Delete Account button, and opens nothing by itself", async () => {
    mount();
    await ready();
    expect(within(card()).getByRole("heading", { level: 2, name: "Delete account" })).toBeInTheDocument();
    expect(within(card()).getByText("Permanently remove your account and household data after a 30-day grace period.")).toBeInTheDocument();
    expect(card()).toHaveClass("border-[var(--neg)]");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the button opens the two-step dialog at the reason step", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    expect(screen.getByRole("dialog", { name: "Why are you leaving?" })).toBeInTheDocument();
  });

  it("Cancel closes the dialog, nothing is sent, and the page stays as it was", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(auth.requestAccountDeletion).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();
  });

  it("reason, note, confirm: sends the reason and the note once, and the dialog closes", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.click(screen.getByRole("radio", { name: "Found an alternative" }));
    fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: "Switched tools" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(auth.requestAccountDeletion).toHaveBeenCalledTimes(1);
    expect(auth.requestAccountDeletion).toHaveBeenCalledWith("found_alternative", "Switched tools");
  });

  it("a failure shows the message inside the dialog and keeps it open", async () => {
    auth.requestAccountDeletion.mockRejectedValue(new Error("down"));
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Could not schedule account deletion. Please try again.");
    expect(screen.getByRole("dialog", { name: "Confirm account deletion" })).toBeInTheDocument();
  });

  it("opening it again after closing starts at the reason step with nothing chosen", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    expect(screen.getByRole("dialog", { name: "Why are you leaving?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Other" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});
