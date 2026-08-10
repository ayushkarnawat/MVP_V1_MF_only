import { useState, useRef } from "react";
import type { ChangeEvent, FormEvent, DragEvent } from "react";
import { Button } from "../../components/Button";
import styles from "./UploadForm.module.css";

interface UploadFormProps {
  onSubmit: (file: File, password: string) => void;
}

export function UploadForm({ onSubmit }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = (selected: File | null) => {
    if (selected && !selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setFileError("Please choose a valid PDF file (.pdf)");
      return;
    }
    if (selected && selected.size > 25 * 1024 * 1024) {
      setFile(null);
      setFileError("This file is too large. Maximum supported file size is 25MB.");
      return;
    }
    setFile(selected);
    setFileError(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    validateAndSetFile(selected);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0] ?? null;
    validateAndSetFile(droppedFile);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setFileError("Please select a PDF file to upload.");
      return;
    }
    onSubmit(file, password);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.header}>
        <h1 className={`type-h1 ${styles.title}`}>Import your CAS Statement</h1>
        <p className={`type-body ${styles.subtitle}`}>
          Upload your CAMS or KFintech Consolidated Account Statement (Detailed PDF) to import your portfolio.
        </p>
      </div>

      {/* Drag and Drop File Upload Box */}
      <div
        className={`${styles.dropZone} ${isDragging ? styles.dragOver : ""} ${
          file ? styles.hasFile : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          aria-label="CAS PDF"
          onChange={handleFileChange}
          className={styles.hiddenFileInput}
        />

        {file ? (
          <div className={styles.fileBadgeContainer}>
            <span className={styles.fileIcon}>📄</span>
            <div className={styles.fileInfo}>
              <span className={`type-body-medium ${styles.fileName}`}>{file.name}</span>
              <span className="type-caption">
                {(file.size / (1024 * 1024)).toFixed(2)} MB • PDF Document
              </span>
            </div>
            <button
              type="button"
              className={styles.removeFileBtn}
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              title="Remove file"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className={styles.dropZonePrompt}>
            <div className={styles.uploadCloudIcon}>📁</div>
            <span className={`type-body-medium ${styles.dropTitle}`}>
              Click to choose file or drag & drop PDF here
            </span>
            <span className="type-caption">
              Supports CAMS & KFintech Detailed CAS PDF statements
            </span>
          </div>
        )}
      </div>

      {fileError && <p className={styles.error}>{fileError}</p>}

      {/* Password Field with Reveal Toggle */}
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label htmlFor="cas-password-input" className="type-body-medium">PDF Password</label>
          <span className="type-caption">Usually your PAN (uppercase) or DOB</span>
        </div>
        <div className={styles.passwordInputWrapper}>
          <input
            id="cas-password-input"
            type={showPassword ? "text" : "password"}
            placeholder="Enter PDF password if protected"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={styles.input}
          />
          <button
            type="button"
            className={styles.togglePasswordBtn}
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="primary" size="lg" type="submit">
          Upload & Parse Statement →
        </Button>
      </div>
    </form>
  );
}
