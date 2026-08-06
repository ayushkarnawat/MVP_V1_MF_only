import { UploadForm } from "../import/UploadForm";
import styles from "./onboarding.module.css";

interface UploadMyCasProps {
  awaitingUpload: boolean;
  onUploadNow: () => void;
  onUploadLater: () => void;
  onSubmit: (file: File, password: string) => void;
}

export function UploadMyCas({ awaitingUpload, onUploadNow, onUploadLater, onSubmit }: UploadMyCasProps) {
  if (awaitingUpload) {
    return <UploadForm onSubmit={onSubmit} />;
  }

  return (
    <div className={styles.container}>
      <h1>Upload your own CAS?</h1>
      <div className={styles.actions}>
        <button type="button" onClick={onUploadNow}>
          Upload Now
        </button>
        <button type="button" onClick={onUploadLater}>
          Upload Later
        </button>
      </div>
    </div>
  );
}
