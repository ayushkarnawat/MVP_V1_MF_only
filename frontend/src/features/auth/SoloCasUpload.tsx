import { useEffect, useState } from "react";
import { ImportFlow } from "../import/ImportFlow";
import { useAuth } from "./AuthContext";
import { createHouseholdMember, listHouseholdMembers } from "./api";
import styles from "./onboarding.module.css";

interface SoloCasUploadProps {
  name: string;
}

export function SoloCasUpload({ name }: SoloCasUploadProps) {
  const { updateMe } = useAuth();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveSelfMember() {
      try {
        // List-then-create: there's no PATCH /household-members, so a reload
        // mid-onboarding must reuse the existing "self" row, not duplicate it.
        const existing = await listHouseholdMembers();
        const self = existing.find((member) => member.relationship === "self");
        const member = self ?? (await createHouseholdMember(name.trim() || "Me", "self"));
        if (!cancelled) {
          setMemberId(member.id);
        }
      } catch {
        if (!cancelled) {
          setError("Couldn't set up your profile. Please try again.");
        }
      }
    }

    void resolveSelfMember();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const handleDone = async () => {
    await updateMe({ onboarding_completed: true });
  };

  if (error) {
    return (
      <p role="alert" className={styles.error}>
        {error}
      </p>
    );
  }
  if (!memberId) {
    return <p>Setting up your profile...</p>;
  }

  return <ImportFlow householdMemberId={memberId} ctaLabel="Continue" onDone={handleDone} />;
}
