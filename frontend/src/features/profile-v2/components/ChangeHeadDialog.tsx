import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { OtpStubBanner } from "@/components/OtpStubBanner";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import { useAuth } from "@/features/auth/AuthContext";
import {
  cancelHeadChange,
  completeHeadChange,
  getHeadChangeEligibility,
  getPendingHeadChange,
  parseHeadChangeError,
  previewHeadChange,
  requestHeadChangeStartCode,
  resendHeadChangeCode,
  startHeadChange,
  verifyHeadChangeCode,
} from "@/features/auth/api";
import { setSignInNotice } from "@/features/auth/session";
import type {
  ContactChangeChannel,
  HeadChangeParty,
  HeadChangePreviewMember,
  HeadChangePreviewResponse,
  HeadChangeStatus,
  HouseholdMember,
  MemberEligibilityItem,
  Relationship,
} from "@/features/auth/types";
import { cleanName, relationshipText } from "../lib/memberLabels";

export interface ChangeHeadDialogProps {
  members: readonly HouseholdMember[];
  initialRequest?: HeadChangeStatus | null;
  onClose: (openRequest?: HeadChangeStatus | null) => void;
  onCancelled?: () => void;
  onCompleted?: () => void;
}

type Step = 1 | 2 | 3;
type BoxKey = "current:email" | "current:phone" | "new:email" | "new:phone";

const BOX_SPECS: readonly { key: BoxKey; party: HeadChangeParty; channel: ContactChangeChannel }[] = [
  { key: "current:email", party: "current", channel: "email" },
  { key: "current:phone", party: "current", channel: "phone" },
  { key: "new:email", party: "new", channel: "email" },
  { key: "new:phone", party: "new", channel: "phone" },
];

const REASON_SENTENCES: Record<string, string> = {
  no_email: "Add an email address and a phone number first.",
  no_phone: "Add an email address and a phone number first.",
  no_pan: "Add their PAN in their profile first.",
  label_missing: "Set how they are related to you first: spouse, parent, child or sibling.",
  same_email_as_head: "Their email is the same as yours. Use a different one.",
  same_phone_as_head: "Their phone number is the same as yours. Use a different one.",
  head_change_already_open: "A change is already waiting for codes.",
  import_in_progress: "Finish or cancel the statement you are importing first.",
  account_pending_deletion: "This account is scheduled for deletion. Reactivate it first.",
};

const EXPIRED_FALLBACK_MESSAGE = "The codes expired. Nothing has changed. Start again.";
const NO_LONGER_OPEN_MESSAGE = "That change is no longer open. You can start again.";
const SIGN_IN_NOTICE =
  "The Head of Family has been changed. Sign in with the new Head's email or phone number.";

function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// The same wording the member cards use ("Me", "Spouse", the free-text note for "other", "Not set").
function previewLabelText(label: Relationship | null, otherLabel: string | null): string {
  // "Me" reads wrongly in a sentence about two people; the account holder is the Head of Family here.
  if (label === "self") return "Head of Family";
  return relationshipText({ relationship: label, relationship_other_label: otherLabel } as HouseholdMember);
}

// The error may come from the app's ApiError or a look-alike; read the status without depending on the class.
function errorStatus(err: unknown): number | null {
  const status = err && typeof err === "object" ? (err as { status?: unknown }).status : null;
  return typeof status === "number" ? status : null;
}

function isBoxVerified(status: HeadChangeStatus | null, key: BoxKey): boolean {
  if (!status) return false;
  switch (key) {
    case "current:email":
      return status.current_email_verified;
    case "current:phone":
      return status.current_phone_verified;
    case "new:email":
      return status.new_email_verified;
    case "new:phone":
      return status.new_phone_verified;
  }
}

function hasLabelChange(member: HeadChangePreviewMember): boolean {
  return (
    member.label_before !== member.label_after ||
    (member.label_before_other ?? null) !== (member.label_after_other ?? null) ||
    member.cleared ||
    member.review_recommended
  );
}

