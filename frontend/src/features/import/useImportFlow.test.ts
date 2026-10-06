import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { ApiError } from "./api";
import { useImportFlow } from "./useImportFlow";
import type { ImportPreviewResponse, PersonPreview } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    parseImport: vi.fn(),
    resolveName: vi.fn(),
    resolveSelf: vi.fn(),
    resolvePan: vi.fn(),
    resolveSamePerson: vi.fn(),
    acknowledgePrompt: vi.fn(),
    confirmPeopleImport: vi.fn(),
    discardImportSession: vi.fn(),
  };
});

function person(over: Partial<PersonPreview> = {}): PersonPreview {
  return {
    person_key: "p1",
    name: "Ayush Karnawat",
    name_source: "statement",
    needs_name: false,
    pan_masked: "AB******4K",
    is_me: true,
    status: "new",
    member_id: null,
    fund_count: 2,
    unresolved_count: 0,
    matched_by_name_temp_ids: [],
    ...over,
  };
}

function preview(over: Partial<ImportPreviewResponse> = {}): ImportPreviewResponse {
  return {
    session_id: "s1",
    filename: "cas.pdf",
    investor_name: "Ayush Karnawat",
    investor_email: null,
    pan_masked: "AB******4K",
    schemes: [],
    transactions: [],
    transaction_count: 0,
    parse_warnings: [],
    cas_type: "detailed",
    file_type: "cams",
    people: [person()],
    unassigned_temp_ids: [],
    name_notices: [],
    same_person_prompts: [],
    expires_at: "2026-09-29T12:00:00Z",
    ...over,
  };
}

