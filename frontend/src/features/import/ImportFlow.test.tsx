import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportFlow } from "./ImportFlow";
import * as api from "./api";
import { ApiError } from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, parseImport: vi.fn(), confirmImport: vi.fn(), discardImportSession: vi.fn() };
});

function uploadAFile() {
  const uploadChoice = screen.queryByRole("button", { name: /already have a statement/i });
  if (uploadChoice) {
    fireEvent.click(uploadChoice);
  }
  const uploadTab = screen.queryByRole("tab", { name: /upload existing statement/i });
  if (uploadTab) {
    fireEvent.click(uploadTab);
  }
  const file = new File(["pdf-bytes"], "cas.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText(/pdf password/i), { target: { value: "secret" } });
  fireEvent.click(screen.getByRole("button", { name: /upload/i }));
}

const EMPTY_PREVIEW = {
  session_id: "s1", filename: "cas.pdf", investor_name: "Test", investor_email: null,
  pan_masked: "A********F", schemes: [], transactions: [], transaction_count: 0,
  parse_warnings: [], cas_type: "DETAILED", file_type: "FileType.CAMS",
};

describe("ImportFlow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("moves from upload to review on a successful parse", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();

    await waitFor(() => expect(screen.getByText(/review cas import/i)).toBeInTheDocument());
  });

  it("moves to the error screen on a ParseError", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(
      new ApiError(422, { code: "wrong_password", message: "Incorrect PDF password." }),
    );

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();

    await waitFor(() => expect(screen.getByText(/incorrect pdf password/i)).toBeInTheDocument());
  });

  it("shows a generic message on a network failure", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(new TypeError("Failed to fetch"));

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();

    await waitFor(() => expect(screen.getByText(/couldn't reach the server/i)).toBeInTheDocument());
  });

  it("moves to confirmed on a successful confirm, passing the householdMemberId", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport).mockResolvedValue({ added: 3, skipped: 1, import_id: "imp1", warnings: [] });

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: /confirm import/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    expect(api.confirmImport).toHaveBeenCalledWith("s1", "member-1", []);
  });

  it("shows an inline notice instead of navigating away on a 409", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport).mockRejectedValue(new ApiError(409, "Scheme 'X' requires an explicit AMFI code."));

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: /confirm import/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/requires an explicit amfi code/i));
    expect(screen.getByText(/review cas import/i)).toBeInTheDocument();
  });

  it("shows the cross-account-blocked popup right after upload and routes Back through onGoToHousehold", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(
      new ApiError(409, {
        code: "cross_account_pan_blocked",
        message: "This PAN is already tracked under a different Unifolio account. Contact support if you believe this is a mistake.",
      }),
    );
    const handleGoToHousehold = vi.fn();

    render(<ImportFlow householdMemberId="member-1" onGoToHousehold={handleGoToHousehold} />);
    uploadAFile();

    await waitFor(() =>
      expect(screen.getByText(/already tracked under a different unifolio account/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/review cas import/i)).not.toBeInTheDocument();
    expect(api.confirmImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(handleGoToHousehold).toHaveBeenCalledTimes(1);
  });

  it("resets to upload from the confirmed screen by default", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport).mockResolvedValue({ added: 1, skipped: 0, import_id: "imp1", warnings: [] });

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: /confirm import/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));
    await waitFor(() => screen.getByRole("button", { name: /import another cas/i }));
    fireEvent.click(screen.getByRole("button", { name: /import another cas/i }));

    expect(screen.getByRole("button", { name: /request from cams/i })).toBeInTheDocument();
  });

  it("uses ctaLabel and onDone instead of the default reset when provided", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport).mockResolvedValue({ added: 1, skipped: 0, import_id: "imp1", warnings: [] });
    const onDone = vi.fn();

    render(<ImportFlow householdMemberId="member-1" ctaLabel="Continue" onDone={onDone} />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: /confirm import/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));
    await waitFor(() => screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(onDone).toHaveBeenCalled();
  });

  it("passes the household member id to parse", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByText(/review cas import/i));
    expect(api.parseImport).toHaveBeenCalledWith(expect.any(File), "secret", "member-1");
  });

  it("goes straight from Confirm Import to the confirmed screen with no prompt", async () => {
    // Regression: a fresh account used to get "couldn't match... Continue anyway".
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport).mockResolvedValue({ added: 3, skipped: 0, import_id: "imp1", warnings: [] });

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: /confirm import/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /continue anyway/i })).not.toBeInTheDocument();
  });

  it.each(["pan_belongs_to_other_member", "pan_mismatch_for_member"])(
    "shows the PAN-already-exists popup on a %s upload and Change CAS file returns to upload",
    async (code) => {
      vi.mocked(api.parseImport).mockRejectedValueOnce(
        new ApiError(409, { code, message: "Please choose Self's own CAS." }),
      );

      render(<ImportFlow householdMemberId="member-1" />);
      uploadAFile();

      await waitFor(() => expect(screen.getByText("This PAN already exists")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /change cas file/i }));

      await waitFor(() => expect(screen.queryByText("This PAN already exists")).not.toBeInTheDocument());
      expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument();
      expect(api.confirmImport).not.toHaveBeenCalled();
    },
  );

  it("discards the parsed session when resetting after a failed confirm", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport).mockRejectedValue(new TypeError("Failed to fetch"));

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: /confirm import/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));
    await waitFor(() => screen.getByRole("button", { name: /try again/i }));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(api.discardImportSession).toHaveBeenCalledWith("s1");
  });
});