export function ChangeHeadDialog({
  members,
  initialRequest = null,
  onClose,
  onCancelled,
  onCompleted,
}: ChangeHeadDialogProps) {
  const { logout, refreshMe } = useAuth();

  const [step, setStep] = useState<Step>(() => (initialRequest ? 2 : 1));
  const [eligibility, setEligibility] = useState<MemberEligibilityItem[]>([]);
  const [loadingEligibility, setLoadingEligibility] = useState<boolean>(() => !initialRequest);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [startCodeSent, setStartCodeSent] = useState(false);
  const [startCodeOtp, setStartCodeOtp] = useState<string | null>(null);
  const [currentHeadCode, setCurrentHeadCode] = useState("");
  const [step1Submitting, setStep1Submitting] = useState<"start-code" | "start" | null>(null);
  const [step1Error, setStep1Error] = useState<string | null>(null);

  const [status, setStatus] = useState<HeadChangeStatus | null>(initialRequest);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    initialRequest?.expires_in_seconds ?? 0,
  );
  // The countdown is read from an end time, not counted in ticks, so a hidden tab (whose timers slow
  // down) cannot show more time than is really left.
  const [initialEndAt] = useState<number | null>(() =>
    initialRequest ? Date.now() + initialRequest.expires_in_seconds * 1000 : null,
  );
  const endAtRef = useRef<number | null>(initialEndAt);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef<Step>(step);
  const [newHeadName, setNewHeadName] = useState<string>("");
  const [boxValues, setBoxValues] = useState<Record<BoxKey, string>>({
    "current:email": "",
    "current:phone": "",
    "new:email": "",
    "new:phone": "",
  });
  const [stubOtps, setStubOtps] = useState<Record<BoxKey, string | null>>({
    "current:email": null,
    "current:phone": null,
    "new:email": null,
    "new:phone": null,
  });
  const [boxErrors, setBoxErrors] = useState<Record<BoxKey, string | null>>({
    "current:email": null,
    "current:phone": null,
    "new:email": null,
    "new:phone": null,
  });
  const [busyBox, setBusyBox] = useState<BoxKey | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);

  const [preview, setPreview] = useState<HeadChangePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [step3Error, setStep3Error] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadEligibility = () => {
    setLoadingEligibility(true);
    getHeadChangeEligibility()
      .then(res => {
        if (!mountedRef.current) return;
        setEligibility(res.members);
      })
      .catch(err => {
        if (!mountedRef.current) return;
        setStep1Error(parseHeadChangeError(err).message);
      })
      .finally(() => {
        if (mountedRef.current) setLoadingEligibility(false);
      });
  };

  useEffect(() => {
    if (!initialRequest) {
      loadEligibility();
      return;
    }
    let active = true;
    Promise.all([
      // A failed lookup is treated like "nothing is open": the person can start again from step 1.
      getPendingHeadChange().then(res => res.request, () => null),
      previewHeadChange(initialRequest.request_id).catch(() => null),
    ]).then(([pending, previewRes]) => {
      if (!active || !mountedRef.current) return;
      if (!pending) {
        resetToStep1WithMessage(NO_LONGER_OPEN_MESSAGE);
        return;
      }
      setStatus(pending);
      startCountdown(pending.expires_in_seconds);
      if (previewRes) {
        setNewHeadName(cleanName(previewRes.new_head.name));
      }
    });
    return () => {
      active = false;
    };
  }, [initialRequest]);

  function startCountdown(seconds: number) {
    endAtRef.current = Date.now() + seconds * 1000;
    setRemainingSeconds(Math.max(0, Math.ceil(seconds)));
  }

  function resetToStep1WithMessage(message: string) {
    endAtRef.current = null;
    setStatus(null);
    setRemainingSeconds(0);
    setPreview(null);
    setPreviewFailed(false);
    setStartCodeSent(false);
    setStartCodeOtp(null);
    setCurrentHeadCode("");
    setStep2Error(null);
    setStep3Error(null);
    setStep1Error(message);
    setStep(1);
    loadEligibility();
  }

  const countdownRunning = (step === 2 || step === 3) && status !== null;
  useEffect(() => {
    if (!countdownRunning) return;
    const tick = () => {
      const endAt = endAtRef.current;
      if (endAt === null) return;
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0) {
        window.clearInterval(timer);
        resetToStep1WithMessage(EXPIRED_FALLBACK_MESSAGE);
      }
    };
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(timer);
  }, [countdownRunning]);

  // Keyboard and screen-reader users must not be left on <body> when the step changes: move focus
  // to the title. The title is the only part that stays on screen across steps.
  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    titleRef.current?.focus();
  }, [step]);

  // A box turning "Verified" removes the button that had focus; put focus on the title instead.
  useEffect(() => {
    if (step !== 2) return;
    const active = document.activeElement;
    const dialog = titleRef.current?.closest('[role="dialog"]');
    if (!active || active === document.body || (dialog && !dialog.contains(active))) {
      titleRef.current?.focus();
    }
  }, [status, step]);

  const handleModalClose = () => {
    if (completing || cancelling) return;
    onClose(step >= 2 ? status : null);
  };

  const handleRequestStartCode = async () => {
    if (!selectedMemberId || step1Submitting !== null) return;
    setStep1Submitting("start-code");
    setStep1Error(null);
    try {
      const res = await requestHeadChangeStartCode(selectedMemberId);
      if (!mountedRef.current) return;
      setStartCodeOtp(res.otp);
      setStartCodeSent(true);
      setCurrentHeadCode("");
    } catch (err) {
      if (!mountedRef.current) return;
      setStep1Error(parseHeadChangeError(err).message);
    } finally {
      if (mountedRef.current) setStep1Submitting(null);
    }
  };

  const handleStart = async () => {
    if (!selectedMemberId || currentHeadCode.trim().length < 6 || step1Submitting !== null) return;
    setStep1Submitting("start");
    setStep1Error(null);
    try {
      const res = await startHeadChange(selectedMemberId, currentHeadCode.trim());
      if (!mountedRef.current) return;
      const chosen = members.find(m => m.id === selectedMemberId);
      setNewHeadName(cleanName(chosen?.name) || "Family member");
      setStatus(res.request);
      startCountdown(res.request.expires_in_seconds);
      setStep2Error(null);
      const nextStubs: Record<BoxKey, string | null> = {
        "current:email": null,
        "current:phone": null,
        "new:email": null,
        "new:phone": null,
      };
      for (const item of res.codes) {
        const k = `${item.party}:${item.channel}` as BoxKey;
        nextStubs[k] = item.otp;
      }
      setStubOtps(nextStubs);
      setBoxValues({
        "current:email": "",
        "current:phone": "",
        "new:email": "",
        "new:phone": "",
      });
      setBoxErrors({
        "current:email": null,
        "current:phone": null,
        "new:email": null,
        "new:phone": null,
      });
      setStep(2);
    } catch (err) {
      if (!mountedRef.current) return;
      setStep1Error(parseHeadChangeError(err).message);
    } finally {
      if (mountedRef.current) setStep1Submitting(null);
    }
  };

  const handleVerifyBox = async (
    key: BoxKey,
    party: HeadChangeParty,
    channel: ContactChangeChannel,
  ) => {
    if (!status || busyBox !== null) return;
    const code = boxValues[key].trim();
    if (code.length < 6) return;
    setBusyBox(key);
    setBoxErrors(prev => ({ ...prev, [key]: null }));
    try {
      const updated = await verifyHeadChangeCode(status.request_id, party, channel, code);
      if (!mountedRef.current) return;
      setStatus(updated);
      startCountdown(updated.expires_in_seconds);
    } catch (err) {
      if (!mountedRef.current) return;
      const parsed = parseHeadChangeError(err);
      if (parsed.code === "request_expired" || parsed.code === "request_not_found") {
        resetToStep1WithMessage(parsed.message);
        return;
      }
      setBoxErrors(prev => ({ ...prev, [key]: parsed.message }));
    } finally {
      if (mountedRef.current) setBusyBox(null);
    }
  };

  const handleResendBox = async (
    key: BoxKey,
    party: HeadChangeParty,
    channel: ContactChangeChannel,
  ) => {
    if (!status || busyBox !== null) return;
    setBusyBox(key);
    setBoxErrors(prev => ({ ...prev, [key]: null }));
    try {
      const res = await resendHeadChangeCode(status.request_id, party, channel);
      if (!mountedRef.current) return;
      setStatus(res.request);
      startCountdown(res.request.expires_in_seconds);
      setStubOtps(prev => ({ ...prev, [key]: res.code.otp }));
    } catch (err) {
      if (!mountedRef.current) return;
      const parsed = parseHeadChangeError(err);
      if (parsed.code === "request_expired" || parsed.code === "request_not_found") {
        resetToStep1WithMessage(parsed.message);
        return;
      }
      setBoxErrors(prev => ({ ...prev, [key]: parsed.message }));
    } finally {
      if (mountedRef.current) setBusyBox(null);
    }
  };

  // Confirm stays disabled until this has succeeded, so a person never confirms a change they have not seen.
  const loadPreview = async (requestId: string) => {
    setStep3Error(null);
    setPreviewFailed(false);
    setPreview(null);
    setPreviewLoading(true);
    try {
      const res = await previewHeadChange(requestId);
      if (!mountedRef.current) return;
      setPreview(res);
      setNewHeadName(cleanName(res.new_head.name));
    } catch (err) {
      if (!mountedRef.current) return;
      const parsed = parseHeadChangeError(err);
      if (
        parsed.code === "member_not_eligible" ||
        parsed.code === "request_expired" ||
        parsed.code === "request_not_found" ||
        parsed.code === "request_changed"
      ) {
        resetToStep1WithMessage(parsed.message);
        return;
      }
      setStep3Error(parsed.message);
      setPreviewFailed(true);
    } finally {
      if (mountedRef.current) setPreviewLoading(false);
    }
  };

  const handleGoToStep3 = async () => {
    if (!status || !status.ready) return;
    setStep2Error(null);
    setStep(3);
    await loadPreview(status.request_id);
  };

  const handleCancelRequest = async () => {
    if (cancelling || completing) return;
    setCancelling(true);
    setStep2Error(null);
    try {
      await cancelHeadChange();
      if (!mountedRef.current) return;
      onCancelled?.();
      onClose(null);
    } catch (err) {
      if (!mountedRef.current) return;
      const parsed = parseHeadChangeError(err);
      if (step === 3) {
        setStep3Error(parsed.message);
      } else {
        setStep2Error(parsed.message);
      }
    } finally {
      if (mountedRef.current) setCancelling(false);
    }
  };

  const finishSignedOut = () => {
    setSignInNotice(SIGN_IN_NOTICE);
    logout();
    onCompleted?.();
  };

  // The change deletes every session, so after an answer we cannot trust (no answer, or a server
  // error) the server may already have done it. Ask the server who we are: 401 means we are signed out.
  // Not every 401 is "signed out" (a wrong code is a 401 too), so only this check decides.
  const sessionIsGone = async (): Promise<boolean> => {
    try {
      await refreshMe();
      return false;
    } catch (err) {
      return errorStatus(err) === 401;
    }
  };

  const handleComplete = async () => {
    if (!status || completing) return;
    setCompleting(true);
    setStep3Error(null);
    try {
      await completeHeadChange(status.request_id);
      finishSignedOut();
    } catch (err) {
      const parsed = parseHeadChangeError(err);
      if (
        parsed.code === "request_expired" ||
        parsed.code === "request_changed" ||
        parsed.code === "request_not_found"
      ) {
        if (!mountedRef.current) return;
        setCompleting(false);
        resetToStep1WithMessage(parsed.message);
        return;
      }
      const serverStatus = errorStatus(err);
      const answeredWithBusinessError = parsed.code !== null && (serverStatus === null || serverStatus < 500);
      if (!answeredWithBusinessError && (await sessionIsGone())) {
        finishSignedOut();
        return;
      }
      if (!mountedRef.current) return;
      setStep3Error(parsed.message);
      setCompleting(false);
    }
  };

  const title =
    step === 1
      ? "Choose who will be Head of Family"
      : step === 2
        ? "Enter the four codes"
        : "Review the change";

  const resolvedNewHeadName =
    newHeadName ||
    cleanName(members.find(m => m.id === selectedMemberId)?.name) ||
    "New Head";

  return (
    <Modal isOpen onClose={handleModalClose} title={title} titleRef={titleRef}>
      {step === 1 ? (
        <div className="space-y-4">
          {loadingEligibility ? (
            <p className="text-sm text-[var(--shell-text-body)]">Loading family members…</p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="sr-only">Family members</legend>
              {eligibility.map(item => {
                const member = members.find(m => m.id === item.member_id);
                const memberName = cleanName(member?.name) || "Family member";
                const relText = member ? relationshipText(member) : "Not set";
                const eligible = item.reasons.length === 0;
                const firstReason = item.reasons[0];
                const reasonText = firstReason
                  ? (REASON_SENTENCES[firstReason] ?? "This family member is not eligible right now.")
                  : null;

                return (
                  <label
                    key={item.member_id}
                    aria-disabled={!eligible}
                    className={`flex items-start gap-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-sm ${
                      eligible && !startCodeSent
                        ? "cursor-pointer hover:bg-[var(--ui-row-hover)]"
                        : "cursor-not-allowed opacity-60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="head-change-member"
                      value={item.member_id}
                      disabled={!eligible || startCodeSent || step1Submitting !== null}
                      checked={selectedMemberId === item.member_id}
                      onChange={() => {
                        if (eligible && !startCodeSent) {
                          setSelectedMemberId(item.member_id);
                          setStep1Error(null);
                        }
                      }}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-[var(--ui-text)]">
                          {memberName}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-[var(--ui-text-muted)]">
                          {relText}
                        </span>
                      </span>
                      {reasonText ? (
                        <span className="mt-1 block text-xs text-[var(--ui-text-muted)]">
                          {reasonText}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {startCodeSent ? (
            <div className="space-y-2 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3">
              <label
                htmlFor="current-head-start-code"
                className="block text-sm font-semibold text-[var(--ui-text)]"
              >
                Your email code
              </label>
              <p className="text-xs text-[var(--shell-text-body)]">
                Enter the code sent to your email to start this change.
              </p>
              <OtpInput
                id="current-head-start-code"
                value={currentHeadCode}
                onChange={setCurrentHeadCode}
                disabled={step1Submitting !== null}
              />
              <OtpStubBanner code={startCodeOtp} channel="email" />
              <button
                type="button"
                disabled={step1Submitting !== null}
                onClick={() => void handleRequestStartCode()}
                className="text-xs font-semibold text-[var(--pos-text)] hover:underline disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
              >
                Send the code again
              </button>
            </div>
          ) : null}

          {step1Error ? (
            <p role="alert" className="text-sm text-[var(--neg-text)]">
              {step1Error}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleModalClose}
              disabled={step1Submitting !== null}
              className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              Cancel
            </button>
            {!startCodeSent ? (
              <Button
                type="button"
                disabled={!selectedMemberId || step1Submitting !== null}
                onClick={() => void handleRequestStartCode()}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                disabled={currentHeadCode.trim().length < 6 || step1Submitting !== null}
                onClick={() => void handleStart()}
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      ) : step === 2 ? (
        <div className="space-y-4">
          <p className="text-xs font-medium text-[var(--ui-text-muted)]">
            {formatCountdown(remainingSeconds)} left
          </p>

          <div className="space-y-3">
            {BOX_SPECS.map(({ key, party, channel }) => {
              const label =
                party === "current"
                  ? channel === "email"
                    ? "Your email"
                    : "Your phone"
                  : channel === "email"
                    ? `${resolvedNewHeadName}'s email`
                    : `${resolvedNewHeadName}'s phone`;
              const verified = isBoxVerified(status, key);
              const inputId = `otp-${party}-${channel}`;
              const value = boxValues[key];
              const boxError = boxErrors[key];
              const stubOtp = stubOtps[key];

              return (
                <div
                  key={key}
                  data-testid={`code-box-${party}-${channel}`}
                  className="space-y-2 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={verified ? undefined : inputId}
                      className="text-sm font-semibold text-[var(--ui-text)]"
                    >
                      {label}
                    </label>
                    {verified ? (
                      <span className="text-xs font-semibold text-[var(--pos-text)]">
                        Verified
                      </span>
                    ) : null}
                  </div>

                  {!verified ? (
                    <>
                      <OtpInput
                        id={inputId}
                        value={value}
                        onChange={nextVal =>
                          setBoxValues(prev => ({ ...prev, [key]: nextVal }))
                        }
                        autoFocus={false}
                        disabled={busyBox === key}
                      />
                      <OtpStubBanner code={stubOtp} channel={channel} />
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busyBox !== null}
                          onClick={() => void handleResendBox(key, party, channel)}
                          className="text-xs font-semibold text-[var(--pos-text)] hover:underline disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
                        >
                          Send again
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={value.trim().length < 6 || busyBox !== null}
                          onClick={() => void handleVerifyBox(key, party, channel)}
                        >
                          Verify
                        </Button>
                      </div>
                      {boxError ? (
                        <p role="alert" className="text-xs text-[var(--neg-text)]">
                          {boxError}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          {step2Error ? (
            <p role="alert" className="text-sm text-[var(--neg-text)]">
              {step2Error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={cancelling || busyBox !== null}
              onClick={() => void handleCancelRequest()}
              className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              Cancel this change
            </button>
            <Button
              type="button"
              disabled={!status?.ready || busyBox !== null || cancelling}
              onClick={() => void handleGoToStep3()}
            >
              Next
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-medium text-[var(--ui-text-muted)]">
            {formatCountdown(remainingSeconds)} left
          </p>

          {previewLoading && !preview ? (
            <p className="text-sm text-[var(--shell-text-body)]">Loading summary…</p>
          ) : preview ? (
            <>
              <div className="space-y-2 text-sm text-[var(--ui-text)]">
                <p>
                  {cleanName(preview.new_head.name)} will sign in with {preview.new_head.email} and{" "}
                  {preview.new_head.phone_number}.
                </p>
                <p>
                  {cleanName(preview.old_head.name)} stays as a member and will no longer sign in.
                </p>
                <p>You and everyone else on this account will be signed out.</p>
                <p>All portfolio data stays exactly as it is.</p>
              </div>

              <ul className="space-y-2 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-sm text-[var(--ui-text)]">
                {preview.old_head_new_label ? (
                  <li>
                    {cleanName(preview.old_head.name)}: {previewLabelText("self", null)} becomes{" "}
                    {previewLabelText(preview.old_head_new_label, null)}
                  </li>
                ) : null}
                {preview.members.filter(hasLabelChange).map(member => {
                  const before = previewLabelText(member.label_before, member.label_before_other);
                  const after = previewLabelText(member.label_after, member.label_after_other);
                  // Same label before and after: "X: parent becomes parent" would be meaningless, so
                  // say the label once and ask for a check.
                  if (before === after && member.review_recommended && !member.cleared) {
                    return (
                      <li key={member.member_id}>
                        <p>
                          {`${cleanName(member.name)}: ${before}. Please check this one after the change.`}
                        </p>
                      </li>
                    );
                  }
                  return (
                    <li key={member.member_id} className="space-y-0.5">
                      <p>
                        {cleanName(member.name)}: {before} becomes {after}
                      </p>
                      {member.review_recommended ? (
                        <p className="text-xs text-[var(--ui-text-muted)]">
                          Please check this one after the change.
                        </p>
                      ) : null}
                      {member.cleared && member.label_before_other ? (
                        <p className="text-xs text-[var(--ui-text-muted)]">
                          {`Their note '${member.label_before_other}' will be removed.`}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {step3Error ? (
            <p role="alert" className="text-sm text-[var(--neg-text)]">
              {step3Error}
            </p>
          ) : null}
          {previewFailed && !previewLoading && status ? (
            <button
              type="button"
              onClick={() => void loadPreview(status.request_id)}
              className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              Try again
            </button>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={completing || cancelling}
              onClick={() => void handleCancelRequest()}
              className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              Cancel this change
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={completing || cancelling}
                onClick={() => setStep(2)}
                className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
              >
                Back
              </button>
              <Button
                type="button"
                disabled={!preview || completing || previewLoading || cancelling}
                onClick={() => void handleComplete()}
              >
                Confirm the change
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
