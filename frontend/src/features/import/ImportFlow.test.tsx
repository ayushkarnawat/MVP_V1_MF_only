import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportFlow } from "./ImportFlow";
import * as api from "./api";
import { ApiError } from "./api";
import { familyPreview, person, preview, scheme } from "./testFixtures";
import type { ImportConfirmResponse } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    parseImport: vi.fn(),
    confirmPeopleImport: vi.fn(),
    discardImportSession: vi.fn(),
    resolvePan: vi.fn(),
    acknowledgePrompt: vi.fn(),
  };
});

function uploadAFile() {
  const uploadChoice = screen.queryByRole("button", { name: /already have a statement/i });
  if (uploadChoice) fireEvent.click(uploadChoice);
  const uploadTab = screen.queryByRole("tab", { name: /upload existing statement/i });
  if (uploadTab) fireEvent.click(uploadTab);
  const file = new File(["pdf-bytes"], "cas.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText(/pdf password/i), { target: { value: "secret" } });
  fireEvent.click(screen.getByRole("button", { name: /upload/i }));
}

const SINGLE = () => preview({ schemes: [scheme("m1", { person_key: "me" })] });

const RESULT: ImportConfirmResponse = {
  added: 3, skipped: 1, import_id: "imp1", warnings: [], upload_group_id: null,
  people: [{ person_key: "me", member_id: "m1", name: "Aditi Sharma", import_id: "imp1", added: 3, skipped: 1 }],
};

/** Opens a ribbon, confirms it (when nothing is unresolved) and returns. */
function reviewRibbon(name: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`Click to review ${name}’s holdings`) }));
  fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
}

async function reachSingleReview() {
  vi.mocked(api.parseImport).mockResolvedValue(SINGLE());
  render(<ImportFlow householdMemberId="member-1" />);
  uploadAFile();
  await waitFor(() => screen.getByText("Review your import"));
}

