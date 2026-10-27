import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyConsent } from "@/features/legal/api";
import { CONSENTS_FIXTURE } from "../fixtures/consents";
import { ConsentList } from "./ConsentList";

const onRetry = vi.fn();

function mount(status: "loading" | "ready" | "error", consents: readonly MyConsent[] = []) {
  return render(<ConsentList status={status} consents={consents} onRetry={onRetry} />);
}

const rows = () => screen.getAllByTestId("consent-row");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConsentList: the card", () => {
  it.each(["loading", "ready", "error"] as const)("is a card titled 'Your consents' with its sub-title while %s", status => {
    mount(status, CONSENTS_FIXTURE);
    const card = screen.getByTestId("consents-card");
    expect(within(card).getByRole("heading", { level: 2, name: "Your consents" })).toBeInTheDocument();
    expect(within(card).getByText("What you agreed to, and when.")).toBeInTheDocument();
  });
});

describe("ConsentList: loaded", () => {
  it("shows one row per consent: the document's name, its version and the date agreed", () => {
    mount("ready", CONSENTS_FIXTURE);
    expect(rows()).toHaveLength(3);
    expect(rows().map(row => within(row).getByTestId("consent-name").textContent)).toEqual(["Terms of Service", "Privacy Policy", "PAN disclaimer"]);
    expect(rows().map(row => within(row).getByTestId("consent-version").textContent)).toEqual([
      "Version tos-2025-10-14", "Version privacy-2025-10-14", "Version pan-2025-10-21",
    ]);
    expect(rows().map(row => within(row).getByTestId("consent-date").textContent)).toEqual([
      "agreed 14 Oct 2025", "agreed 14 Oct 2025", "agreed 21 Oct 2025",
    ]);
  });

  it("lists them as a list named 'Agreed documents', with the tick icons hidden from assistive technology", () => {
    mount("ready", CONSENTS_FIXTURE);
    const list = screen.getByRole("list", { name: "Agreed documents" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    const icons = list.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("puts the documents in a fixed order (Terms, Privacy, PAN disclaimer) whatever order the server answered in", () => {
    mount("ready", [CONSENTS_FIXTURE[2], CONSENTS_FIXTURE[0], CONSENTS_FIXTURE[1]]);
    expect(rows().map(row => within(row).getByTestId("consent-name").textContent)).toEqual(["Terms of Service", "Privacy Policy", "PAN disclaimer"]);
  });

  it("shows only the documents that were agreed, and no error or empty line", () => {
    mount("ready", [CONSENTS_FIXTURE[1]]);
    expect(rows()).toHaveLength(1);
    expect(screen.getByTestId("consent-name")).toHaveTextContent("Privacy Policy");
    expect(screen.queryByTestId("consents-empty")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a document type this build does not know is kept and named in plain words, after the known ones", () => {
    const unknown = { document_type: "cookie_policy" as MyConsent["document_type"], document_version: "c-1", recorded_at: "2025-11-01T00:00:00Z" };
    mount("ready", [unknown, CONSENTS_FIXTURE[0]]);
    expect(rows().map(row => within(row).getByTestId("consent-name").textContent)).toEqual(["Terms of Service", "Cookie policy"]);
    expect(rows()[1]).toHaveTextContent("agreed 1 Nov 2025");
  });

  it("formats the date in UTC as DD Mon YYYY, so a late-evening UTC time stays on its own day", () => {
    mount("ready", [{ ...CONSENTS_FIXTURE[0], recorded_at: "2025-12-31T23:30:00Z" }]);
    expect(screen.getByTestId("consent-date")).toHaveTextContent("agreed 31 Dec 2025");
  });

  it("an unreadable date leaves the date out instead of breaking the card", () => {
    mount("ready", [{ ...CONSENTS_FIXTURE[0], recorded_at: "not a date" }]);
    expect(screen.getByTestId("consent-name")).toHaveTextContent("Terms of Service");
    expect(screen.queryByTestId("consent-date")).not.toBeInTheDocument();
  });

  it("offers nothing to change: no button, no link, no withdraw or export", () => {
    mount("ready", CONSENTS_FIXTURE);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByTestId("consents-card")).not.toHaveTextContent(/withdraw|export|download/i);
  });
});

describe("ConsentList: empty, loading, failed", () => {
  it("an empty list says 'No consents recorded.' and shows no row", () => {
    mount("ready", []);
    expect(screen.getByTestId("consents-empty")).toHaveTextContent("No consents recorded.");
    expect(screen.queryByTestId("consent-row")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Agreed documents" })).not.toBeInTheDocument();
  });

  it("loading shows a busy skeleton and neither rows, the empty line nor a message", () => {
    mount("loading");
    expect(screen.getByTestId("consents-loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("consent-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consents-empty")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("an error shows one message with a Retry button, and neither rows nor the empty line, even if consents were passed", () => {
    mount("error", CONSENTS_FIXTURE);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load your consents.");
    expect(screen.queryByTestId("consent-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consents-empty")).not.toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
