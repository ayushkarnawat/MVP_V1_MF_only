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
    vi.mocked(api.confirmImport).mockResolvedValue({ added: 3, skipped: 1, import_id: "imp1" });

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

  it("resets to upload from the confirmed screen by default", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport).mockResolvedValue({ added: 1, skipped: 0, import_id: "imp1" });

    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: /confirm import/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));
    await waitFor(() => screen.getByRole("button", { name: /import another cas/i }));
    fireEvent.click(screen.getByRole("button", { name: /import another cas/i }));

    expect(screen.getByRole("button", { name: /^upload$/i })).toBeInTheDocument();
  });

  it("uses ctaLabel and onDone instead of the default reset when provided", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(api.confirmImport).mockResolvedValue({ added: 1, skipped: 0, import_id: "imp1" });
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
