import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileImportView } from "./MobileImportView";
import * as authApi from "@/features/auth/api";
import * as importApi from "@/features/import/api";
import { setCasResumeStep2, hasCasResumeStep2 } from "@/features/import/casResumeState";

vi.mock("@/features/auth/api", () => ({
  listHouseholdMembers: vi.fn(),
}));

vi.mock("@/features/import/api", () => ({
  requestCamsStatement: vi.fn(),
  cancelImportRequest: vi.fn(),
  parseImport: vi.fn(),
  confirmImport: vi.fn(),
  getMemberImportHistory: vi.fn(),
  uploadCasImport: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    payload: unknown;
    constructor(status: number, payload: unknown) {
      super(typeof payload === "string" ? payload : "API error");
      this.status = status;
      this.payload = payload;
    }
  },
}));

describe("MobileImportView", () => {
  const mockMembers = [
    {
      id: "m-1",
      user_id: "u-1",
      name: "Ayush",
      relationship: "self",
      pan_masked: "ABCDE1234F",
      email: "ayush@example.com",
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "m-2",
      user_id: "u-1",
      name: "Pooja",
      relationship: "spouse",
      pan_masked: null,
      email: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(authApi.listHouseholdMembers).mockResolvedValue(mockMembers as any);
    vi.mocked(importApi.getMemberImportHistory).mockResolvedValue([]);
  });

  async function openEmptyReview() {
    vi.mocked(importApi.parseImport).mockResolvedValue({
      session_id: "sess-mismatch",
      filename: "statement.pdf",
      investor_email: null,
      cas_type: "detailed",
      file_type: "pdf",
      transactions: [],
      investor_name: "Pooja",
      pan_masked: "ABCDE1234F",
      transaction_count: 0,
      parse_warnings: [],
      schemes: [],
    });
    render(<MobileImportView defaultMemberId="m-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /already have a statement/i }));
    const file = new File(["pdf"], "statement.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /upload statement/i }));
    await screen.findByText("Review CAS Import");
  }

  it("renders entry choice screen with both options and navigates into Request view", async () => {
    render(<MobileImportView />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /how would you like to bring in your statement/i })).toBeInTheDocument();
    });

    expect(screen.getByText("Request from CAMS")).toBeInTheDocument();
    expect(screen.getByText("Already have a statement")).toBeInTheDocument();

    const requestChoice = screen.getByRole("button", { name: /request from cams/i });
    fireEvent.click(requestChoice);

    expect(screen.getByRole("heading", { level: 3, name: /request from cams/i })).toBeInTheDocument();
    expect(screen.getByText(/back to import options/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request statement on cams/i })).toBeInTheDocument();
  });

  it("initiates CAMS request, persists resume state, and transitions to waiting view", async () => {
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(importApi.requestCamsStatement).mockResolvedValue({
      import_id: "imp-123",
      household_member_id: "m-1",
      cams_url: "https://www.camsonline.com/cas",
      expires_at: "2026-08-11T20:00:00Z",
      status: "request_initiated" as any,
    });

    render(<MobileImportView defaultMemberId="m-1" />);

    const requestChoice = await screen.findByRole("button", { name: /request from cams/i });
    fireEvent.click(requestChoice);

    const requestBtn = await screen.findByRole("button", {
      name: /request statement on cams/i,
    });
    fireEvent.click(requestBtn);

    await waitFor(() => {
      expect(importApi.requestCamsStatement).toHaveBeenCalledWith("m-1");
      expect(windowOpenSpy).toHaveBeenCalledWith("https://www.camsonline.com/cas", "_blank");
      expect(hasCasResumeStep2("m-1")).toBe(true);
    });

    // Waiting view is now shown
    expect(screen.getByText(/waiting for cams email/i)).toBeInTheDocument();
    expect(screen.getByText(/already got the email\? upload it now/i)).toBeInTheDocument();
  });

  it("automatically resumes at Upload view when returning to MobileImportView with resume state", async () => {
    setCasResumeStep2("m-1");

    render(<MobileImportView defaultMemberId="m-1" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 3, name: /upload your statement/i })).toBeInTheDocument();
    });
  });

  it("switches to Upload view and parses statement with password", async () => {
    vi.mocked(importApi.parseImport).mockResolvedValue({
      session_id: "sess-99",
      filename: "cas_statement.pdf",
      investor_email: null,
      cas_type: "detailed",
      file_type: "pdf",
      transactions: [],
      investor_name: "Ayush",
      pan_masked: "ABCDE1234F",
      transaction_count: 14,
      parse_warnings: [],
      schemes: [
        {
          temp_id: "sch-1",
          name: "Parag Parikh Flexi Cap Fund Direct Growth",
          isin: null,
          folio: "12345/0",
          amc: "PPFAS",
          amfi_code: "122639",
          suggested_amfi_code: null,
          suggested_name: null,
          match_confidence: 1.0,
          match_status: "confirmed",
          plan_type: "direct",
          category: null,
          transaction_count: 14,
        },
      ],
    });

    render(<MobileImportView defaultMemberId="m-1" />);

    const uploadChoice = await screen.findByRole("button", { name: /already have a statement/i });
    fireEvent.click(uploadChoice);

    expect(screen.getByRole("heading", { level: 3, name: /upload your statement/i })).toBeInTheDocument();

    const fileInput = screen.getByLabelText(/CAS PDF/i);
    const mockFile = new File(["dummy pdf content"], "cas_statement.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [mockFile] } });
    expect(screen.getByText("cas_statement.pdf")).toBeInTheDocument();

    const passwordInput = screen.getByLabelText(/PDF Password/i);
    fireEvent.change(passwordInput, { target: { value: "ABCDE1234F" } });

    const submitBtn = screen.getByRole("button", { name: /Upload Statement/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(importApi.parseImport).toHaveBeenCalledWith(mockFile, "ABCDE1234F");
      expect(screen.getByText("Review CAS Import")).toBeInTheDocument();
      expect(screen.getByText("Parag Parikh Flexi Cap Fund Direct Growth")).toBeInTheDocument();
    });
  });

  it("completes review and confirmation, clears resume state, and displays success screen with navigation CTA", async () => {
    setCasResumeStep2("m-1");

    vi.mocked(importApi.parseImport).mockResolvedValue({
      session_id: "sess-100",
      filename: "statement.pdf",
      investor_email: null,
      cas_type: "detailed",
      file_type: "pdf",
      transactions: [],
      investor_name: "Ayush",
      pan_masked: "ABCDE1234F",
      transaction_count: 8,
      parse_warnings: [],
      schemes: [
        {
          temp_id: "sch-1",
          name: "HDFC Nifty 50 Index Fund Direct Growth",
          isin: null,
          folio: "998877/1",
          amc: "HDFC Mutual Fund",
          amfi_code: "119062",
          suggested_amfi_code: null,
          suggested_name: null,
          match_confidence: 1.0,
          match_status: "confirmed",
          plan_type: "direct",
          category: null,
          transaction_count: 8,
        },
      ],
    });

    vi.mocked(importApi.confirmImport).mockResolvedValue({
      added: 8,
      skipped: 0,
      import_id: "imp-final-1",
      warnings: [
        "This investment may already be tracked under a different Unifolio account. If that's you, consider using that account instead.",
      ],
    });

    const handleDashboardNav = vi.fn();
    render(<MobileImportView defaultMemberId="m-1" onNavigateDashboard={handleDashboardNav} />);

    const fileInput = await screen.findByLabelText(/CAS PDF/i);
    const mockFile = new File(["pdf"], "statement.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    const submitBtn = screen.getByRole("button", { name: /Upload Statement/i });
    fireEvent.click(submitBtn);

    await screen.findByText("Review CAS Import");

    const confirmBtn = screen.getByRole("button", { name: /Confirm & Import Portfolio/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(importApi.confirmImport).toHaveBeenCalledWith("sess-100", "m-1", []);
      expect(screen.getByText("Import Complete")).toBeInTheDocument();
      expect(screen.getByText(/8 new transactions added/i)).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        /may already be tracked under a different Unifolio account/i,
      );
      expect(hasCasResumeStep2("m-1")).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /dismiss warning/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const dashBtn = screen.getByRole("button", { name: /Go to Dashboard/i });
    fireEvent.click(dashBtn);
    expect(handleDashboardNav).toHaveBeenCalledTimes(1);
  });

  it("switches to the matched member after a member-mismatch confirmation", async () => {
    vi.mocked(importApi.confirmImport)
      .mockRejectedValueOnce(
        new importApi.ApiError(409, {
          code: "member_mismatch",
          message: "This statement matches Pooja.",
          matched_member_id: "m-2",
          matched_member_name: "Pooja",
        }),
      )
      .mockResolvedValueOnce({ added: 1, skipped: 0, import_id: "imp-2", warnings: [] });
    await openEmptyReview();

    fireEvent.click(screen.getByRole("button", { name: /confirm & import portfolio/i }));
    fireEvent.click(await screen.findByRole("button", { name: /switch to pooja/i }));

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());
    expect(importApi.confirmImport).toHaveBeenNthCalledWith(
      2,
      "sess-mismatch",
      "m-2",
      [],
      true,
    );
  });

  it("continues with the selected member despite a different matched member", async () => {
    vi.mocked(importApi.confirmImport)
      .mockRejectedValueOnce(
        new importApi.ApiError(409, {
          code: "member_mismatch",
          message: "This statement matches Pooja.",
          matched_member_id: "m-2",
          matched_member_name: "Pooja",
        }),
      )
      .mockResolvedValueOnce({ added: 1, skipped: 0, import_id: "imp-1", warnings: [] });
    await openEmptyReview();

    fireEvent.click(screen.getByRole("button", { name: /confirm & import portfolio/i }));
    expect(await screen.findByRole("button", { name: /switch to pooja/i })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /continue anyway/i }));

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());
    expect(importApi.confirmImport).toHaveBeenNthCalledWith(
      2,
      "sess-mismatch",
      "m-1",
      [],
      true,
    );
  });

  it("only offers continue when no matched member is available", async () => {
    vi.mocked(importApi.confirmImport).mockRejectedValueOnce(
      new importApi.ApiError(409, {
        code: "member_mismatch",
        message: "We couldn't match this statement.",
        matched_member_id: null,
        matched_member_name: "Unknown Investor",
      }),
    );
    await openEmptyReview();

    fireEvent.click(screen.getByRole("button", { name: /confirm & import portfolio/i }));

    expect(await screen.findByRole("button", { name: /continue anyway/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /switch to/i })).not.toBeInTheDocument();
  });

  it("renders member import history when History button is clicked", async () => {
    vi.mocked(importApi.getMemberImportHistory).mockResolvedValue([
      {
        import_id: "imp-hist-1",
        household_member_id: "m-1",
        source_cas_type: "cams",
        status: "import_successful",
        statement_from_date: "2015-01-01",
        statement_to_date: "2025-01-01",
        new_transactions_count: 42,
        duplicate_transactions_count: 0,
        uploaded_at: "2026-02-01T10:00:00Z",
        error_code: null,
        error_message: null,
        confirmed_at: null,
      },
    ]);

    render(<MobileImportView defaultMemberId="m-1" />);

    const historyBtn = await screen.findByRole("button", { name: "Import History" });
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(importApi.getMemberImportHistory).toHaveBeenCalledWith("m-1");
      expect(screen.getByText("Past Statement Imports")).toBeInTheDocument();
      expect(screen.getByText(/2015-01-01 → 2025-01-01/i)).toBeInTheDocument();
      expect(screen.getByText("+42")).toBeInTheDocument();
    });
  });
});
