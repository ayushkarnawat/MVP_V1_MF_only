import { useRef, useState } from "react";
import { LogOut, Mail, Phone, Trash2, UserRound } from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Modal } from "../../components/Modal";
import type { AccountDeletionReason, ContactChangeChannel, OtpRequestResponse } from "../auth/types";
import type { DeleteImportResponse, HouseholdImportHistoryItem } from "../import/types";
import { ImportHistorySection } from "./ImportHistorySection";

interface ProfileViewProps {
  name: string;
  email: string | null;
  phoneNumber: string;
  logout: () => void;
  requestAccountDeletion?: (reason: AccountDeletionReason, feedback?: string) => Promise<void>;
  requestContactChange?: (channel: ContactChangeChannel, identifier: string) => Promise<OtpRequestResponse>;
  verifyContactChange?: (channel: ContactChangeChannel, identifier: string, otp: string) => Promise<void>;
  loadImportHistory?: () => Promise<HouseholdImportHistoryItem[]>;
  deleteImport?: (importId: string) => Promise<DeleteImportResponse>;
}

const DELETION_REASONS: Array<{ value: AccountDeletionReason; label: string }> = [
  { value: "not_using_enough", label: "Not using it enough" },
  { value: "missing_feature", label: "Missing a feature" },
  { value: "found_alternative", label: "Found an alternative" },
  { value: "data_or_trust_concern", label: "Data or trust concern" },
  { value: "other", label: "Other" },
];

