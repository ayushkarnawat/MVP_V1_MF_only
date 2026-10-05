import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { LegalDocumentModal } from "./LegalDocumentModal";
import { acceptedFor, isConsentRequired } from "./api";
import { ApiError } from "../../lib/apiClient";
import { DOCS } from "./testFixtures";
import { PanDisclaimer } from "./PanDisclaimer";
import { currentPanDisclaimer } from "./panDisclaimerStore";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  const { DOCS } = await import("./testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});


describe("ConsentCheckbox", () => {
  it("renders the agreement copy and toggles", () => {
    const onChange = vi.fn();
    render(<ConsentCheckbox checked={false} onChange={onChange} docs={DOCS} types={["terms_of_service", "privacy_policy"]} />);
    const box = screen.getByRole("checkbox", { name: /I agree to the/ });
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("opens the document modal from each link without toggling", () => {
    const onChange = vi.fn();
    render(<ConsentCheckbox checked={false} onChange={onChange} docs={DOCS} types={["terms_of_service", "privacy_policy"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Terms & Conditions" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("First paragraph.");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Privacy Policy" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Privacy body.");
  });

  it("is disabled until documents load", () => {
    render(<ConsentCheckbox checked={false} onChange={vi.fn()} docs={null} types={["terms_of_service"]} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("shows a retry when loading failed", () => {
    const onRetry = vi.fn();
    render(<ConsentCheckbox checked={false} onChange={vi.fn()} docs={null} types={["terms_of_service"]} loadError onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load our terms. Check your connection and try again.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
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

describe("PanDisclaimer", () => {
  it("shows only the disclaimer sentence: no title, no placeholder note, no full-document link", async () => {
    render(<PanDisclaimer checked={false} onChange={vi.fn()} surface="import_upload" />);
    expect(await screen.findByText("I confirm I am authorised to share this statement.")).toBeInTheDocument();
    expect(screen.queryByText("# PAN disclaimer")).not.toBeInTheDocument();
    expect(screen.queryByText(/being finalised/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /read the full pan disclaimer/i })).not.toBeInTheDocument();
  });

  it("registers the version when ticked and clears it on unmount", async () => {
    const { rerender, unmount } = render(<PanDisclaimer checked={false} onChange={vi.fn()} surface="mobile_upload" />);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    expect(currentPanDisclaimer()).toBeNull();
    rerender(<PanDisclaimer checked onChange={vi.fn()} surface="mobile_upload" />);
    expect(currentPanDisclaimer()).toEqual({ version: DOCS[2].version, surface: "mobile_upload" });
    unmount();
    expect(currentPanDisclaimer()).toBeNull();
  });
});
