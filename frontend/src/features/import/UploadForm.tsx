import { useState, useRef } from "react";
import type { ChangeEvent, FormEvent, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  UploadCloud,
  Lock,
  Eye,
  EyeOff,
  X,
  AlertCircle,
  FileCheck,
} from "lucide-react";

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
    <form
      onSubmit={handleSubmit}
      className="p-5 sm:p-7 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-6 max-w-xl mx-auto"
    >
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-display font-bold text-base sm:text-lg text-[var(--color-ink)]">
          Import your CAS Statement
        </h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Upload your CAMS or KFintech Consolidated Account Statement (Detailed PDF) to import your portfolio.
        </p>
      </div>

      {/* Drag & Drop File Upload Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 select-none min-h-[140px] flex items-center justify-center",
          isDragging
            ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] scale-[1.005]"
            : file
            ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_4%,transparent)]"
            : "border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_3%,transparent)]"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          aria-label="CAS PDF"
          onChange={handleFileChange}
          className="hidden"
        />

        {file ? (
          <div className="flex items-center justify-between gap-3 text-left w-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 shadow-2xs">
                <FileCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[var(--color-ink)] truncate">
                  {file.name}
                </p>
                <p className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB • PDF Document
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              title="Remove file"
              className="h-8 w-8 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-surface)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="h-11 w-11 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center shadow-2xs">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs sm:text-sm font-semibold text-[var(--color-ink)]">
                Click to choose file or drag & drop PDF here
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Supports CAMS &amp; KFintech Detailed CAS statements (up to 25MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* File Validation Error */}
      {fileError && (
        <div
          role="alert"
          className="flex items-center gap-2 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {/* Password Field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label htmlFor="cas-password-input" className="text-xs font-semibold text-[var(--color-ink)]">
            PDF Password
          </Label>
          <span className="text-[11px] text-[var(--color-text-secondary)]">
            Usually your PAN (uppercase) or DOB
          </span>
        </div>

        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-secondary)] pointer-events-none" />
          <Input
            id="cas-password-input"
            aria-label="PDF Password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter PDF password if protected"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pl-10 pr-10 h-11 text-xs sm:text-sm bg-[var(--color-bg)] border-[var(--color-border)] rounded-xl focus-visible:ring-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors p-1.5 rounded-lg cursor-pointer"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all"
      >
        <UploadCloud className="h-4 w-4" />
        <span>Upload &amp; Parse Statement</span>
      </Button>
    </form>
  );
}
