import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadForm } from "./UploadForm";
import { currentPanDisclaimer } from "../legal/panDisclaimerStore";
import { DOCS } from "../legal/testFixtures";

vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  const { DOCS } = await import("../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});

async function tickDisclaimer() {
  const box = await screen.findByRole("checkbox");
  await waitFor(() => expect(box).toBeEnabled());
  fireEvent.click(box);
  return box;
}

describe("UploadForm", () => {
  it("rejects a non-PDF file before submit", () => {
    const onSubmit = vi.fn();
    render(<UploadForm onSubmit={onSubmit} />);

    const file = new File(["not a pdf"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });

    expect(screen.getByText(/please choose a valid pdf file/i)).toBeInTheDocument();
  });

  it("calls onSubmit with the file and password for a valid PDF", async () => {
    const onSubmit = vi.fn();
    render(<UploadForm onSubmit={onSubmit} />);

    const file = new File(["pdf-bytes"], "cas.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/pdf password/i), { target: { value: "secret" } });
    await tickDisclaimer();
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(onSubmit).toHaveBeenCalledWith(file, "secret");
  });

  it("rejects an oversized file (> 25MB) before submit", () => {
    const onSubmit = vi.fn();
    render(<UploadForm onSubmit={onSubmit} />);

    // Create a mock file larger than 25MB
    const largeFile = new File(["dummy"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(largeFile, "size", { value: 26 * 1024 * 1024 });

    fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [largeFile] } });

    expect(screen.getByText(/file is too large/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an error and does not submit when no file is chosen", async () => {
    const onSubmit = vi.fn();
    render(<UploadForm onSubmit={onSubmit} />);
    await tickDisclaimer();

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/please select a pdf file to upload/i)).toBeInTheDocument();
  });

  it("upload is disabled until the disclaimer is ticked", async () => {
    render(<UploadForm onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled();
    await tickDisclaimer();
    expect(screen.getByRole("button", { name: /upload/i })).toBeEnabled();
  });

  it("ticking sets the store, unticking clears it", async () => {
    render(<UploadForm onSubmit={vi.fn()} surface="onboarding_upload" />);
    const box = await tickDisclaimer();
    expect(currentPanDisclaimer()).toEqual({ version: DOCS[2].version, surface: "onboarding_upload" });
    fireEvent.click(box);
    expect(currentPanDisclaimer()).toBeNull();
  });

  it("defaults to the import_upload surface and clears the store on unmount", async () => {
    const { unmount } = render(<UploadForm onSubmit={vi.fn()} />);
    await tickDisclaimer();
    expect(currentPanDisclaimer()?.surface).toBe("import_upload");
    unmount();
    expect(currentPanDisclaimer()).toBeNull();
  });
});
