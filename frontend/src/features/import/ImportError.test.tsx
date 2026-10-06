import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportError } from "./ImportError";

describe("ImportError", () => {
  it("shows the error message and calls onRetry", () => {
    const onRetry = vi.fn();
    render(<ImportError code="wrong_password" message="Incorrect PDF password." onUploadAnother={onRetry} />);

    expect(screen.getByText("Incorrect PDF password.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /upload a different file/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});


it("scanned PDF offers both actions", () => {
  render(<ImportError code="scanned_pdf" message="It looks like a scan" onUploadAnother={() => {}} onRequestCas={() => {}} />);
  expect(screen.getByText("We can’t read this PDF")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Upload a different file" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Request CAS from CAMS" })).toBeInTheDocument();
});

it("damaged PDF offers only upload", () => {
  render(<ImportError code="damaged_pdf" message="x" onUploadAnother={() => {}} onRequestCas={() => {}} />);
  expect(screen.queryByRole("button", { name: "Request CAS from CAMS" })).not.toBeInTheDocument();
});

it.each([
  ["unknown_issuer", "This isn’t a CAMS or KFintech statement"],
  ["summary_cas", "This is a summary statement"],
  ["demat_cas", "Demat statements aren’t supported yet"],
])("offers CAMS recovery for %s", (code, title) => {
  const request = vi.fn();
  render(<ImportError code={code} message="Server message" onUploadAnother={vi.fn()} onRequestCas={request} />);
  expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Request CAS from CAMS" }));
  expect(request).toHaveBeenCalledTimes(1);
});