export function ProfileView({
  name,
  email,
  phoneNumber,
  logout,
  requestAccountDeletion,
  requestContactChange,
  verifyContactChange,
  loadImportHistory,
  deleteImport,
}: ProfileViewProps) {
  const [deletionStep, setDeletionStep] = useState<"closed" | "survey" | "confirm">("closed");
  const [deletionReason, setDeletionReason] = useState<AccountDeletionReason | null>(null);
  const [feedback, setFeedback] = useState("");
  const [deletionSubmitting, setDeletionSubmitting] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [contactChannel, setContactChannel] = useState<ContactChangeChannel | null>(null);
  const [contactIdentifier, setContactIdentifier] = useState("");
  const [contactOtp, setContactOtp] = useState("");
  const [contactOtpSent, setContactOtpSent] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  // Bumped whenever the contact flow closes or reopens, so a request from
  // an abandoned flow can't apply its result to whatever flow is open by
  // the time it resolves.
  const contactRequestTokenRef = useRef(0);

  const closeContactChange = () => {
    contactRequestTokenRef.current += 1;
    setContactChannel(null);
    setContactIdentifier("");
    setContactOtp("");
    setContactOtpSent(false);
    setContactSubmitting(false);
    setContactError(null);
  };

  const openContactChange = (channel: ContactChangeChannel) => {
    contactRequestTokenRef.current += 1;
    setContactChannel(channel);
    setContactIdentifier("");
    setContactOtp("");
    setContactOtpSent(false);
    setContactSubmitting(false);
    setContactError(null);
  };

  const submitAccountDeletion = async () => {
    if (!deletionReason || !requestAccountDeletion) return;
    setDeletionSubmitting(true);
    setDeletionError(null);
    try {
      await requestAccountDeletion(deletionReason, feedback);
    } catch {
      setDeletionError("Could not schedule account deletion. Please try again.");
    } finally {
      setDeletionSubmitting(false);
    }
  };

  const sendContactCode = async () => {
    if (!contactChannel || !requestContactChange) return;
    const requestToken = contactRequestTokenRef.current;
    setContactSubmitting(true);
    setContactError(null);
    try {
      await requestContactChange(contactChannel, contactIdentifier.trim());
      if (contactRequestTokenRef.current !== requestToken) return;
      setContactOtpSent(true);
    } catch {
      if (contactRequestTokenRef.current !== requestToken) return;
      setContactError("Could not send the verification code. Please try again.");
    } finally {
      if (contactRequestTokenRef.current === requestToken) setContactSubmitting(false);
    }
  };

  const submitContactChange = async () => {
    if (!contactChannel || !verifyContactChange) return;
    const requestToken = contactRequestTokenRef.current;
    setContactSubmitting(true);
    setContactError(null);
    try {
      await verifyContactChange(contactChannel, contactIdentifier.trim(), contactOtp.trim());
      if (contactRequestTokenRef.current !== requestToken) return;
      closeContactChange();
    } catch {
      if (contactRequestTokenRef.current !== requestToken) return;
      setContactError("Could not verify the contact change. Please try again.");
      setContactSubmitting(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
          Account
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight">Profile</h1>
      </div>

      <section className="space-y-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
        <h2 className="font-display text-lg font-semibold">Account Info</h2>
        <AccountRow icon={<UserRound className="h-4 w-4" />} label="Name" value={name} />
        <AccountRow icon={<Mail className="h-4 w-4" />} label="Email" value={email ?? "Not added"} action="Change" onAction={() => openContactChange("email")} />
        <AccountRow icon={<Phone className="h-4 w-4" />} label="Phone" value={phoneNumber} action="Change" onAction={() => openContactChange("phone")} />
        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
          <div>
            <p className="text-sm font-semibold">Appearance</p>
            <p className="text-xs text-[var(--color-text-secondary)]">Choose light or dark mode.</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <ImportHistorySection loadImportHistory={loadImportHistory} deleteImport={deleteImport} />

      <button
        type="button"
        onClick={logout}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>

      <section className="space-y-3 rounded-xl border border-[var(--color-negative)]/60 bg-[color-mix(in_srgb,var(--color-negative)_5%,var(--color-surface))] p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--color-negative)]">Danger Zone</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Permanently remove your account and household data after a five-day grace period.
        </p>
        <button
          type="button"
          onClick={() => setDeletionStep("survey")}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-negative)] px-4 py-2 text-sm font-semibold text-[var(--color-negative)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-negative)]"
        >
          <Trash2 className="h-4 w-4" />
          Delete Account
        </button>
      </section>

      <Modal
        isOpen={deletionStep !== "closed"}
        onClose={() => setDeletionStep("closed")}
        title={deletionStep === "survey" ? "Why are you leaving?" : "Confirm account deletion"}
      >
        {deletionStep === "survey" ? (
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">Choose one reason</legend>
              {DELETION_REASONS.map((reason) => (
                <label key={reason.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--color-border)] p-3 text-sm">
                  <input
                    type="radio"
                    name="deletion-reason"
                    value={reason.value}
                    checked={deletionReason === reason.value}
                    onChange={() => setDeletionReason(reason.value)}
                  />
                  {reason.label}
                </label>
              ))}
            </fieldset>
            <label className="block space-y-2 text-sm font-semibold">
              Anything else? <span className="font-normal text-[var(--color-text-secondary)]">Optional</span>
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                className="min-h-24 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-normal focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </label>
            <button
              type="button"
              disabled={!deletionReason}
              onClick={() => setDeletionStep("confirm")}
              className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-[var(--color-surface)] disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
              Your account and all household data will be permanently deleted in 5 days. You can cancel anytime before then.
            </p>
            <button
              type="button"
              disabled={deletionSubmitting}
              onClick={() => void submitAccountDeletion()}
              className="rounded-lg bg-[var(--color-negative)] px-4 py-2 text-sm font-semibold text-white"
            >
              {deletionSubmitting ? "Scheduling…" : "Confirm deletion"}
            </button>
            {deletionError ? <p role="alert" className="text-sm text-[var(--color-negative)]">{deletionError}</p> : null}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={contactChannel !== null}
        onClose={closeContactChange}
        title={`Change ${contactChannel ?? "contact"}`}
      >
        <div className="space-y-5">
          <label className="block space-y-2 text-sm font-semibold">
            New {contactChannel ?? "contact"}
            <input
              type={contactChannel === "email" ? "email" : "tel"}
              value={contactIdentifier}
              disabled={contactSubmitting || contactOtpSent}
              onChange={(event) => setContactIdentifier(event.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-normal focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </label>
          {!contactOtpSent ? (
            <button
              type="button"
              disabled={!contactIdentifier.trim() || contactSubmitting}
              onClick={() => void sendContactCode()}
              className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-[var(--color-surface)] disabled:opacity-40"
            >
              {contactSubmitting ? "Sending…" : "Send code"}
            </button>
          ) : (
            <>
              <label className="block space-y-2 text-sm font-semibold">
                Verification code
                <input
                  inputMode="numeric"
                  value={contactOtp}
                  disabled={contactSubmitting}
                  onChange={(event) => setContactOtp(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-normal tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </label>
              <button
                type="button"
                disabled={!contactOtp.trim() || contactSubmitting}
                onClick={() => void submitContactChange()}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {contactSubmitting ? "Verifying…" : "Verify change"}
              </button>
            </>
          )}
          {contactError ? <p role="alert" className="text-sm text-[var(--color-negative)]">{contactError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

function AccountRow({
  icon,
  label,
  value,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-4">
      <span className="text-[var(--color-text-secondary)]" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
      {action && (
        <button type="button" onClick={onAction} className="text-sm font-semibold text-[var(--color-accent)] hover:underline">
          {action}
        </button>
      )}
    </div>
  );
}
