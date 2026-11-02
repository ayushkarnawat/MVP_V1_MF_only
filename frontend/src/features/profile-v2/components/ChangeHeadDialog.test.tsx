import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "@/features/auth/api";
import { getSignInNotice, setSignInNotice } from "@/features/auth/session";
import type {
  HeadChangePreviewResponse,
  HeadChangeStartResponse,
  HeadChangeStatus,
  MeResponse,
} from "@/features/auth/types";
import { ApiError } from "@/lib/apiClient";
import { ME_FIXTURE } from "../fixtures/me";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import { ChangeHeadDialog } from "./ChangeHeadDialog";

const auth = vi.hoisted(() => ({
  me: null as MeResponse | null,
  logout: vi.fn(),
  refreshMe: vi.fn(),
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/features/auth/api", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/api")>("@/features/auth/api");
  return {
    ...actual,
    getHeadChangeEligibility: vi.fn(),
    requestHeadChangeStartCode: vi.fn(),
    startHeadChange: vi.fn(),
    verifyHeadChangeCode: vi.fn(),
    resendHeadChangeCode: vi.fn(),
    cancelHeadChange: vi.fn(),
    getPendingHeadChange: vi.fn(),
    previewHeadChange: vi.fn(),
    completeHeadChange: vi.fn(),
  };
});

const PENDING_STATUS: HeadChangeStatus = {
  request_id: "req-1",
  status: "pending",
  expires_in_seconds: 590,
  verified_count: 1,
  ready: false,
  current_email_verified: true,
  current_phone_verified: false,
  new_email_verified: false,
  new_phone_verified: false,
};

const READY_STATUS: HeadChangeStatus = {
  ...PENDING_STATUS,
  status: "ready",
  verified_count: 4,
  ready: true,
  current_phone_verified: true,
  new_email_verified: true,
  new_phone_verified: true,
};

const START_STUB_RESPONSE: HeadChangeStartResponse = {
  request: PENDING_STATUS,
  codes: [
    { party: "current", channel: "email", verified: true, otp: null },
    { party: "current", channel: "phone", verified: false, otp: "111222" },
    { party: "new", channel: "email", verified: false, otp: "333444" },
    { party: "new", channel: "phone", verified: false, otp: "555666" },
  ],
};

const PREVIEW_FIXTURE: HeadChangePreviewResponse = {
  request_id: "req-1",
  old_head: { member_id: "m-self", name: "Siddharth Surve" },
  new_head: {
    member_id: "m-father",
    name: "Ramesh Surve",
    email: "ramesh@example.in",
    phone_number: "+919812345678",
  },
  old_head_new_label: "child",
  members: [
    {
      member_id: "m-father",
      name: "Ramesh Surve",
      label_before: "parent",
      label_before_other: null,
      label_after: "self",
      label_after_other: null,
      review_recommended: false,
      cleared: false,
    },
    {
      member_id: "m-spouse",
      name: "Aditi Surve",
      label_before: "spouse",
      label_before_other: null,
      label_after: "other",
      label_after_other: "child-in-law",
      review_recommended: true,
      cleared: false,
    },
    {
      member_id: "m-uncle",
      name: "Mohan Surve",
      label_before: "other",
      label_before_other: "Uncle",
      label_after: null,
      label_after_other: null,
      review_recommended: true,
      cleared: true,
    },
  ],
  everyone_signed_out: true,
};

