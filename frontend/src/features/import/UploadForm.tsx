import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import styles from "./UploadForm.module.css";

interface UploadFormProps {
  onSubmit: (file: File, password: string) => void;
}

export function UploadForm({ onSubmit }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (selected && !selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setFileError("Please choose a PDF file.");
      return;
    }
    setFile(selected);
    setFileError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setFileError("Please choose a PDF file.");
      return;
    }
    onSubmit(file, password);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1>Import your CAS</h1>
      <label className={styles.field}>
        CAS PDF
        <input type="file" accept="application/pdf" onChange={handleFileChange} />
      </label>
      {fileError && <p className={styles.error}>{fileError}</p>}
      <label className={styles.field}>
        PDF password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <button type="submit">Upload</button>
    </form>
  );
}
