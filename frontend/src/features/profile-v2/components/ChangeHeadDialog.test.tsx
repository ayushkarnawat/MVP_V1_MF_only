import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    const fatherRadio = screen.getByRole("radio", { name: /Ramesh Surve/i });

    // QA fixes, C1: a member whose only reasons can be fixed here is a clickable row, not a disabled radio.
    expect(screen.queryByRole("radio", { name: /Aditi Surve/i })).toBeNull();
    const spouseRow = screen.getByRole("button", { name: /Aditi Surve/i });
    expect(spouseRow).toBeEnabled();
    expect(within(spouseRow).getByText("Add details")).toBeInTheDocument();
    expect(within(spouseRow).getByText("Needs an email address and a phone number.")).toBeInTheDocument();
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
    // The open request is handed back so the page can show its banner.
    expect(onClose).toHaveBeenCalledWith(PENDING_STATUS);
  });

  it("preview_labels_and_review_notes_are_shown", async () => {
    vi.mocked(authApi.startHeadChange).mockResolvedValueOnce({
      request: READY_STATUS,
      codes: START_STUB_RESPONSE.codes.map(c => ({ ...c, verified: true, otp: null })),
    });

    await advanceToStep2();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Review the change" })).toBeInTheDocument();

    // QA fixes, C2: the same facts in blocks (the sentences are gone).
    expect(screen.getByTestId("head-review-title")).toHaveTextContent("Ramesh Surve becomes Head of Family");
    const signin = screen.getByTestId("head-review-signin");
    expect(within(signin).getByText("Signs in from now with")).toBeInTheDocument();
    expect(within(signin).getByText("ramesh@example.in")).toBeInTheDocument();
    expect(within(signin).getByText("+919812345678")).toBeInTheDocument();
    expect(screen.getByText("All portfolio data stays exactly as it is.")).toBeInTheDocument();

    const changes = screen.getByTestId("head-review-changes");
    expect(within(changes).getByText("What changes")).toBeInTheDocument();
    const changeRow = (name: string) => within(changes).getByText(name).closest("[data-testid='head-review-change']") as HTMLElement;
    expect(within(changeRow("Siddharth Surve")).getByText("Head of Family → Child")).toBeInTheDocument();
    expect(within(changeRow("Ramesh Surve")).getByText("Parent → Head of Family")).toBeInTheDocument();
    expect(within(changeRow("Aditi Surve")).getByText("Spouse → child-in-law")).toBeInTheDocument();
    expect(within(changeRow("Mohan Surve")).getByText("Uncle → Not set")).toBeInTheDocument();
    expect(screen.getAllByText(/Please check this one after the change\./)).toHaveLength(2);
    expect(screen.getByText(/Their note 'Uncle' will be removed\./)).toBeInTheDocument();

    const signout = screen.getByTestId("head-review-signout");
    expect(signout).toHaveTextContent("You will be signed out.");
    expect(signout).toHaveTextContent("So will everyone else on this account.");
    expect(signout).toHaveTextContent("Siddharth Surve can no longer sign in.");
    expect(screen.queryByText("You and everyone else on this account will be signed out.")).toBeNull();
    expect(screen.queryByText(/will sign in with/)).toBeNull();
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
    // QA fixes, C3: a title and a body with the new head's contact masked (never the full email or number).
    expect(getSignInNotice()).toEqual({
      title: "Head of Family changed",
      body: "Sign in with ra••••••@example.in or +91 ••••• 45678. Siddharth Surve can no longer sign in.",
    });
    expect(JSON.stringify(getSignInNotice())).not.toContain("ramesh@");
    expect(JSON.stringify(getSignInNotice())).not.toContain("9812345678");
  });

  // ---- Review fixes (F2 to F14) ----

  const settle = () =>
    act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });

  afterEach(() => {
    vi.useRealTimers();
  });

  const READY_START: HeadChangeStartResponse = {
    request: READY_STATUS,
    codes: START_STUB_RESPONSE.codes.map(c => ({ ...c, verified: true, otp: null })),
  };

  async function toStep2(
    onClose: () => void = vi.fn(),
    start: HeadChangeStartResponse = START_STUB_RESPONSE,
    extra: { onCompleted?: () => void } = {},
  ) {
    vi.mocked(authApi.startHeadChange).mockResolvedValueOnce(start);
    render(<ChangeHeadDialog members={HOUSEHOLD_FIXTURE} onClose={onClose} onCompleted={extra.onCompleted} />);
    await settle();
    fireEvent.click(screen.getByRole("radio", { name: /Ramesh Surve/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    fireEvent.change(screen.getByLabelText(/your email code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await settle();
  }

  async function toStep3() {
    await toStep2(vi.fn(), READY_START);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
  }

  const NETWORK_SENTENCE = "We could not reach the server. Check your connection and try again.";
  const STEP1_TITLE = "Choose who will be Head of Family";

  it("a_failed_cancel_on_step_two_is_shown_on_step_two", async () => {
    vi.mocked(authApi.cancelHeadChange).mockRejectedValueOnce(
      new ApiError(502, { message: "Could not cancel the change. Try again." }),
    );
    const onClose = vi.fn();
    await toStep2(onClose);

    fireEvent.click(screen.getByRole("button", { name: "Cancel this change" }));
    await settle();

    expect(screen.getByRole("heading", { name: "Enter the four codes" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not cancel the change. Try again.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a_preview_failure_disables_confirm_and_offers_try_again", async () => {
    vi.mocked(authApi.previewHeadChange).mockRejectedValueOnce(
      new ApiError(503, { message: "The service is busy. Try again." }),
    );
    await toStep3();

    expect(screen.getByRole("heading", { name: "Review the change" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The service is busy. Try again.");
    expect(screen.getByRole("button", { name: "Confirm the change" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle();

    expect(authApi.previewHeadChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Confirm the change" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a_network_failure_on_the_preview_says_so_in_plain_words", async () => {
    vi.mocked(authApi.previewHeadChange).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await toStep3();

    expect(screen.getByRole("alert")).toHaveTextContent(NETWORK_SENTENCE);
    expect(screen.getByRole("button", { name: "Confirm the change" })).toBeDisabled();
  });

  it("reopening_when_no_request_is_open_goes_back_to_step_one", async () => {
    vi.mocked(authApi.getPendingHeadChange).mockResolvedValue({ request: null });
    render(
      <ChangeHeadDialog members={HOUSEHOLD_FIXTURE} initialRequest={PENDING_STATUS} onClose={vi.fn()} />,
    );
    await settle();

    expect(screen.getByRole("heading", { name: STEP1_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That change is no longer open. You can start again.",
    );
  });

  it("reopening_when_the_lookup_fails_goes_back_to_step_one", async () => {
    vi.mocked(authApi.getPendingHeadChange).mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      <ChangeHeadDialog members={HOUSEHOLD_FIXTURE} initialRequest={PENDING_STATUS} onClose={vi.fn()} />,
    );
    await settle();

    expect(screen.getByRole("heading", { name: STEP1_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That change is no longer open. You can start again.",
    );
  });

  it("reopening_starts_the_countdown_from_the_time_passed_in", async () => {
    vi.mocked(authApi.getPendingHeadChange).mockReturnValue(new Promise(() => {}));
    vi.mocked(authApi.previewHeadChange).mockReturnValue(new Promise(() => {}));
    render(
      <ChangeHeadDialog
        members={HOUSEHOLD_FIXTURE}
        initialRequest={{ ...PENDING_STATUS, expires_in_seconds: 300 }}
        onClose={vi.fn()}
      />,
    );
    await settle();

    expect(screen.getByText("5:00 left")).toBeInTheDocument();
  });

  it.each(["verify", "resend"])(
    "a_%s_that_finds_no_request_goes_back_to_step_one_with_the_server_message",
    async kind => {
      const err = new ApiError(404, { code: "request_not_found", message: "Head change request not found." });
      if (kind === "verify") vi.mocked(authApi.verifyHeadChangeCode).mockRejectedValueOnce(err);
      else vi.mocked(authApi.resendHeadChangeCode).mockRejectedValueOnce(err);
      await toStep2();

      const box = screen.getByTestId("code-box-current-phone");
      if (kind === "verify") {
        fireEvent.change(within(box).getAllByRole("textbox")[0], { target: { value: "111222" } });
        fireEvent.click(within(box).getByRole("button", { name: "Verify" }));
      } else {
        fireEvent.click(within(box).getByRole("button", { name: "Send again" }));
      }
      await settle();

      expect(screen.getByRole("heading", { name: STEP1_TITLE })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Head change request not found.");
    },
  );

  it("complete_that_finds_no_request_goes_back_to_step_one", async () => {
    vi.mocked(authApi.completeHeadChange).mockRejectedValueOnce(
      new ApiError(404, { code: "request_not_found", message: "Head change request not found." }),
    );
    await toStep3();
    fireEvent.click(screen.getByRole("button", { name: "Confirm the change" }));
    await settle();

    expect(screen.getByRole("heading", { name: STEP1_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Head change request not found.");
  });

  it.each([
    ["request_expired", 410, "The codes expired. Start again."],
    ["request_changed", 409, "Something changed since the codes were sent. Start again."],
  ])("complete_with_%s_goes_back_to_step_one_with_the_server_message", async (code, status, message) => {
    vi.mocked(authApi.completeHeadChange).mockRejectedValueOnce(new ApiError(status, { code, message }));
    await toStep3();
    fireEvent.click(screen.getByRole("button", { name: "Confirm the change" }));
    await settle();

    expect(screen.getByRole("heading", { name: STEP1_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(auth.refreshMe).not.toHaveBeenCalled();
  });

  it("complete_with_a_business_error_shows_it_and_does_not_check_the_session", async () => {
    vi.mocked(authApi.completeHeadChange).mockRejectedValueOnce(
      new ApiError(409, {
        code: "request_not_ready",
        message: "Enter all four codes before confirming the change.",
      }),
    );
    await toStep3();
    fireEvent.click(screen.getByRole("button", { name: "Confirm the change" }));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("Enter all four codes before confirming the change.");
    expect(screen.getByRole("heading", { name: "Review the change" })).toBeInTheDocument();
    expect(auth.refreshMe).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("complete_that_fails_by_network_with_the_session_gone_takes_the_success_path", async () => {
    vi.mocked(authApi.completeHeadChange).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    auth.refreshMe.mockRejectedValueOnce(new ApiError(401, { message: "Invalid session." }));
    const onCompleted = vi.fn();
    await toStep2(vi.fn(), READY_START, { onCompleted });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Confirm the change" }));
    await settle();

    expect(auth.refreshMe).toHaveBeenCalledTimes(1);
    expect(auth.logout).toHaveBeenCalledTimes(1);
    // QA fixes, C3: a title and a body with the new head's contact masked (never the full email or number).
    expect(getSignInNotice()).toEqual({
      title: "Head of Family changed",
      body: "Sign in with ra••••••@example.in or +91 ••••• 45678. Siddharth Surve can no longer sign in.",
    });
    expect(JSON.stringify(getSignInNotice())).not.toContain("ramesh@");
    expect(JSON.stringify(getSignInNotice())).not.toContain("9812345678");
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("complete_that_times_out_with_the_session_gone_takes_the_success_path", async () => {
    vi.mocked(authApi.completeHeadChange).mockRejectedValueOnce(new ApiError(504, "Gateway Timeout"));
    auth.refreshMe.mockRejectedValueOnce(new ApiError(401, { message: "Invalid session." }));
    await toStep3();
    fireEvent.click(screen.getByRole("button", { name: "Confirm the change" }));
    await settle();

    expect(auth.logout).toHaveBeenCalledTimes(1);
    // QA fixes, C3: a title and a body with the new head's contact masked (never the full email or number).
    expect(getSignInNotice()).toEqual({
      title: "Head of Family changed",
      body: "Sign in with ra••••••@example.in or +91 ••••• 45678. Siddharth Surve can no longer sign in.",
    });
    expect(JSON.stringify(getSignInNotice())).not.toContain("ramesh@");
    expect(JSON.stringify(getSignInNotice())).not.toContain("9812345678");
  });

  it("complete_that_fails_by_network_with_the_session_still_valid_shows_the_error", async () => {
    vi.mocked(authApi.completeHeadChange).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    auth.refreshMe.mockResolvedValueOnce(undefined);
    await toStep3();
    fireEvent.click(screen.getByRole("button", { name: "Confirm the change" }));
    await settle();

    expect(auth.refreshMe).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(getSignInNotice()).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(NETWORK_SENTENCE);
    expect(screen.getByRole("heading", { name: "Review the change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm the change" })).toBeEnabled();
  });

  it("a_too_soon_error_after_a_contact_change_is_shown_on_step_one", async () => {
    const message =
      "The sign-in email or phone was changed recently, so the Head of Family cannot be changed until 9 November 2026. This protects your account.";
    vi.mocked(authApi.requestHeadChangeStartCode).mockRejectedValueOnce(
      new ApiError(409, { code: "head_change_after_contact_change", message }),
    );
    render(<ChangeHeadDialog members={HOUSEHOLD_FIXTURE} onClose={vi.fn()} />);
    await settle();
    fireEvent.click(screen.getByRole("radio", { name: /Ramesh Surve/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("heading", { name: STEP1_TITLE })).toBeInTheDocument();
  });

  it("a_too_soon_error_after_a_contact_change_is_also_shown_when_starting", async () => {
    const message = "The sign-in email or phone was changed recently, so the Head of Family cannot be changed.";
    vi.mocked(authApi.startHeadChange).mockRejectedValueOnce(
      new ApiError(409, { code: "head_change_after_contact_change", message }),
    );
    render(<ChangeHeadDialog members={HOUSEHOLD_FIXTURE} onClose={vi.fn()} />);
    await settle();
    fireEvent.click(screen.getByRole("radio", { name: /Ramesh Surve/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    fireEvent.change(screen.getByLabelText(/your email code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("heading", { name: STEP1_TITLE })).toBeInTheDocument();
  });

  it("resend_throttling_shows_the_wait_message_beside_that_box_and_keeps_the_old_code", async () => {
    vi.mocked(authApi.resendHeadChangeCode).mockRejectedValueOnce(
      new ApiError(429, {
        code: "otp_throttled",
        message: "Please wait 40 seconds before asking for another code.",
      }),
    );
    await toStep2();

    const box = screen.getByTestId("code-box-new-phone");
    fireEvent.click(within(box).getByRole("button", { name: "Send again" }));
    await settle();

    expect(within(box).getByRole("alert")).toHaveTextContent(
      "Please wait 40 seconds before asking for another code.",
    );
    expect(within(box).getByText("Test mode: no SMS is sent yet. Your phone code is 555 666.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enter the four codes" })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Send again" })).toBeEnabled();
  });

  it("the_start_code_can_be_sent_again_and_a_throttle_message_shows_inline", async () => {
    vi.mocked(authApi.requestHeadChangeStartCode)
      .mockResolvedValueOnce({ message: "Code sent.", otp: "123456" })
      .mockRejectedValueOnce(
        new ApiError(429, {
          code: "otp_throttled",
          message: "Please wait 30 seconds before asking for another code.",
        }),
      )
      .mockResolvedValueOnce({ message: "Code sent.", otp: "654321" });
    render(<ChangeHeadDialog members={HOUSEHOLD_FIXTURE} onClose={vi.fn()} />);
    await settle();
    fireEvent.click(screen.getByRole("radio", { name: /Ramesh Surve/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Send the code again" }));
    await settle();
    expect(authApi.requestHeadChangeStartCode).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please wait 30 seconds before asking for another code.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Send the code again" }));
    await settle();
    expect(authApi.requestHeadChangeStartCode).toHaveBeenCalledTimes(3);
    expect(authApi.requestHeadChangeStartCode).toHaveBeenLastCalledWith("m-father");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Test mode: your email code is 654 321.")).toBeInTheDocument();
  });

  it("the_countdown_follows_the_clock_so_a_hidden_tab_does_not_drift", async () => {
    vi.useFakeTimers();
    await toStep2();
    expect(screen.getByText("9:50 left")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText("9:40 left")).toBeInTheDocument();

    // A hidden tab: the clock jumps a minute while only one tick fires.
    await act(async () => {
      vi.setSystemTime(Date.now() + 60_000);
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText("8:39 left")).toBeInTheDocument();
  });

  it("at_zero_on_step_two_the_dialog_goes_back_to_step_one_with_the_expiry_message", async () => {
    vi.useFakeTimers();
    await toStep2();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(590_000);
    });

    expect(screen.getByRole("heading", { name: STEP1_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The codes expired. Nothing has changed. Start again.");
    expect(screen.queryByText(/ left$/)).not.toBeInTheDocument();
  });

  it("step_three_shows_the_time_left_and_goes_back_to_step_one_at_zero", async () => {
    vi.useFakeTimers();
    await toStep3();
    expect(screen.getByRole("heading", { name: "Review the change" })).toBeInTheDocument();
    expect(screen.getByText("9:50 left")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByText("9:20 left")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(560_000);
    });
    expect(screen.getByRole("heading", { name: STEP1_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The codes expired. Nothing has changed. Start again.");
  });

  it("focus_moves_to_the_step_heading_when_the_step_changes", async () => {
    await toStep2(vi.fn(), READY_START);
    expect(screen.getByRole("heading", { name: "Enter the four codes" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    expect(screen.getByRole("heading", { name: "Review the change" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await settle();
    expect(screen.getByRole("heading", { name: "Enter the four codes" })).toHaveFocus();
  });

  it("focus_moves_to_the_heading_when_the_focused_verify_button_disappears", async () => {
    vi.mocked(authApi.verifyHeadChangeCode).mockResolvedValueOnce({
      ...PENDING_STATUS,
      verified_count: 2,
      current_phone_verified: true,
    });
    await toStep2();
    const box = screen.getByTestId("code-box-current-phone");
    fireEvent.change(within(box).getAllByRole("textbox")[0], { target: { value: "111222" } });
    const verify = within(box).getByRole("button", { name: "Verify" });
    verify.focus();
    expect(verify).toHaveFocus();
    fireEvent.click(verify);
    await settle();

    expect(within(box).getByText("Verified")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enter the four codes" })).toHaveFocus();
  });

  it("a_member_whose_label_does_not_change_but_needs_a_check_gets_one_plain_sentence", async () => {
    vi.mocked(authApi.previewHeadChange).mockResolvedValueOnce({
      ...PREVIEW_FIXTURE,
      members: [
        {
          member_id: "m-sibling",
          name: "Neha Surve",
          label_before: "parent",
          label_before_other: null,
          label_after: "parent",
          label_after_other: null,
          review_recommended: true,
          cleared: false,
        },
      ],
    });
    await toStep3();

    const row = within(screen.getByTestId("head-review-changes")).getByText("Neha Surve").closest("[data-testid='head-review-change']") as HTMLElement;
    expect(within(row).getByText("Parent")).toBeInTheDocument();
    expect(within(row).getByText("Please check this one after the change.")).toBeInTheDocument();
    expect(within(row).queryByText(/→/)).toBeNull();
    expect(screen.queryByText(/parent becomes parent/i)).not.toBeInTheDocument();
  });

  it("the review shows the time left as a chip next to the headline (QA fixes, C2)", async () => {
    await toStep3();
    const title = screen.getByTestId("head-review-title");
    expect(title.parentElement).toContainElement(screen.getByText("9:50 left"));
  });

  it("Confirm stays disabled while the summary is missing, so the notice always has the new head to name (QA fixes, C2, C3)", async () => {
    vi.mocked(authApi.previewHeadChange).mockRejectedValue(new Error("down"));
    await toStep3();
    expect(screen.getByRole("button", { name: "Confirm the change" })).toBeDisabled();
  });
});
