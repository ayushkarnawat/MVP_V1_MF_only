import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FamilyImportFlow } from "./FamilyImportFlow";
import { AuthProvider } from "./AuthContext";
import * as authApi from "./api";
import * as importApi from "../import/api";
import { ApiError } from "../import/api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn(), listHouseholdMembers: vi.fn(), createHouseholdMember: vi.fn() };
});

vi.mock("../import/api", async () => {
  const actual = await vi.importActual<typeof import("../import/api")>("../import/api");
  return { ...actual, parseImport: vi.fn(), confirmImport: vi.fn() };
});

const ME = {
  user_id: "u1", phone_number: "+919999999999", email: null,
  onboarding_step: "family_cas_upload", onboarding_completed: false, investor_type: null, primary_goal: null,
};

const FAMILY = [
  { id: "mom", name: "Mom", relationship: "parent" as const, relationship_other_label: null },
  { id: "dad", name: "Dad", relationship: "parent" as const, relationship_other_label: null },
];

const EMPTY_PREVIEW = {
  session_id: "s1", filename: "cas.pdf", investor_name: null, investor_email: null,
  pan_masked: null, schemes: [], transactions: [], transaction_count: 0,
  parse_warnings: [], cas_type: "DETAILED", file_type: "FileType.CAMS",
};

function uploadFor(memberLabel: RegExp) {
  const file = new File(["pdf-bytes"], "cas.pdf", { type: "application/pdf" });
  fireEvent.click(screen.getByRole("button", { name: memberLabel }));
  const uploadChoice = screen.queryByRole("button", { name: /already have a statement/i });
  if (uploadChoice) {
    fireEvent.click(uploadChoice);
  }
  const uploadTab = screen.queryByRole("tab", { name: /upload existing statement/i });
  if (uploadTab) {
    fireEvent.click(uploadTab);
  }
  fireEvent.change(screen.getByLabelText(/cas pdf/i), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText(/pdf password/i), { target: { value: "secret" } });
  fireEvent.click(screen.getByRole("button", { name: /upload & parse statement/i }));
}

function renderFlow() {
  vi.mocked(authApi.getMe).mockResolvedValue(ME);
  vi.mocked(authApi.updateMe).mockImplementation(async (body) => ({ ...ME, ...body }) as typeof ME);
  vi.mocked(authApi.listHouseholdMembers).mockResolvedValue(FAMILY);
  return render(
    <AuthProvider>
      <FamilyImportFlow selfName="Ayush" />
    </AuthProvider>,
  );
}

