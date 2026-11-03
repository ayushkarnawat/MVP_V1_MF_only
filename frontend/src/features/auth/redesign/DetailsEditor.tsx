import { useState } from "react";
import { useAuth } from "../AuthContext";
import { listHouseholdMembers, updateMemberProfile } from "../api";
import { formatAuthErrorMessage } from "../validation";
import { AccountDetails } from "./AccountDetails";
import { EmailCode } from "./EmailCode";

export interface DetailsEditorProps {
  /** What is saved now. */
  initialName: string;
  initialEmail: string;
  /** Called once every changed value is saved (or nothing changed). */
  onDone: (saved: { name: string }) => void;
  /** Back to screen 4 without saving anything more. */
  onBack: () => void;
}

const EMAIL_NOTE = "If you change it, we send a new code to the new address.";

/**
 * Sign-up screen 3 again, reached by Back from screen 4 (design Q10, Q65, Q66). Both fields are filled and editable.
 * Only a changed value triggers work: a new name is saved on the self member; a new email gets a code at the new
 * address (screen 3b) and replaces the old one only after that code is verified, so the old email keeps working
 * until then.
 */
export function DetailsEditor({ initialName, initialEmail, onDone, onBack }: DetailsEditorProps) {
  const { requestContactChange, verifyContactChange } = useAuth();
  const [savedName, setSavedName] = useState(initialName);
  const [typed, setTyped] = useState({ name: initialName, email: initialEmail });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const submit = async ({ name, email }: { name: string; email: string }) => {
    setError(null);
    setTyped({ name, email });
    setSubmitting(true);
    try {
      let nameNow = savedName;
      if (name !== savedName) {
        const members = await listHouseholdMembers();
        const self = members.find((member) => member.relationship === "self");
        if (self) await updateMemberProfile(self.id, { name });
        setSavedName(name);
        nameNow = name;
      }
      if (!sameEmail(email, initialEmail)) {
        const result = await requestContactChange("email", email);
        setDevOtp(result.otp ?? null);
        setCodeError(null);
        setPendingEmail(email);
        return;
      }
      onDone({ name: nameNow });
    } catch (err) {
      setError(formatAuthErrorMessage(err, "Couldn't save your changes. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingEmail) {
    return (
      <EmailCode
        email={pendingEmail}
        devOtp={devOtp}
        error={codeError}
        submitting={submitting}
        onBack={() => setPendingEmail(null)}
        onEditEmail={() => setPendingEmail(null)}
        onResend={() => {
          setCodeError(null);
          requestContactChange("email", pendingEmail).then(
            (result) => setDevOtp(result.otp ?? null),
            (err) => setCodeError(formatAuthErrorMessage(err, "Couldn't resend the code. Try again.")),
          );
        }}
        onSubmit={(code) => {
          setCodeError(null);
          setSubmitting(true);
          verifyContactChange("email", pendingEmail, code).then(
            () => {
              setSubmitting(false);
              onDone({ name: savedName });
            },
            (err) => {
              setSubmitting(false);
              setCodeError(formatAuthErrorMessage(err, "That code didn't work. Try again."));
            },
          );
        }}
      />
    );
  }

  return (
    <AccountDetails
      initialName={typed.name}
      initialEmail={typed.email}
      emailNote={EMAIL_NOTE}
      error={error}
      submitting={submitting}
      onBack={onBack}
      onSubmit={submit}
    />
  );
}
