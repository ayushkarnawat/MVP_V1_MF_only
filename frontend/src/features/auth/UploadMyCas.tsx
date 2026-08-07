import { Button } from "../../components/Button";
import { UploadForm } from "../import/UploadForm";
import styles from "./onboarding.module.css";

interface UploadMyCasProps {
  awaitingUpload: boolean;
  onUploadNow: () => void;
  onUploadLater: () => void;
  onSubmit: (file: File, password: string) => void;
}

export function UploadMyCas({
  awaitingUpload,
  onUploadNow,
  onUploadLater,
  onSubmit,
}: UploadMyCasProps) {
  if (awaitingUpload) {
    return <UploadForm onSubmit={onSubmit} />;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Upload your own CAS statement?</h1>
      <p className={styles.subtitle}>
        You can upload your own personal statement now or proceed directly to batch parse family statements.
      </p>
      <div className={styles.actionsBetween}>
        <Button variant="secondary" size="md" type="button" onClick={onUploadLater}>
          Upload Later
        </Button>
        <Button variant="primary" size="md" type="button" onClick={onUploadNow}>
          Upload Now
        </Button>
      </div>
    </div>
  );
}
