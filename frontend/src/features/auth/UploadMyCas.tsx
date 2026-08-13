import { Button } from "../../components/Button";
import { TwoPathImportContainer } from "../import/TwoPathImportContainer";
import { clearCasResumeStep2 } from "../import/casResumeState";
import styles from "./onboarding.module.css";

interface UploadMyCasProps {
  awaitingUpload: boolean;
  memberId?: string;
  onUploadNow: () => void;
  onUploadLater: () => void;
  onSubmit: (file: File, password: string) => void;
}

export function UploadMyCas({
  awaitingUpload,
  memberId,
  onUploadNow,
  onUploadLater,
  onSubmit,
}: UploadMyCasProps) {
  if (awaitingUpload) {
    // memberId must be the caller-resolved "self" household_member's real
    // UUID, never a placeholder — Step 1 (Request from CAMS) sends it to the
    // backend as-is, and a non-UUID value 400s with "Invalid household_member_id."
    if (!memberId) {
      return null;
    }
    return (
      <div className={styles.importContainer}>
        <TwoPathImportContainer
          memberId={memberId}
          defaultTab="request"
          onUploadSubmit={onSubmit}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Upload your own CAS statement?</h1>
      <p className={styles.subtitle}>
        You can upload your own personal statement now or proceed directly to batch parse family statements.
      </p>
      <div className={styles.actionsBetween}>
        <Button
          variant="secondary"
          size="md"
          type="button"
          onClick={() => {
            clearCasResumeStep2("self");
            onUploadLater();
          }}
        >
          Upload Later
        </Button>
        <Button variant="primary" size="md" type="button" onClick={onUploadNow}>
          Upload Now
        </Button>
      </div>
    </div>
  );
}
