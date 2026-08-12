import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TwoPathImportContainer } from "./TwoPathImportContainer";
import { setCasResumeStep2, hasCasResumeStep2 } from "./casResumeState";
import * as api from "./api";

describe("TwoPathImportContainer", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders both tabs and toggles between Request and Upload views", () => {
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Initial default tab: Request from CAMS (Step 1)
    expect(screen.getByRole("tab", { name: /request from cams/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /upload existing statement/i })).toBeInTheDocument();
    expect(screen.getByText(/request statement on cams/i)).toBeInTheDocument();

    // Switch to Upload Existing Statement tab (Step 2)
    const uploadTab = screen.getByRole("tab", { name: /upload existing statement/i });
    fireEvent.click(uploadTab);

    expect(screen.getByText(/click to choose file or drag & drop pdf here/i)).toBeInTheDocument();
  });

  it("automatically resumes at Step 2 when resume state is present", () => {
    setCasResumeStep2("m-1");

    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Should directly display Step 2 Upload form without requiring clicking Step 1
    const uploadTab = screen.getByRole("tab", { name: /upload existing statement/i });
    expect(uploadTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/click to choose file or drag & drop pdf here/i)).toBeInTheDocument();
  });

  it("switches to Step 2 and persists resume state when Go to CAMS is clicked", async () => {
    const mockOpen = vi.fn();
    vi.stubGlobal("open", mockOpen);

    vi.spyOn(api, "requestCamsStatement").mockResolvedValue({
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "waiting_for_user",
      cams_url: "https://www.camsonline.com/cas",
      expires_at: "2026-08-12T12:00:00Z",
    });

    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    const requestBtn = screen.getByRole("button", { name: /request statement on cams/i });
    fireEvent.click(requestBtn);

    await waitFor(() => {
      expect(api.requestCamsStatement).toHaveBeenCalledWith("m-1");
      expect(mockOpen).toHaveBeenCalledWith("https://www.camsonline.com/cas", "_blank");
      expect(hasCasResumeStep2("m-1")).toBe(true);
    });

    // Step 2 is opened directly
    const uploadTab = screen.getByRole("tab", { name: /upload existing statement/i });
    expect(uploadTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/click to choose file or drag & drop pdf here/i)).toBeInTheDocument();
  });

  it("resumes Step 2 on window focus when resume state is set", () => {
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Initial state: Step 1
    const step1Tab = screen.getByRole("tab", { name: /request from cams/i });
    expect(step1Tab).toHaveAttribute("aria-selected", "true");

    // Simulate CAMS action in another tab setting resume state
    setCasResumeStep2("m-1");

    // Window gains focus when user returns
    fireEvent(window, new Event("focus"));

    // Step 2 is active
    const uploadTab = screen.getByRole("tab", { name: /upload existing statement/i });
    expect(uploadTab).toHaveAttribute("aria-selected", "true");
  });

  it("clears resume state when Step 1 tab is explicitly clicked", () => {
    setCasResumeStep2("m-1");

    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Starts at Step 2 due to resume state
    const uploadTab = screen.getByRole("tab", { name: /upload existing statement/i });
    expect(uploadTab).toHaveAttribute("aria-selected", "true");

    // User clicks Step 1 tab manually
    const step1Tab = screen.getByRole("tab", { name: /request from cams/i });
    fireEvent.click(step1Tab);

    expect(step1Tab).toHaveAttribute("aria-selected", "true");
    expect(hasCasResumeStep2("m-1")).toBe(false);
  });

  it("clears resume state on upload submission so subsequent flow starts at Step 1", () => {
    setCasResumeStep2("m-1");
    const onUploadSubmit = vi.fn();

    const { unmount } = render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={onUploadSubmit}
      />
    );

    const fileInput = screen.getByLabelText(/cas pdf/i);
    const mockFile = new File(["dummy pdf"], "cas.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    const passwordInput = screen.getByLabelText(/pdf password/i);
    fireEvent.change(passwordInput, { target: { value: "pass123" } });

    const submitBtn = screen.getByRole("button", { name: /upload & parse statement/i });
    fireEvent.click(submitBtn);

    expect(onUploadSubmit).toHaveBeenCalled();
    expect(hasCasResumeStep2("m-1")).toBe(false);

    unmount();

    // Next fresh import starts at Step 1
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    const step1Tab = screen.getByRole("tab", { name: /request from cams/i });
    expect(step1Tab).toHaveAttribute("aria-selected", "true");
  });
});
