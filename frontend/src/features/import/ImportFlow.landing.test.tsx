import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportFlow } from "./ImportFlow";
import * as api from "./api";
import * as authApi from "../auth/api";
import { ApiError } from "./api";
import { person, preview, scheme } from "./testFixtures";
import type { ImportConfirmResponse, PersonConfirmResult } from "./types";

// Batch C 17d (C-9): when the user answers the wrong-person pop-up with "Import for these people" and exactly one person was
// imported, the import flow tells its caller who to land on: onDone(notice, { landOnPersonId }). In every other case onDone is
// called with the notice alone, exactly as today (existing tests assert a one-argument call). Design: Batch C workbook section 5,
// "The one exception: the wrong-person import". Red until C-9 builds it.
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    parseImport: vi.fn(), confirmPeopleImport: vi.fn(), discardImportSession: vi.fn(), resolvePan: vi.fn(), resolveName: vi.fn(),
    resolveAddAsFamily: vi.fn(), acknowledgePrompt: vi.fn(),
    // The first Add data screen now waits for the server's answer about a waiting CAMS request.
    getPendingCamsRequest: vi.fn(async () => null),
  };
});
vi.mock("../auth/api", async () => {
  const actual = await vi.importActual<typeof import("../auth/api")>("../auth/api");
  return { ...actual, getHouseholdMembers: vi.fn(), listHouseholdMembers: vi.fn() };
});
vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  const { DOCS } = await import("../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});

async function uploadAFile() {
  // Wait for the first screen (the choice, or the upload form when the flow opened straight on it).
  await waitFor(() => expect(screen.queryByRole("button", { name: /already have a statement/i }) ?? screen.queryByLabelText(/cas pdf/i)).not.toBeNull());
  const uploadChoice = screen.queryByRole("button", { name: /already have a statement/i });
  if (uploadChoice) fireEvent.click(uploadChoice);
  const uploadTab = screen.queryByRole("tab", { name: /upload existing statement/i });
  if (uploadTab) fireEvent.click(uploadTab);
  const file = new File(["pdf-bytes"], "cas.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText(/pdf password/i), { target: { value: "secret" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "privacy policy" })).toBeEnabled());
  await waitFor(() => expect(screen.getByRole("button", { name: /upload statement/i })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /upload/i }));
}

const WRONG_PERSON = () => new ApiError(409, {
  code: "member_not_in_file", message: "This statement is not Prateek's", session_id: "s1",
  details: { member_name: "Prateek Sancheti", member_pan_masked: "FS*******7M", people: ["Lalchand Sancheti"] },
});
const LAL_ONLY = () => preview({
  schemes: [scheme("l1", { person_key: "lal" })],
  people: [person("lal", "Lalchand Sancheti", { status: "new" })],
});
const result = (people: PersonConfirmResult[]): ImportConfirmResponse => ({
  added: 5, skipped: 0, import_id: "imp1", warnings: [], upload_group_id: null, people,
});
const lal = (over: Partial<PersonConfirmResult> = {}): PersonConfirmResult =>
  ({ person_key: "lal", member_id: "m-lal", name: "Lalchand Sancheti", import_id: "imp1", added: 5, skipped: 0, ...over });

async function runWrongPerson(confirmResult: ImportConfirmResponse, acknowledged: ReturnType<typeof preview> = LAL_ONLY()) {
  vi.mocked(api.parseImport).mockRejectedValue(WRONG_PERSON());
  vi.mocked(api.acknowledgePrompt).mockResolvedValue(acknowledged);
  vi.mocked(api.confirmPeopleImport).mockResolvedValue(confirmResult);
  const onDone = vi.fn();
  render(<ImportFlow householdMemberId="m-prateek" onDone={onDone} />);
  await uploadAFile();
  fireEvent.click(await screen.findByRole("button", { name: "Import for these people" }));
  return onDone;
}

beforeEach(() => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([]);
  vi.mocked(authApi.listHouseholdMembers).mockResolvedValue([]);
});
afterEach(() => vi.resetAllMocks());

describe("ImportFlow: who to land on after a wrong-person import (Batch C 17d)", () => {
  it("a wrong-person import that created a new person reports that person's id", async () => {
    const onDone = await runWrongPerson(result([lal({ created: true })]));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0]).toHaveLength(2);
    expect(onDone.mock.calls[0][0]).toMatchObject({ text: expect.stringContaining("5 transactions added") });
    expect(onDone.mock.calls[0][1]).toEqual({ landOnPersonId: "m-lal" });
  });

  it("the same for a person who was already in the family", async () => {
    const onDone = await runWrongPerson(result([lal({ member_id: "m-existing" })]));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][1]).toEqual({ landOnPersonId: "m-existing" });
  });

  it("a family file with several people does not trigger the rule, even after the pop-up was answered", async () => {
    const two = preview({
      schemes: [scheme("l1", { person_key: "lal" }), scheme("k1", { person_key: "kiran" })],
      people: [person("lal", "Lalchand Sancheti", { status: "new" }), person("kiran", "Kiran Sancheti", { status: "new" })],
    });
    const onDone = await runWrongPerson(result([lal(), lal({ person_key: "kiran", member_id: "m-kiran", name: "Kiran Sancheti" })]), two);
    await waitFor(() => screen.getByText("We found 2 people in your statement"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0]).toHaveLength(1);
  });

  it("nothing imported for the person (left out because they are on another account): no landing", async () => {
    const onDone = await runWrongPerson(result([]));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0]).toHaveLength(1);
  });

  it("an ordinary single-person import (no pop-up) calls onDone with the notice alone, as today", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(preview({ schemes: [scheme("m1", { person_key: "me" })] }));
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(result([lal({ person_key: "me", member_id: "m1", name: "Aditi Sharma" })]));
    const onDone = vi.fn();
    render(<ImportFlow householdMemberId="m1" onDone={onDone} />);
    await uploadAFile();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0]).toHaveLength(1);
  });

  it("answering a different pop-up (the other-account one) never lands on anyone", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(new ApiError(409, {
      code: "cross_account_pan_blocked", message: "This statement belongs to another Unifolio account",
      session_id: "s1", details: { people: ["Kiran Sharma"] },
    }));
    vi.mocked(api.acknowledgePrompt).mockResolvedValue(preview({
      schemes: [scheme("k1", { person_key: "kiran" })],
      people: [person("kiran", "Kiran Sharma", { status: "other_account", is_me: true })],
    }));
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(result([lal({ person_key: "kiran", member_id: "m-kiran", name: "Kiran Sharma" })]));
    const onDone = vi.fn();
    render(<ImportFlow householdMemberId="m-prateek" onDone={onDone} />);
    await uploadAFile();
    fireEvent.click(await screen.findByRole("button", { name: /include in family total/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0]).toHaveLength(1);
  });

  it("the answer to the pop-up does not carry over to the next upload after the file was discarded", async () => {
    vi.mocked(api.parseImport)
      .mockRejectedValueOnce(WRONG_PERSON())
      .mockResolvedValueOnce(preview({ schemes: [scheme("p1", { person_key: "me" })] }));
    vi.mocked(api.discardImportSession).mockResolvedValue(undefined as never);
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(result([lal({ person_key: "me", member_id: "m-prateek", name: "Prateek Sancheti" })]));
    const onDone = vi.fn();
    render(<ImportFlow householdMemberId="m-prateek" onDone={onDone} />);
    await uploadAFile();
    fireEvent.click(await screen.findByRole("button", { name: "Upload a different file" }));
    await waitFor(() => expect(api.discardImportSession).toHaveBeenCalled());
    await uploadAFile();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0]).toHaveLength(1);
  });
});
