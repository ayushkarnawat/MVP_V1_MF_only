import { useState } from "react";
import { TwoPathImportContainer } from "../import/TwoPathImportContainer";
import { clearCasResumeStep2 } from "../import/casResumeState";
import { Badge } from "../../components/Badge";
import styles from "./onboarding.module.css";
import type { HouseholdMember } from "./types";

export interface FamilyUpload {
  memberId: string;
  memberName: string;
  file: File;
  password: string;
}

interface FamilyCasUploadProps {
  members: HouseholdMember[];
  queue: FamilyUpload[];
  onQueueUpload: (upload: FamilyUpload) => void;
  onSkip: (memberId: string) => void;
  skipped: Set<string>;
  onContinue: () => void;
}

export function FamilyCasUpload({ members, queue, onQueueUpload, onSkip, skipped, onContinue }: FamilyCasUploadProps) {
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);

  const isUploaded = (memberId: string) => queue.some((item) => item.memberId === memberId);
  const allHandled = members.every((member) => isUploaded(member.id) || skipped.has(member.id));

  if (activeMemberId) {
    const member = members.find((m) => m.id === activeMemberId);
    return (
      <div className={styles.importContainer}>
        <button
          type="button"
          onClick={() => {
            clearCasResumeStep2(activeMemberId);
            setActiveMemberId(null);
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-primary, #2563eb)",
            cursor: "pointer",
            textAlign: "left",
            padding: 0,
            fontSize: "var(--type-body-size)",
            marginBottom: "var(--space-2)",
            fontWeight: 500,
          }}
        >
          ← Back to Family List
        </button>
        <h2 className="type-h2" style={{ margin: "0 0 var(--space-4) 0" }}>
          {member ? `Import Statement for ${member.name}` : "Import Statement"}
        </h2>
        <TwoPathImportContainer
          memberId={activeMemberId}
          defaultTab="request"
          onUploadSubmit={(file, password) => {
            if (member) {
              onQueueUpload({ memberId: member.id, memberName: member.name, file, password });
            }
            setActiveMemberId(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Family CAS Upload</h1>
      <p className={styles.subtitle}>
        Upload mutual fund statements for each member in your household.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {members.map((member) => (
          <div key={member.id} className={styles.memberCard}>
            <div className={styles.memberInfo}>
              <span className={styles.memberName}>{member.name}</span>
              <Badge variant={isUploaded(member.id) ? "positive" : "neutral"}>
                {isUploaded(member.id) ? "Uploaded" : "Not Uploaded"}
              </Badge>
            </div>
            {!isUploaded(member.id) && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.uploadBtn}
                  onClick={() => setActiveMemberId(member.id)}
                >
                  {`Upload CAS for ${member.name}`}
                </button>
                <button
                  type="button"
                  className={styles.skipBtn}
                  onClick={() => onSkip(member.id)}
                >
                  {`Skip for now — ${member.name}`}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className={styles.continueBtn}
        disabled={!allHandled}
        onClick={onContinue}
      >
        Continue
      </button>
    </div>
  );
}

