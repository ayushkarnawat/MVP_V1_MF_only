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

  it("renders entry choice screen with both options and navigates into Request view", () => {
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Entry Choice Screen
    expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
    expect(screen.getByText("Request from CAMS")).toBeInTheDocument();
    expect(screen.getByText("Already have a statement")).toBeInTheDocument();

    // Click Request from CAMS
    const requestChoice = screen.getByRole("button", { name: /request from cams/i });
    fireEvent.click(requestChoice);

    // Detail view is shown with back button
    expect(screen.getByRole("heading", { name: /^request from cams$/i })).toBeInTheDocument();
    expect(screen.getByText(/back to import options/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request statement on cams/i })).toBeInTheDocument();

    // Click back to options
    fireEvent.click(screen.getByText(/back to import options/i));
    expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
  });

  it("navigates into Upload view from choice screen and supports back navigation", () => {
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Click Already have a statement
    const uploadChoice = screen.getByRole("button", { name: /already have a statement/i });
    fireEvent.click(uploadChoice);

    // Upload form is shown with back button
    expect(screen.getByRole("heading", { name: /upload your statement/i })).toBeInTheDocument();
    expect(screen.getByText(/back to import options/i)).toBeInTheDocument();
    expect(screen.getByText(/click to choose file or drag & drop pdf here/i)).toBeInTheDocument();

    // Click back
    fireEvent.click(screen.getByText(/back to import options/i));
    expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
  });

  it("automatically resumes at upload view when resume state is present", () => {
    setCasResumeStep2("m-1");

    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Directly shows Upload form
    expect(screen.getByRole("heading", { name: /upload your statement/i })).toBeInTheDocument();
    expect(screen.getByText(/click to choose file or drag & drop pdf here/i)).toBeInTheDocument();
  });

  it("transitions to waiting view and persists resume state when Request on CAMS is clicked", async () => {
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

    // Go to Request from CAMS
    fireEvent.click(screen.getByRole("button", { name: /request from cams/i }));

    const requestBtn = screen.getByRole("button", { name: /request statement on cams/i });
    fireEvent.click(requestBtn);

    await waitFor(() => {
      expect(api.requestCamsStatement).toHaveBeenCalledWith("m-1");
      expect(mockOpen).toHaveBeenCalledWith("https://www.camsonline.com/cas", "_blank");
      expect(hasCasResumeStep2("m-1")).toBe(true);
    });

    // Waiting view is displayed
    expect(screen.getByText(/waiting for cams email/i)).toBeInTheDocument();
    expect(screen.getByText(/already got the email\? upload it now/i)).toBeInTheDocument();
  });

  it("resumes upload view on window focus when resume state is set", () => {
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    // Initial state: choice screen
    expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();

    // Simulate resume state set
    setCasResumeStep2("m-1");

    // Window focus
    fireEvent(window, new Event("focus"));

    // Upload view is active
    expect(screen.getByRole("heading", { name: /upload your statement/i })).toBeInTheDocument();
  });

  it("clears resume state on upload submission so subsequent flow starts at choice view", () => {
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

    // Next fresh import starts at choice screen
    render(
      <TwoPathImportContainer
        memberId="m-1"
        onUploadSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
  });
});
