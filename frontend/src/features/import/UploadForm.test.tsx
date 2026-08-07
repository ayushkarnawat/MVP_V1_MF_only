import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadForm } from "./UploadForm";

describe("UploadForm", () => {
  it("rejects a non-PDF file before submit", () => {
    const onSubmit = vi.fn();
    render(<UploadForm onSubmit={onSubmit} />);

    const file = new File(["not a pdf"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });

    expect(screen.getByText(/please choose a valid pdf file/i)).toBeInTheDocument();
  });

  it("calls onSubmit with the file and password for a valid PDF", () => {
    const onSubmit = vi.fn();
    render(<UploadForm onSubmit={onSubmit} />);

    const file = new File(["pdf-bytes"], "cas.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/pdf password/i), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(onSubmit).toHaveBeenCalledWith(file, "secret");
  });

  it("shows an error and does not submit when no file is chosen", () => {
    const onSubmit = vi.fn();
    render(<UploadForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/please select a pdf file to upload/i)).toBeInTheDocument();
  });
});