describe("ImportFlow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("goes from upload straight to one ribbon when the file has only Me (I1), with no popup", async () => {
    await reachSingleReview();
    expect(screen.queryByText(/we found/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Click to review Aditi Sharma’s holdings \(0 unresolved holdings\)/ })).toBeInTheDocument();
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

  it("passes the household member id to parse", async () => {
    await reachSingleReview();
    expect(api.parseImport).toHaveBeenCalledWith(expect.any(File), "secret", "member-1");
  });

  it("confirms a single person and shows the complete screen", async () => {
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(RESULT);
    await reachSingleReview();
    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));

    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    expect(api.confirmPeopleImport).toHaveBeenCalledWith(
      "s1", [{ person_key: "me", scheme_confirmations: [] }], {},
    );
  });

  it("runs parse -> people popup -> two ribbons -> one confirm with both people", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(
      familyPreview({
        schemes: [scheme("m1", { person_key: "me" }), scheme("r1", { person_key: "ramesh" })],
      }),
    );
    vi.mocked(api.confirmPeopleImport).mockResolvedValue({
      ...RESULT, added: 5, skipped: 0,
      people: [
        { person_key: "me", member_id: "m1", name: "Aditi Sharma", import_id: "i1", added: 3, skipped: 0 },
        { person_key: "ramesh", member_id: "m2", name: "Ramesh Sharma", import_id: "i2", added: 2, skipped: 0 },
      ],
    });
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();

    await waitFor(() => screen.getByText("We found 2 people in your statement"));
    expect(api.confirmPeopleImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => screen.getByText("Review your import"));
    const confirmImports = screen.getByRole("button", { name: "Confirm imports" });
    reviewRibbon("Aditi Sharma");
    expect(confirmImports).toBeDisabled();
    reviewRibbon("Ramesh Sharma");
    expect(confirmImports).toBeEnabled();
    fireEvent.click(confirmImports);

    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    expect(api.confirmPeopleImport).toHaveBeenCalledWith(
      "s1",
      [
        { person_key: "me", scheme_confirmations: [] },
        { person_key: "ramesh", scheme_confirmations: [] },
      ],
      {},
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("sends popup name edits and leaves an other-account person out", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(
      preview({
        schemes: [scheme("m1", { person_key: "me" }), scheme("k1", { person_key: "kiran" })],
        people: [
          person("me", "Aditi Sharma", { is_me: true, status: "me" }),
          person("kiran", "Kiran Sharma", { status: "other_account", pan_masked: "DL******6N" }),
        ],
      }),
    );
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(RESULT);
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByText("We found 2 people in your statement"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => screen.getByText("Review your import"));
    expect(screen.queryByText(/Kiran/)).not.toBeInTheDocument();
    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    await waitFor(() => expect(api.confirmPeopleImport).toHaveBeenCalled());
    expect(vi.mocked(api.confirmPeopleImport).mock.calls[0][1]).toEqual([
      { person_key: "me", scheme_confirmations: [] },
      { person_key: "kiran", include: false, scheme_confirmations: [] },
    ]);
  });

  it("shows the expiry banner once less than 5 minutes remain", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(
      preview({ expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString() }),
    );
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByText("Review your import"));
    expect(screen.getByText("Your review closes in 5 minutes. Confirm imports to save it.")).toBeInTheDocument();
  });

  it("C1: a failed confirm keeps the review, and Try again resends the same request", async () => {
    vi.mocked(api.confirmPeopleImport)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(RESULT);
    await reachSingleReview();
    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));

    await waitFor(() => screen.getByText("We couldn’t finish the import"));
    expect(screen.getByText("Nothing was saved. Your review choices are still here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    expect(api.confirmPeopleImport).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.confirmPeopleImport).mock.calls[1]).toEqual(vi.mocked(api.confirmPeopleImport).mock.calls[0]);
  });

  it("a 422 confirm_invalid shows its message with Upload again instead of the retry loop", async () => {
    vi.mocked(api.confirmPeopleImport).mockRejectedValue(
      new ApiError(422, { code: "confirm_invalid", message: "Kiran is now on another Unifolio account. Upload the statement again." }),
    );
    await reachSingleReview();
    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));

    await waitFor(() => screen.getByText("Kiran is now on another Unifolio account. Upload the statement again."));
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upload again" }));
    await waitFor(() => expect(api.discardImportSession).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument());
  });

  it("C1 -> Cancel import -> C3 -> Cancel import discards the session", async () => {
    vi.mocked(api.confirmPeopleImport).mockRejectedValue(new TypeError("Failed to fetch"));
    await reachSingleReview();
    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    await waitFor(() => screen.getByText("We couldn’t finish the import"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));
    await waitFor(() => screen.getByText("Cancel this import?"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));

    await waitFor(() => expect(api.discardImportSession).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument());
  });

  it("C2: a 410 session_expired on confirm shows the expiry popup and Upload again returns to upload", async () => {
    vi.mocked(api.confirmPeopleImport).mockRejectedValue(
      new ApiError(410, { code: "session_expired", message: "expired" }),
    );
    await reachSingleReview();
    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));

    await waitFor(() => screen.getByText("This review has expired"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upload again" }));
    await waitFor(() => expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument());
  });

  it("C3: Cancel on the ribbon screen asks first; Keep reviewing changes nothing", async () => {
    await reachSingleReview();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Cancel this import?")).toBeInTheDocument();
    expect(screen.getByText("Your review choices for 1 person will be lost.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep reviewing" }));
    await waitFor(() => expect(screen.queryByText("Cancel this import?")).not.toBeInTheDocument());
    expect(screen.getByText("Review your import")).toBeInTheDocument();
    expect(api.discardImportSession).not.toHaveBeenCalled();
  });

  it("closing the people popup asks C3 before cancelling", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(familyPreview());
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByText("We found 2 people in your statement"));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => screen.getByText("Cancel this import?"));
    expect(screen.getByText("Your review choices for 2 people will be lost.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));
    await waitFor(() => expect(api.discardImportSession).toHaveBeenCalledWith("s1"));
  });

  it("U7: a statement wholly on another account can be included, giving one ribbon", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(
      new ApiError(409, {
        code: "cross_account_pan_blocked", message: "This statement belongs to another Unifolio account",
        session_id: "s1", details: { people: ["Kiran Sharma"] },
      }),
    );
    vi.mocked(api.acknowledgePrompt).mockResolvedValue(
      preview({
        schemes: [scheme("k1", { person_key: "kiran" })],
        people: [person("kiran", "Kiran Sharma", { status: "other_account", is_me: true })],
      }),
    );
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(RESULT);
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: /include in family total/i }));
    fireEvent.click(screen.getByRole("button", { name: /include in family total/i }));

    await waitFor(() => screen.getByText("Review your import"));
    reviewRibbon("Kiran Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    await waitFor(() => expect(api.confirmPeopleImport).toHaveBeenCalled());
    expect(vi.mocked(api.confirmPeopleImport).mock.calls[0][1]).toEqual([
      { person_key: "kiran", include: true, scheme_confirmations: [] },
    ]);
  });

  it("U7 then the people popup: everyone on another account starts included", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(
      new ApiError(409, {
        code: "cross_account_pan_blocked", message: "This statement belongs to another Unifolio account",
        session_id: "s1", details: { people: ["Kiran Sharma", "Meera Sharma"] },
      }),
    );
    vi.mocked(api.acknowledgePrompt).mockResolvedValue(
      preview({
        schemes: [scheme("k1", { person_key: "kiran" }), scheme("m1", { person_key: "meera" })],
        people: [
          person("kiran", "Kiran Sharma", { status: "other_account", is_me: true }),
          person("meera", "Meera Sharma", { status: "other_account" }),
        ],
      }),
    );
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: /include in family total/i }));
    fireEvent.click(screen.getByRole("button", { name: /include in family total/i }));
    await waitFor(() => screen.getByText("We found 2 people in your statement"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Already chosen at U7, so the review has both ribbons rather than none.
    await waitFor(() => screen.getByText("Review your import"));
    expect(screen.getByRole("button", { name: /Click to review Kiran Sharma/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Click to review Meera Sharma/ })).toBeInTheDocument();
  });

  it.each(["pan_belongs_to_other_member", "pan_mismatch_for_member"])(
    "shows the legacy PAN popup on a %s upload and Change CAS file discards and returns to upload",
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
      expect(api.confirmPeopleImport).not.toHaveBeenCalled();
    },
  );

  it("U4 'The one I entered' discards the session and tells the upload form what to upload", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(
      new ApiError(409, {
        code: "member_pan_mismatch", message: "x", session_id: "s1",
        details: { member_name: "Ramesh Sharma", entered_pan_masked: "BX******8L", statement_pan_masked: "BX******9M" },
      }),
    );
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByText("This PAN doesn’t match what you entered"));
    fireEvent.click(screen.getByRole("button", { name: /the one i entered/i }));

    await waitFor(() => expect(api.discardImportSession).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument());
    expect(screen.getByText("Upload a statement that shows BX******8L for Ramesh Sharma")).toBeInTheDocument();
  });

  it("U12 'Keep the one I entered' actually drops the server session", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(
      new ApiError(409, {
        code: "member_pan_mismatch", message: "x", session_id: "s1",
        details: { member_name: "Ramesh Sharma", entered_pan_masked: "BX******8L", statement_pan_masked: "BX******9M" },
      }),
    );
    vi.mocked(api.resolvePan).mockRejectedValue(
      new ApiError(409, {
        code: "statement_pan_on_other_account", message: "x", session_id: "s1",
        details: { member_name: "Ramesh Sharma", entered_pan_masked: "BX******8L", statement_pan_masked: "BX******9M" },
      }),
    );
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByText("This PAN doesn’t match what you entered"));
    fireEvent.click(screen.getByRole("button", { name: /the one on this statement/i }));
    await waitFor(() => screen.getByText("We can’t switch Ramesh Sharma to this PAN"));
    fireEvent.click(screen.getByRole("button", { name: "Keep the one I entered" }));

    await waitFor(() => expect(api.discardImportSession).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(screen.getByLabelText(/cas pdf/i)).toBeInTheDocument());
  });

  it("name notices run again after a discard and re-upload (PromptHost is keyed per session)", async () => {
    const withNotice = (id: string) =>
      preview({
        session_id: id,
        schemes: [scheme("m1", { person_key: "me" })],
        name_notices: [{
          person_key: "me", member_id: "mem1", current_name: "Aditi Sharma",
          statement_name: "ADITI S SHARMA", kind: "update", first_upload: false,
        }],
      });
    vi.mocked(api.parseImport).mockResolvedValueOnce(withNotice("s1")).mockResolvedValueOnce(withNotice("s2"));
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByText("The name on this statement is a little different"));
    // × = cancel: discards and returns to the upload form.
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(api.discardImportSession).toHaveBeenCalledWith("s1"));
    await waitFor(() => screen.getByLabelText(/cas pdf/i));

    uploadAFile();
    await waitFor(() => screen.getByText("The name on this statement is a little different"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => screen.getByText("Review your import"));
  });

  it("sends a name-notice 'ask' answer as accept_name_update", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(
      preview({
        name_notices: [{
          person_key: "me", member_id: "mem1", current_name: "Aditi Sharma",
          statement_name: "ADITI KARNAWAT", kind: "ask", first_upload: false,
        }],
      }),
    );
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(RESULT);
    render(<ImportFlow householdMemberId="member-1" />);
    uploadAFile();
    await waitFor(() => screen.getByRole("button", { name: "Update" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => screen.getByText("Review your import"));
    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    await waitFor(() => expect(api.confirmPeopleImport).toHaveBeenCalled());
    expect(vi.mocked(api.confirmPeopleImport).mock.calls[0][1]).toEqual([
      { person_key: "me", accept_name_update: true, scheme_confirmations: [] },
    ]);
  });

  it("resets to upload from the confirmed screen by default", async () => {
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(RESULT);
    await reachSingleReview();
    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    await waitFor(() => screen.getByRole("button", { name: /import another cas/i }));
    fireEvent.click(screen.getByRole("button", { name: /import another cas/i }));

    expect(screen.getByRole("button", { name: /request from cams/i })).toBeInTheDocument();
  });

  it("uses ctaLabel and onDone instead of the default reset when provided", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(SINGLE());
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(RESULT);
    const onDone = vi.fn();
    render(<ImportFlow householdMemberId="member-1" ctaLabel="Continue" onDone={onDone} />);
    uploadAFile();
    await waitFor(() => screen.getByText("Review your import"));
    reviewRibbon("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    await waitFor(() => screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onDone).toHaveBeenCalled();
  });
});
