import { useState } from "react";
import { UploadForm } from "../import/UploadForm";
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
      <UploadForm
        onSubmit={(file, password) => {
          if (member) {
            onQueueUpload({ memberId: member.id, memberName: member.name, file, password });
          }
          setActiveMemberId(null);
        }}
      />
    );
  }

  return (
    <div className={styles.container}>
      <h1>Family CAS Upload</h1>
      {members.map((member) => (
        <div key={member.id} className={styles.field}>
          <span>{member.name}</span>
          <Badge variant={isUploaded(member.id) ? "positive" : "neutral"}>
            {isUploaded(member.id) ? "Uploaded" : "Not Uploaded"}
          </Badge>
          {!isUploaded(member.id) && (
            <div className={styles.actions}>
              <button type="button" onClick={() => setActiveMemberId(member.id)}>
                {`Upload CAS for ${member.name}`}
              </button>
              <button type="button" onClick={() => onSkip(member.id)}>
                {`Skip for now — ${member.name}`}
              </button>
            </div>
          )}
        </div>
      ))}
      <button type="button" disabled={!allHandled} onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
