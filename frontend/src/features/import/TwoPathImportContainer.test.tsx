import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TwoPathImportContainer } from "./TwoPathImportContainer";

describe("TwoPathImportContainer", () => {
  it("renders both tabs and toggles between Request and Upload views", () => {
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Initial default tab: Request from CAMS
    expect(screen.getByRole("tab", { name: /request from cams/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /upload existing statement/i })).toBeInTheDocument();
    expect(screen.getByText(/open cams mailback portal/i)).toBeInTheDocument();

    // Switch to Upload Existing Statement tab
    const uploadTab = screen.getByRole("tab", { name: /upload existing statement/i });
    fireEvent.click(uploadTab);

    expect(screen.getByText(/click to choose file or drag & drop pdf here/i)).toBeInTheDocument();
  });
});
