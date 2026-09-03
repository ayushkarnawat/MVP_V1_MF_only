import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportFlow } from "./ImportFlow";
import * as api from "./api";
import { ApiError } from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, parseImport: vi.fn(), confirmImport: vi.fn() };
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

  it("switches to the matched member after a member-mismatch confirmation", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport)
      .mockRejectedValueOnce(
        new ApiError(409, {
          code: "member_mismatch",
          message: "This statement matches Priya Kumar.",
          matched_member_id: "member-2",
          matched_member_name: "Priya Kumar",
        }),
      )
      .mockResolvedValueOnce({ added: 1, skipped: 0, import_id: "imp1", warnings: [] });

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    fireEvent.click(await screen.findByRole("button", { name: /confirm import/i }));
    fireEvent.click(await screen.findByRole("button", { name: /switch to priya kumar/i }));

    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    expect(api.confirmImport).toHaveBeenNthCalledWith(1, "s1", "member-1", []);
    expect(api.confirmImport).toHaveBeenNthCalledWith(2, "s1", "member-2", [], true);
  });

  it("continues with the selected member despite a different matched member", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport)
      .mockRejectedValueOnce(
        new ApiError(409, {
          code: "member_mismatch",
          message: "This statement matches Priya Kumar.",
          matched_member_id: "member-2",
          matched_member_name: "Priya Kumar",
        }),
      )
      .mockResolvedValueOnce({ added: 1, skipped: 0, import_id: "imp1", warnings: [] });

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    fireEvent.click(await screen.findByRole("button", { name: /confirm import/i }));

    expect(await screen.findByRole("button", { name: /switch to priya kumar/i })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /continue anyway/i }));

    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    expect(api.confirmImport).toHaveBeenNthCalledWith(2, "s1", "member-1", [], true);
  });

  it("only offers continue when no matched member is available", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport).mockRejectedValueOnce(
      new ApiError(409, {
        code: "member_mismatch",
        message: "We couldn't match this statement.",
        matched_member_id: null,
        matched_member_name: "Unknown Investor",
      }),
    );

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    fireEvent.click(await screen.findByRole("button", { name: /confirm import/i }));

    expect(await screen.findByRole("button", { name: /continue anyway/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /switch to/i })).not.toBeInTheDocument();
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
});