describe("FamilyImportFlow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows one card per family member, all Not Uploaded initially", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByText("Mom")).toBeInTheDocument());

    expect(screen.getAllByText(/not uploaded/i)).toHaveLength(2);
  });

  it("flips a card to Uploaded after choosing a file for that member, without affecting the other card", async () => {
    renderFlow();
    await waitFor(() => screen.getByText("Mom"));

    uploadFor(/upload cas for mom/i);

    // Anchored: /uploaded/i alone would also match the "Not Uploaded" badge.
    await waitFor(() => expect(screen.getAllByText(/^uploaded$/i)).toHaveLength(1));
    expect(screen.getByText(/not uploaded/i)).toBeInTheDocument();
  });

  it("does not call parseImport when a file is queued (upload only queues, never auto-parses)", async () => {
    renderFlow();
    await waitFor(() => screen.getByText("Mom"));

    uploadFor(/upload cas for mom/i);

    await waitFor(() => expect(screen.getAllByText(/^uploaded$/i)).toHaveLength(1));
    expect(importApi.parseImport).not.toHaveBeenCalled();
  });

  it("reaches Upload My CAS? once every member card is Uploaded or skipped, then Parse Queue on Upload Later", async () => {
    renderFlow();
    await waitFor(() => screen.getByText("Mom"));
    uploadFor(/upload cas for mom/i);
    await waitFor(() => screen.getAllByText(/uploaded/i));
    fireEvent.click(screen.getByRole("button", { name: /skip for now.*dad/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(screen.getByText(/upload your own cas/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /upload later/i }));

    await waitFor(() => expect(screen.getByText(/cas\.pdf/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /parse files/i })).toBeInTheDocument();
  });

  it("parses queued files sequentially and shows one aggregate ImportConfirmed at the end", async () => {
    vi.mocked(importApi.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(importApi.confirmImport)
      .mockResolvedValueOnce({ added: 2, skipped: 0, import_id: "imp-mom" })
      .mockResolvedValueOnce({ added: 3, skipped: 1, import_id: "imp-dad" });

    renderFlow();
    await waitFor(() => screen.getByText("Mom"));
    uploadFor(/upload cas for mom/i);
    await waitFor(() => screen.getAllByText(/uploaded/i));
    uploadFor(/upload cas for dad/i);
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(screen.getByText(/upload your own cas/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /upload later/i }));
    await waitFor(() => screen.getByRole("button", { name: /parse files/i }));

    fireEvent.click(screen.getByRole("button", { name: /parse files/i }));

    await waitFor(() => expect(screen.getByText(/review mom's cas import/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(screen.getByText(/review dad's cas import/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    expect(screen.getByText(/5 new transactions added, 1 duplicate skipped/i)).toBeInTheDocument();
    expect(importApi.confirmImport).toHaveBeenNthCalledWith(1, "s1", "mom", []);
    expect(importApi.confirmImport).toHaveBeenNthCalledWith(2, "s1", "dad", []);
  });

  it("retries the same item on Try again after a per-item parse failure", async () => {
    vi.mocked(importApi.parseImport)
      .mockRejectedValueOnce({ status: 422, payload: { code: "wrong_password", message: "Incorrect PDF password." } })
      .mockResolvedValueOnce(EMPTY_PREVIEW);

    renderFlow();
    await waitFor(() => screen.getByText("Mom"));
    uploadFor(/upload cas for mom/i);
    await waitFor(() => screen.getAllByText(/uploaded/i));
    fireEvent.click(screen.getByRole("button", { name: /skip for now.*dad/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => screen.getByText(/upload your own cas/i));
    fireEvent.click(screen.getByRole("button", { name: /upload later/i }));
    await waitFor(() => screen.getByRole("button", { name: /parse files/i }));

    fireEvent.click(screen.getByRole("button", { name: /parse files/i }));

    await waitFor(() => expect(screen.getByText(/import failed/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(screen.getByText(/review mom's cas import/i)).toBeInTheDocument());
    expect(importApi.parseImport).toHaveBeenCalledTimes(2);
  });

  it("skips a failed item via the explicit skip button and moves to the next queued file", async () => {
    vi.mocked(importApi.parseImport)
      .mockRejectedValueOnce({ status: 422, payload: { code: "wrong_password", message: "Incorrect PDF password." } })
      .mockResolvedValueOnce(EMPTY_PREVIEW);

    renderFlow();
    await waitFor(() => screen.getByText("Mom"));
    uploadFor(/upload cas for mom/i);
    await waitFor(() => screen.getAllByText(/uploaded/i));
    uploadFor(/upload cas for dad/i);
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => screen.getByText(/upload your own cas/i));
    fireEvent.click(screen.getByRole("button", { name: /upload later/i }));
    await waitFor(() => screen.getByRole("button", { name: /parse files/i }));

    fireEvent.click(screen.getByRole("button", { name: /parse files/i }));

    await waitFor(() => expect(screen.getByText(/import failed/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /skip mom for now/i }));

    await waitFor(() => expect(screen.getByText(/review dad's cas import/i)).toBeInTheDocument());
  });

  it("stays on the review screen with an alert when confirm fails with 404", async () => {
    vi.mocked(importApi.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    vi.mocked(importApi.confirmImport).mockRejectedValueOnce(new ApiError(404, "Import session not found."));

    renderFlow();
    await waitFor(() => screen.getByText("Mom"));
    uploadFor(/upload cas for mom/i);
    await waitFor(() => screen.getAllByText(/uploaded/i));
    fireEvent.click(screen.getByRole("button", { name: /skip for now.*dad/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => screen.getByText(/upload your own cas/i));
    fireEvent.click(screen.getByRole("button", { name: /upload later/i }));
    await waitFor(() => screen.getByRole("button", { name: /parse files/i }));

    fireEvent.click(screen.getByRole("button", { name: /parse files/i }));
    await waitFor(() => expect(screen.getByText(/review mom's cas import/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/expired/i));
    expect(screen.getByText(/review mom's cas import/i)).toBeInTheDocument();
  });

  it("shows a recoverable error when own-upload self-member setup fails", async () => {
    renderFlow();
    await waitFor(() => screen.getByText("Mom"));
    // The initial roster fetch (above) must succeed for cards to render; only the
    // later resolveSelfMember() call (triggered on entering own-upload) should fail.
    vi.mocked(authApi.listHouseholdMembers).mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(screen.getByRole("button", { name: /skip for now.*mom/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip for now.*dad/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => screen.getByText(/upload your own cas/i));
    fireEvent.click(screen.getByRole("button", { name: /upload now/i }));

    await waitFor(() => expect(screen.getByText(/couldn't set up your profile/i)).toBeInTheDocument());
  });

  it("completes onboarding straight away when everything is skipped and Upload Later is chosen with an empty queue", async () => {
    renderFlow();
    await waitFor(() => screen.getByText("Mom"));
    fireEvent.click(screen.getByRole("button", { name: /skip for now.*mom/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip for now.*dad/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(screen.getByText(/upload your own cas/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /upload later/i }));

    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    expect(screen.getByText(/0 new transactions added/i)).toBeInTheDocument();
    expect(importApi.confirmImport).not.toHaveBeenCalled();
  });

  it("disables the Confirm button while a confirm is in flight", async () => {
    vi.mocked(importApi.parseImport).mockResolvedValue(EMPTY_PREVIEW);
    let resolveConfirm: (value: { added: number; skipped: number; import_id: string }) => void = () => {};
    vi.mocked(importApi.confirmImport).mockReturnValue(
      new Promise((resolve) => {
        resolveConfirm = resolve;
      }),
    );

    renderFlow();
    await waitFor(() => screen.getByText("Mom"));
    uploadFor(/upload cas for mom/i);
    await waitFor(() => screen.getAllByText(/uploaded/i));
    fireEvent.click(screen.getByRole("button", { name: /skip for now.*dad/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => screen.getByText(/upload your own cas/i));
    fireEvent.click(screen.getByRole("button", { name: /upload later/i }));
    await waitFor(() => screen.getByRole("button", { name: /parse files/i }));

    fireEvent.click(screen.getByRole("button", { name: /parse files/i }));
    await waitFor(() => expect(screen.getByText(/review mom's cas import/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /confirming/i })).toBeDisabled());

    resolveConfirm({ added: 1, skipped: 0, import_id: "imp-mom" });
    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
  });
});