describe("ChangeHeadDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSignInNotice(null);
    auth.me = { ...ME_FIXTURE, head_member_id: "m-self" };
    auth.refreshMe.mockResolvedValue(undefined);
    vi.mocked(authApi.getHeadChangeEligibility).mockResolvedValue({
      members: [
        { member_id: "m-spouse", reasons: ["no_email", "no_phone"] },
        { member_id: "m-father", reasons: [] },
      ],
    });
    vi.mocked(authApi.requestHeadChangeStartCode).mockResolvedValue({
      message: "Code sent.",
      otp: "123456",
    });
    vi.mocked(authApi.startHeadChange).mockResolvedValue(START_STUB_RESPONSE);
    vi.mocked(authApi.verifyHeadChangeCode).mockResolvedValue(PENDING_STATUS);
    vi.mocked(authApi.resendHeadChangeCode).mockResolvedValue({
      request: PENDING_STATUS,
      code: { party: "current", channel: "phone", verified: false, otp: "999888" },
    });
    vi.mocked(authApi.cancelHeadChange).mockResolvedValue({
      ...PENDING_STATUS,
      status: "cancelled",
      expires_in_seconds: 0,
    });
    vi.mocked(authApi.getPendingHeadChange).mockResolvedValue({ request: PENDING_STATUS });
    vi.mocked(authApi.previewHeadChange).mockResolvedValue(PREVIEW_FIXTURE);
    vi.mocked(authApi.completeHeadChange).mockResolvedValue({
      status: "completed",
      logout_required: true,
    });
  });

  async function advanceToStep2() {
    render(<ChangeHeadDialog members={HOUSEHOLD_FIXTURE} onClose={vi.fn()} />);
    const fatherRadio = await screen.findByRole("radio", { name: /Ramesh Surve/i });
    fireEvent.click(fatherRadio);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const codeInput = await screen.findByLabelText(/your email code/i);
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter the four codes" });
  }

  it("ineligible_members_are_greyed_with_the_reason", async () => {
    render(<ChangeHeadDialog members={HOUSEHOLD_FIXTURE} onClose={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "Choose who will be Head of Family" }),
    ).toBeInTheDocument();

    const spouseRadio = screen.getByRole("radio", { name: /Aditi Surve/i });
    const fatherRadio = screen.getByRole("radio", { name: /Ramesh Surve/i });

    expect(spouseRadio).toBeDisabled();
    expect(screen.getByText("Add an email address and a phone number first.")).toBeInTheDocument();
    expect(fatherRadio).toBeEnabled();

    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).toBeDisabled();

    fireEvent.click(fatherRadio);
    expect(nextButton).toBeEnabled();
  });

  it("a_too_soon_error_is_shown_on_step_one", async () => {
    vi.mocked(authApi.requestHeadChangeStartCode).mockRejectedValueOnce(
      new ApiError(409, {
        code: "head_change_too_soon",
        message: "The Head of Family was changed recently. You can change it again after 9 November 2026.",
      }),
    );

    render(<ChangeHeadDialog members={HOUSEHOLD_FIXTURE} onClose={vi.fn()} />);

    const fatherRadio = await screen.findByRole("radio", { name: /Ramesh Surve/i });
    fireEvent.click(fatherRadio);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The Head of Family was changed recently. You can change it again after 9 November 2026.",
    );
  });

  it("four_boxes_with_stub_codes_visible_in_stub_mode", async () => {
    await advanceToStep2();

    const currentEmailBox = screen.getByTestId("code-box-current-email");
    const currentPhoneBox = screen.getByTestId("code-box-current-phone");
    const newEmailBox = screen.getByTestId("code-box-new-email");
    const newPhoneBox = screen.getByTestId("code-box-new-phone");

    expect(within(currentEmailBox).getByText("Your email")).toBeInTheDocument();
    expect(within(currentEmailBox).getByText("Verified")).toBeInTheDocument();

    expect(within(currentPhoneBox).getByText("Your phone")).toBeInTheDocument();
    expect(
      within(currentPhoneBox).getByText("Test mode: no SMS is sent yet. Your phone code is 111 222."),
    ).toBeInTheDocument();

    expect(within(newEmailBox).getByText("Ramesh Surve's email")).toBeInTheDocument();
    expect(
      within(newEmailBox).getByText("Test mode: your email code is 333 444."),
    ).toBeInTheDocument();

    expect(within(newPhoneBox).getByText("Ramesh Surve's phone")).toBeInTheDocument();
    expect(
      within(newPhoneBox).getByText("Test mode: no SMS is sent yet. Your phone code is 555 666."),
    ).toBeInTheDocument();
  });

  it("stub_strip_absent_when_the_api_returns_no_code", async () => {
    vi.mocked(authApi.requestHeadChangeStartCode).mockResolvedValueOnce({
      message: "Code sent.",
      otp: null,
    });
    vi.mocked(authApi.startHeadChange).mockResolvedValueOnce({
      request: PENDING_STATUS,
      codes: [
        { party: "current", channel: "email", verified: true, otp: null },
        { party: "current", channel: "phone", verified: false, otp: null },
        { party: "new", channel: "email", verified: false, otp: null },
        { party: "new", channel: "phone", verified: false, otp: null },
      ],
    });

    await advanceToStep2();

    expect(screen.queryByText(/Test mode:/i)).not.toBeInTheDocument();
  });

  it("confirm_disabled_until_all_four_verified", async () => {
    await advanceToStep2();

    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).toBeDisabled();

    vi.mocked(authApi.verifyHeadChangeCode)
      .mockResolvedValueOnce({
        ...PENDING_STATUS,
        verified_count: 2,
        current_phone_verified: true,
      })
      .mockResolvedValueOnce({
        ...PENDING_STATUS,
        verified_count: 3,
        current_phone_verified: true,
        new_email_verified: true,
      })
      .mockResolvedValueOnce(READY_STATUS);

    const currentPhoneBox = screen.getByTestId("code-box-current-phone");
    fireEvent.change(within(currentPhoneBox).getAllByRole("textbox")[0], {
      target: { value: "111222" },
    });
    fireEvent.click(within(currentPhoneBox).getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(within(currentPhoneBox).getByText("Verified")).toBeInTheDocument());
    expect(nextButton).toBeDisabled();

    const newEmailBox = screen.getByTestId("code-box-new-email");
    fireEvent.change(within(newEmailBox).getAllByRole("textbox")[0], {
      target: { value: "333444" },
    });
    fireEvent.click(within(newEmailBox).getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(within(newEmailBox).getByText("Verified")).toBeInTheDocument());
    expect(nextButton).toBeDisabled();

    const newPhoneBox = screen.getByTestId("code-box-new-phone");
    fireEvent.change(within(newPhoneBox).getAllByRole("textbox")[0], {
      target: { value: "555666" },
    });
    fireEvent.click(within(newPhoneBox).getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(within(newPhoneBox).getByText("Verified")).toBeInTheDocument());

    expect(nextButton).toBeEnabled();
  });

  it("each_error_message_appears_beside_its_box", async () => {
    vi.mocked(authApi.verifyHeadChangeCode).mockRejectedValueOnce(
      new ApiError(401, { code: "wrong_code", message: "That code is not right." }),
    );
    vi.mocked(authApi.resendHeadChangeCode).mockRejectedValueOnce(
      new ApiError(429, {
        code: "otp_throttled",
        message: "Please wait 40 seconds before asking for another code.",
      }),
    );

    await advanceToStep2();

    const currentPhoneBox = screen.getByTestId("code-box-current-phone");
    const newEmailBox = screen.getByTestId("code-box-new-email");
    const newPhoneBox = screen.getByTestId("code-box-new-phone");

    fireEvent.change(within(currentPhoneBox).getAllByRole("textbox")[0], {
      target: { value: "000000" },
    });
    fireEvent.click(within(currentPhoneBox).getByRole("button", { name: "Verify" }));

    expect(await within(currentPhoneBox).findByRole("alert")).toHaveTextContent(
      "That code is not right.",
    );
    expect(within(newEmailBox).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(newPhoneBox).queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(within(newEmailBox).getByRole("button", { name: "Send again" }));
    expect(await within(newEmailBox).findByRole("alert")).toHaveTextContent(
      "Please wait 40 seconds before asking for another code.",
    );
    expect(within(newPhoneBox).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closing_the_dialog_does_not_cancel_the_request", async () => {
    const onClose = vi.fn();
    render(<ChangeHeadDialog members={HOUSEHOLD_FIXTURE} onClose={onClose} />);

    const fatherRadio = await screen.findByRole("radio", { name: /Ramesh Surve/i });
    fireEvent.click(fatherRadio);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const codeInput = await screen.findByLabelText(/your email code/i);
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Enter the four codes" });

    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(authApi.cancelHeadChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("preview_labels_and_review_notes_are_shown", async () => {
    vi.mocked(authApi.startHeadChange).mockResolvedValueOnce({
      request: READY_STATUS,
      codes: START_STUB_RESPONSE.codes.map(c => ({ ...c, verified: true, otp: null })),
    });

    await advanceToStep2();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Review the change" })).toBeInTheDocument();
    expect(
      screen.getByText("Ramesh Surve will sign in with ramesh@example.in and +919812345678."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Siddharth Surve stays as a member and will no longer sign in."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You and everyone else on this account will be signed out."),
    ).toBeInTheDocument();
    expect(screen.getByText("All portfolio data stays exactly as it is.")).toBeInTheDocument();

    expect(screen.getByText(/Siddharth Surve: self becomes child/)).toBeInTheDocument();
    expect(screen.getByText(/Ramesh Surve: parent becomes self/)).toBeInTheDocument();
    expect(screen.getByText(/Aditi Surve: spouse becomes child-in-law/)).toBeInTheDocument();
    expect(screen.getByText(/Mohan Surve: Uncle becomes not set/)).toBeInTheDocument();
    expect(screen.getAllByText(/Please check this one after the change\./)).toHaveLength(2);
    expect(screen.getByText(/Their note 'Uncle' will be removed\./)).toBeInTheDocument();
  });

  it("success_calls_logout", async () => {
    vi.mocked(authApi.startHeadChange).mockResolvedValueOnce({
      request: READY_STATUS,
      codes: START_STUB_RESPONSE.codes.map(c => ({ ...c, verified: true, otp: null })),
    });

    await advanceToStep2();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Review the change" });

    fireEvent.click(screen.getByRole("button", { name: "Confirm the change" }));

    await waitFor(() => expect(authApi.completeHeadChange).toHaveBeenCalledWith("req-1"));
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(getSignInNotice()).toBe(
      "The Head of Family has been changed. Sign in with the new Head's email or phone number.",
    );
  });
});