const FILE = new File(["x"], "cas.pdf", { type: "application/pdf" });
const CONFIRMED = { added: 3, skipped: 0, import_id: "i1", warnings: [], people: [], upload_group_id: null };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useImportFlow", () => {
  it("walks 409 self_name_mismatch -> resolveName -> notices -> people -> review -> confirm", async () => {
    const two = [person(), person({ person_key: "p2", name: "Ramesh Sharma", is_me: false, needs_name: false })];
    vi.mocked(api.parseImport).mockRejectedValue(
      new ApiError(409, { code: "self_name_mismatch", message: "m", session_id: "s1", details: {} }),
    );
    vi.mocked(api.resolveName).mockResolvedValue(
      preview({
        people: two,
        name_notices: [
          { person_key: "p2", member_id: null, current_name: "Ram", statement_name: "Ramesh Sharma", kind: "update", first_upload: false },
        ],
      }),
    );
    vi.mocked(api.confirmPeopleImport).mockResolvedValue(CONFIRMED);

    const { result } = renderHook(() => useImportFlow("m1"));
    expect(result.current.stage).toBe("upload");

    await act(async () => {
      await result.current.upload(FILE, "pw");
    });
    expect(api.parseImport).toHaveBeenCalledWith(FILE, "pw", "m1");
    expect(result.current.stage).toBe("prompt");
    expect(result.current.prompt?.code).toBe("self_name_mismatch");

    await act(async () => {
      await result.current.resolve({ kind: "name", name: "Ayush Karnawat" });
    });
    expect(api.resolveName).toHaveBeenCalledWith("s1", "Ayush Karnawat");
    expect(result.current.stage).toBe("notices");
    expect(result.current.prompt).toBeNull();

    act(() => result.current.dismissNotice());
    expect(result.current.stage).toBe("people");

    act(() => result.current.dismissNotice());
    expect(result.current.stage).toBe("review");

    const people = [{ person_key: "p1", scheme_confirmations: [] }];
    await act(async () => {
      await result.current.confirm(people, { t1: "p2" });
    });
    expect(api.confirmPeopleImport).toHaveBeenCalledWith("s1", people, { t1: "p2" });
    expect(result.current.stage).toBe("confirmed");
    expect(result.current.confirmResult).toEqual(CONFIRMED);
  });

  it("goes straight to review for a single, named person with nothing unassigned", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(preview());
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });
    expect(result.current.stage).toBe("review");
    expect(result.current.preview?.session_id).toBe("s1");
  });

  it("shows the people popup for a single person who needs a name", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(preview({ people: [person({ needs_name: true })] }));
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });
    expect(result.current.stage).toBe("people");
  });

  it("shows the people popup when funds are unassigned", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(preview({ unassigned_temp_ids: ["t9"] }));
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });
    expect(result.current.stage).toBe("people");
  });

  it("returns a 410 on confirm to upload with an expiry banner", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(preview());
    vi.mocked(api.confirmPeopleImport).mockRejectedValue(
      new ApiError(410, { code: "session_expired", message: "This review has expired" }),
    );
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });
    await act(async () => {
      await result.current.confirm([]);
    });
    expect(result.current.stage).toBe("upload");
    expect(result.current.prompt).toBeNull();
    expect(result.current.error).toBe("Your upload timed out. Please upload again.");
  });

  it("dispatches each PromptAction to its api function", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(
      new ApiError(409, { code: "which_is_self", message: "m", session_id: "s1", details: {} }),
    );
    vi.mocked(api.resolveSelf).mockResolvedValue(preview());
    vi.mocked(api.resolvePan).mockResolvedValue(preview());
    vi.mocked(api.resolveSamePerson).mockResolvedValue(preview());
    vi.mocked(api.acknowledgePrompt).mockResolvedValue(preview());
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });

    await act(async () => {
      await result.current.resolve({ kind: "self", personKey: "p1" });
    });
    expect(api.resolveSelf).toHaveBeenCalledWith("s1", "p1");
    await act(async () => {
      await result.current.resolve({ kind: "pan" });
    });
    expect(api.resolvePan).toHaveBeenCalledWith("s1");
    await act(async () => {
      await result.current.resolve({ kind: "samePerson", personKey: "p1", memberId: "m2", same: true });
    });
    expect(api.resolveSamePerson).toHaveBeenCalledWith("s1", "p1", "m2", true);
    await act(async () => {
      await result.current.resolve({ kind: "acknowledge", code: "member_not_in_file" });
    });
    expect(api.acknowledgePrompt).toHaveBeenCalledWith("s1", "member_not_in_file");
  });

  it("chains a follow-up 409 from a resolve call into the next prompt", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(
      new ApiError(409, { code: "self_name_mismatch", message: "m", session_id: "s1", details: {} }),
    );
    vi.mocked(api.resolveSelf).mockRejectedValue(
      new ApiError(409, { code: "cross_account_pan_blocked", message: "n", session_id: "s1", details: {} }),
    );
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });
    await act(async () => {
      await result.current.resolve({ kind: "self", personKey: null });
    });
    expect(result.current.stage).toBe("prompt");
    expect(result.current.prompt?.code).toBe("cross_account_pan_blocked");
  });

  it("discard and cancel release the session and reset to upload", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(preview());
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });
    await act(async () => {
      await result.current.cancel();
    });
    expect(api.discardImportSession).toHaveBeenCalledWith("s1");
    await waitFor(() => expect(result.current.stage).toBe("upload"));
    expect(result.current.preview).toBeNull();
  });

  it("places a not-PDF failure inline on upload", async () => {
    vi.mocked(api.parseImport).mockRejectedValue(new ApiError(400, { code: "invalid_file", message: "Please upload a PDF file." }));
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });
    expect(result.current.stage).toBe("upload");
    expect(result.current.error).toBe("Please upload a PDF file.");
  });

  it("ignores a double-press confirm: a late 410 does not overwrite confirmed", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(preview());
    vi.mocked(api.confirmPeopleImport)
      .mockResolvedValueOnce(CONFIRMED)
      .mockRejectedValueOnce(new ApiError(410, { code: "session_expired", message: "gone" }));
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });
    await act(async () => {
      await Promise.all([result.current.confirm([]), result.current.confirm([])]);
    });
    await act(async () => {
      await result.current.confirm([]);
    });
    expect(result.current.stage).toBe("confirmed");
    expect(result.current.prompt).toBeNull();
    expect(api.confirmPeopleImport).toHaveBeenCalledTimes(1);
  });

  it("keeps review with an error after a non-prompt confirm failure, and allows retry", async () => {
    vi.mocked(api.parseImport).mockResolvedValue(preview());
    vi.mocked(api.confirmPeopleImport)
      .mockRejectedValueOnce(new ApiError(500, "Something broke"))
      .mockResolvedValueOnce(CONFIRMED);
    const { result } = renderHook(() => useImportFlow("m1"));
    await act(async () => {
      await result.current.upload(FILE, "");
    });
    await act(async () => {
      await result.current.confirm([]);
    });
    expect(result.current.stage).toBe("review");
    expect(result.current.error).toBe("Something broke");
    await act(async () => {
      await result.current.confirm([]);
    });
    expect(result.current.stage).toBe("confirmed");
  });
});

it("wrong_password returns to upload with errorCode", async () => {
  vi.mocked(api.parseImport).mockRejectedValue(new ApiError(422, { code: "wrong_password", message: "m" }));
  const { result } = renderHook(() => useImportFlow("m1"));
  await act(() => result.current.upload(FILE, "bad"));
  expect(result.current.stage).toBe("upload");
  expect(result.current.errorCode).toBe("wrong_password");
});
it("expired upload returns to upload with timeout banner", async () => {
  vi.mocked(api.parseImport).mockRejectedValue(new ApiError(410, { code: "session_expired", message: "expired" }));
  const { result } = renderHook(() => useImportFlow("m1"));
  await act(() => result.current.upload(FILE, "pw"));
  expect(result.current.stage).toBe("upload");
  expect(result.current.error).toBe("Your upload timed out. Please upload again.");
});
it("duplicate confirm leaves review with already_imported notice", async () => {
  vi.mocked(api.parseImport).mockResolvedValue(preview());
  vi.mocked(api.confirmPeopleImport).mockRejectedValue(new ApiError(409, { code: "already_imported", message: "This statement was already imported." }));
  const { result } = renderHook(() => useImportFlow("m1"));
  await act(() => result.current.upload(FILE, "pw"));
  await act(() => result.current.confirm([]));
  expect(result.current.stage).toBe("confirmed");
  expect(result.current.errorCode).toBe("already_imported");
});
