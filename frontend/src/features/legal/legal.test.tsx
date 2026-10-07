import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsentNotice } from "./ConsentNotice";
import { LegalPage, legalTypeForPath } from "./LegalPage";
import { LegalDocumentModal } from "./LegalDocumentModal";
import { acceptedFor, isConsentRequired } from "./api";
import { ApiError } from "../../lib/apiClient";
import { DOCS } from "./testFixtures";
import { PanPrivacyNotice } from "./PanDisclaimer";
import { currentPanDisclaimer } from "./panDisclaimerStore";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  const { DOCS } = await import("./testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});


describe("ConsentNotice", () => {
  it("says continuing is agreeing, with both documents opening in a new tab; no tick box", () => {
    render(<ConsentNotice />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/By continuing, you agree to our/)).toBeInTheDocument();
    const terms = screen.getByRole("link", { name: "Terms & Conditions" });
    const privacy = screen.getByRole("link", { name: "Privacy Policy" });
    expect(terms).toHaveAttribute("href", "/legal/terms");
    expect(privacy).toHaveAttribute("href", "/legal/privacy");
    for (const link of [terms, privacy]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
  });

  it("uses the screen's own lead-in", () => {
    render(<ConsentNotice lead="By reactivating" />);
    expect(screen.getByText(/By reactivating, you agree to our/)).toBeInTheDocument();
  });

  it("shows a retry when loading failed", () => {
    const onRetry = vi.fn();
    render(<ConsentNotice loadError onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load our terms. Check your connection and try again.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("LegalPage", () => {
  it("maps /legal/terms and /legal/privacy, ignoring a trailing slash", () => {
    expect(legalTypeForPath("/legal/terms")).toBe("terms_of_service");
    expect(legalTypeForPath("/legal/privacy/")).toBe("privacy_policy");
    expect(legalTypeForPath("/legal/other")).toBeNull();
  });

  it("renders the document text without needing a login", async () => {
    render(<LegalPage type="privacy_policy" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Privacy body.")).toBeInTheDocument();
  });
});

describe("LegalDocumentModal", () => {
  it("renders paragraphs, drops the duplicate heading and the > marker", () => {
    render(<LegalDocumentModal doc={DOCS[0]} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Placeholder, being finalised.");
    expect(dialog.textContent).not.toContain("> ");
    expect(dialog.textContent).not.toContain("# ");
    expect(dialog.querySelectorAll("p")).toHaveLength(3);
    expect(screen.getAllByText("Terms & Conditions")).toHaveLength(1);
  });

  it("closes on Escape and on the close button", () => {
    const onClose = vi.fn();
    render(<LegalDocumentModal doc={DOCS[0]} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders nothing without a doc", () => {
    const { container } = render(<LegalDocumentModal doc={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("helpers", () => {
  it("acceptedFor maps types to current versions", () => {
    expect(acceptedFor(DOCS, ["terms_of_service", "privacy_policy"])).toEqual([
      { document_type: "terms_of_service", document_version: "tos-placeholder-2026-10-01" },
      { document_type: "privacy_policy", document_version: "privacy-placeholder-2026-10-01" },
    ]);
  });
  it("isConsentRequired matches only 422 consent_required", () => {
    expect(isConsentRequired(new ApiError(422, { code: "consent_required", message: "x" }))).toBe(true);
    expect(isConsentRequired(new ApiError(422, "nope"))).toBe(false);
    expect(isConsentRequired(new ApiError(400, { code: "consent_required" }))).toBe(false);
    expect(isConsentRequired(new Error("x"))).toBe(false);
  });
});

describe("PanPrivacyNotice", () => {
  it("shows the two lines with no tick box; 'privacy policy' opens the PAN disclaimer with Ok", async () => {
    render(<PanPrivacyNotice surface="import_upload" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/Your data is encrypted and safe with us\./)).toBeInTheDocument();
    expect(screen.getByText(/By continuing, you agree to our/)).toBeInTheDocument();
    const link = screen.getByRole("button", { name: "privacy policy" });
    await waitFor(() => expect(link).toBeEnabled());
    fireEvent.click(link);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("I confirm I am authorised to share this statement.");
    fireEvent.click(screen.getByRole("button", { name: "Ok" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("registers the version as soon as it loads (no tick needed) and clears it on unmount", async () => {
    const onReadyChange = vi.fn();
    const { unmount } = render(<PanPrivacyNotice surface="mobile_upload" onReadyChange={onReadyChange} />);
    await waitFor(() => expect(currentPanDisclaimer()).toEqual({ version: DOCS[2].version, surface: "mobile_upload" }));
    expect(onReadyChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(currentPanDisclaimer()).toBeNull();
  });
});
