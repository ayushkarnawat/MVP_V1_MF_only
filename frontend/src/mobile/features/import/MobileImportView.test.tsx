import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileImportView } from "./MobileImportView";
import { MobileImportHistory } from "./MobileImportHistory";
import * as authApi from "@/features/auth/api";
import * as importApi from "@/features/import/api";
import { setCasResumeStep2, hasCasResumeStep2 } from "@/features/import/casResumeState";
import { familyPreview, preview, scheme } from "@/features/import/testFixtures";
import type { ImportConfirmResponse } from "@/features/import/types";

vi.mock("@/features/auth/api", () => ({
  listHouseholdMembers: vi.fn(),
}));

vi.mock("@/features/import/api", async () => {
  const actual = await vi.importActual<typeof import("@/features/import/api")>("@/features/import/api");
  return {
    ...actual,
    requestCamsStatement: vi.fn(),
    cancelImportRequest: vi.fn(),
    parseImport: vi.fn(),
    confirmPeopleImport: vi.fn(),
    discardImportSession: vi.fn(),
    getMemberImportHistory: vi.fn(),
    getHouseholdImportHistory: vi.fn(),
    deleteHouseholdImport: vi.fn(),
    deleteMemberPortfolio: vi.fn(),
  };
});

const RESULT: ImportConfirmResponse = {
  added: 8, skipped: 0, import_id: "imp-final-1", warnings: [], upload_group_id: null,
  people: [{ person_key: "me", member_id: "m-1", name: "Ayush", import_id: "imp-final-1", added: 8, skipped: 0 }],
};

/** Opens the only ribbon and confirms it (nothing unresolved). */
function reviewRibbon(name: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`Click to review ${name}’s holdings`) }));
  fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
}

async function uploadFile() {
  fireEvent.click(await screen.findByRole("button", { name: /already have a statement/i }));
  const file = new File(["pdf"], "statement.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: /upload statement/i }));
}

describe("MobileImportView", () => {
  const mockMembers = [
    {
      id: "m-1",
      user_id: "u-1",
      name: "Ayush",
      relationship: "self",
      relationship_other_label: null,
      origin: "self",
      lock_reason: null,
      details_required: false,
      pan_masked: "AB******4F",
      email: "ayush@example.com",
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "m-2",
      user_id: "u-1",
      name: "Pooja",
      relationship: "spouse",
      relationship_other_label: null,
      origin: "manual",
      lock_reason: null,
      details_required: false,
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
    vi.mocked(importApi.getHouseholdImportHistory).mockResolvedValue([]);
  });

  async function openReview() {
    vi.mocked(importApi.parseImport).mockResolvedValue(preview({ session_id: "sess-mismatch", schemes: [scheme("s1", { person_key: "me" })] }));
    render(<MobileImportView defaultMemberId="m-1" />);
    await uploadFile();
    await screen.findByText("Review your import");
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
    vi.mocked(importApi.parseImport).mockResolvedValue(
      preview({ session_id: "sess-99", schemes: [scheme("sch-1", { name: "Parag Parikh Flexi Cap Fund Direct Growth", person_key: "me" })] }),
    );

    render(<MobileImportView defaultMemberId="m-1" />);

    fireEvent.click(await screen.findByRole("button", { name: /already have a statement/i }));
    expect(screen.getByRole("heading", { level: 3, name: /upload your statement/i })).toBeInTheDocument();

    const mockFile = new File(["dummy pdf content"], "cas_statement.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/CAS PDF/i), { target: { files: [mockFile] } });
    expect(screen.getByText("cas_statement.pdf")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/PDF Password/i), { target: { value: "ABCDE1234F" } });
    fireEvent.click(screen.getByRole("button", { name: /Upload Statement/i }));

    await waitFor(() => {
      expect(importApi.parseImport).toHaveBeenCalledWith(mockFile, "ABCDE1234F", "m-1");
      expect(screen.getByText("Review your import")).toBeInTheDocument();
    });
  });

  it("reaches the member ribbons through the people popup for a two-person statement", async () => {
    vi.mocked(importApi.parseImport).mockResolvedValue(
      familyPreview({ schemes: [scheme("m1", { person_key: "me" }), scheme("r1", { person_key: "ramesh" })] }),
    );
    render(<MobileImportView defaultMemberId="m-1" />);
    await uploadFile();

    expect(await screen.findByText("We found 2 people in your statement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText("Review your import");
    expect(screen.getByRole("button", { name: /Click to review Aditi Sharma \(Me\)|Click to review Aditi Sharma’s holdings/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Click to review Ramesh Sharma’s holdings/ })).toBeInTheDocument();
  });

  it("completes review and confirmation, clears resume state, and displays success screen with navigation CTA", async () => {
    setCasResumeStep2("m-1");
    vi.mocked(importApi.parseImport).mockResolvedValue(preview({ session_id: "sess-100", schemes: [scheme("s1", { person_key: "me" })] }));
    vi.mocked(importApi.confirmPeopleImport).mockResolvedValue({
      ...RESULT,
      warnings: [
        "This investment may already be tracked under a different Unifolio account. If that's you, consider using that account instead.",
      ],
    });

    const handleDashboardNav = vi.fn();
    render(<MobileImportView defaultMemberId="m-1" onNavigateDashboard={handleDashboardNav} />);

    fireEvent.change(await screen.findByLabelText(/CAS PDF/i), {
      target: { files: [new File(["pdf"], "statement.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Upload Statement/i }));
    await screen.findByText("Review your import");

    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));

    await waitFor(() => {
      expect(importApi.confirmPeopleImport).toHaveBeenCalledWith("sess-100", [{ person_key: "me", scheme_confirmations: [] }], {});
      expect(screen.getByText("Import Complete")).toBeInTheDocument();
      expect(screen.getByText(/8 new transactions added/i)).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/may already be tracked under a different Unifolio account/i);
      expect(hasCasResumeStep2("m-1")).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /dismiss warning/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Go to Dashboard/i }));
    expect(handleDashboardNav).toHaveBeenCalledTimes(1);
  });

  it("shows the cross-account popup right after upload, before any review", async () => {
    vi.mocked(importApi.parseImport).mockRejectedValueOnce(
      new importApi.ApiError(409, {
        code: "cross_account_pan_blocked",
        message: "This PAN is already tracked under a different Unifolio account.",
        details: { people: ["Ayush"] },
      }),
    );
    render(<MobileImportView defaultMemberId="m-1" />);
    await uploadFile();

    // Session-less 409 (F30 hard block): the legacy block, with no dead Include button.
    expect(await screen.findByText("This PAN is already tracked under a different Unifolio account.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /include in family total/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Review your import")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument());
  });

  it("shows the PAN-already-exists popup on a same-account conflict and returns to upload", async () => {
    vi.mocked(importApi.parseImport).mockRejectedValueOnce(
      new importApi.ApiError(409, { code: "pan_mismatch_for_member", message: "Please choose Ayush's own CAS." }),
    );
    render(<MobileImportView defaultMemberId="m-1" />);
    await uploadFile();

    await waitFor(() => expect(screen.getByText("This PAN already exists")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /change cas file/i }));
    await waitFor(() => expect(screen.queryByText("This PAN already exists")).not.toBeInTheDocument());
    expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument();
  });

  it("Cancel on review asks first, then discards the session", async () => {
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(importApi.discardImportSession).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /cancel import/i }));
    await waitFor(() => expect(importApi.discardImportSession).toHaveBeenCalledWith("sess-mismatch"));
  });

  it("shows a locked family member as locked and opens the unlock popup instead of selecting them", async () => {
    vi.mocked(authApi.listHouseholdMembers).mockResolvedValue([
      mockMembers[0],
      { ...mockMembers[1], name: "Ramesh Sharma", relationship: null, origin: "cas", lock_reason: "details_needed", details_required: true },
    ] as any);
    render(<MobileImportView defaultMemberId="m-1" />);

    const chip = await screen.findByRole("button", { name: /Ramesh Sharma/ });
    expect(chip).not.toHaveTextContent("(null)");
    expect(chip).toHaveTextContent(/add details first/i);
    fireEvent.click(chip);
    expect(await screen.findByText("Add Ramesh Sharma’s details")).toBeInTheDocument();
    expect(chip).not.toHaveAttribute("aria-pressed", "true");
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
  describe("import history deletion (D1)", () => {
    const histRow = (over: object) => ({
      import_id: "i1", household_member_id: "m-1", source_cas_type: "cams", status: "import_successful",
      statement_from_date: "2015-01-01", statement_to_date: "2025-01-01", new_transactions_count: 4,
      duplicate_transactions_count: 0, uploaded_at: "2026-02-01T10:00:00Z", error_code: null, error_message: null,
      confirmed_at: null, ...over,
    });
    const householdRow = (over: object) => ({
      import_id: "i1", household_member_id: "m-1", uploaded_at: "2026-02-01T10:00:00Z", statement_from_date: "2015-01-01",
      statement_to_date: "2025-01-01", status: "import_successful", new_transactions_count: 4, upload_group_id: "g1",
      member_name: "Ayush", group_people_count: 2, ...over,
    });

    it("offers only-this-person or everyone for a statement that covered several people", async () => {
      vi.mocked(importApi.getMemberImportHistory).mockResolvedValue([histRow({})] as any);
      vi.mocked(importApi.getHouseholdImportHistory).mockResolvedValue([
        householdRow({}), householdRow({ import_id: "i2", household_member_id: "m-2", member_name: "Pooja" }),
      ] as any);
      vi.mocked(importApi.deleteHouseholdImport).mockResolvedValue({ deleted_transactions_count: 4, removed_member_ids: [], deleted_file: false });

      render(<MobileImportView defaultMemberId="m-1" defaultTab="history" />);
      fireEvent.click(await screen.findByRole("button", { name: /delete import from/i }));

      const dialog = await screen.findByRole("dialog", { name: "Delete this statement’s funds?" });
      fireEvent.click(within(dialog).getByLabelText("Everyone in this statement (2 people)"));
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(importApi.deleteHouseholdImport).toHaveBeenCalledWith("i1", "group"));
      await waitFor(() => expect(screen.queryByText("+4")).not.toBeInTheDocument());
    });
  });
  it("does not preselect a locked defaultMemberId", async () => {
    vi.mocked(authApi.listHouseholdMembers).mockResolvedValue([
      mockMembers[0],
      { ...mockMembers[1], name: "Ramesh Sharma", relationship: null, origin: "cas", lock_reason: "details_needed", details_required: true },
    ] as any);
    vi.mocked(importApi.parseImport).mockResolvedValue(preview({ schemes: [scheme("s1", { person_key: "me" })] }));
    render(<MobileImportView defaultMemberId="m-2" defaultTab="upload" />);
    await screen.findByRole("button", { name: /Ramesh Sharma/ });
    fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [new File(["pdf"], "s.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /upload statement/i }));
    await waitFor(() => expect(importApi.parseImport).toHaveBeenCalledWith(expect.any(File), "", "m-1"));
  });

  describe("delete all funds (D2)", () => {
    const setup = async (onMembersChanged?: () => void) => {
      vi.mocked(importApi.getMemberImportHistory).mockResolvedValue([{
        import_id: "i1", household_member_id: "m-1", source_cas_type: "cams", status: "import_successful",
        statement_from_date: "2015-01-01", statement_to_date: "2025-01-01", new_transactions_count: 4,
        duplicate_transactions_count: 0, uploaded_at: "2026-02-01T10:00:00Z", error_code: null, error_message: null, confirmed_at: null,
      }] as any);
      vi.mocked(importApi.getHouseholdImportHistory).mockResolvedValue([
        { import_id: "i1", household_member_id: "m-2", uploaded_at: "2026-02-01T10:00:00Z", statement_from_date: null, statement_to_date: null, status: "import_successful", new_transactions_count: 4, upload_group_id: "g1", member_name: "Pooja", group_people_count: 1 },
      ] as any);
      vi.mocked(importApi.deleteMemberPortfolio).mockResolvedValue({ deleted_transactions_count: 4, removed_member_ids: ["m-2"], deleted_file: false });
      render(<MobileImportHistory memberId="m-2" onMembersChanged={onMembersChanged} />);
      fireEvent.click(await screen.findByRole("button", { name: "Delete all funds" }));
      return await screen.findByRole("dialog", { name: "Delete all of Pooja’s funds?" });
    };

    it("sends removeMember true when ticked and reports the change", async () => {
      const changed = vi.fn();
      const dialog = await setup(changed);
      fireEvent.click(within(dialog).getByLabelText("Also remove Pooja from my family"));
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(importApi.deleteMemberPortfolio).toHaveBeenCalledWith("m-2", true));
      await waitFor(() => expect(changed).toHaveBeenCalledWith(["m-2"]));
    });

    it("sends removeMember false by default", async () => {
      const dialog = await setup();
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(importApi.deleteMemberPortfolio).toHaveBeenCalledWith("m-2", false));
    });
  });
});
