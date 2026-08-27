import { useState, useRef } from "react";
import type { ChangeEvent, FormEvent, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImportFileProgressList } from "./ImportFileProgressList";
import { OnboardingIllustration } from "@/features/auth/OnboardingIllustration";
import { cn } from "@/lib/utils";
import {
  UploadCloud,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";

export interface UploadFormProps {
  onBack?: () => void;
  onSubmit: (file: File, password: string) => void;
}

export function UploadForm({ onBack, onSubmit }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
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

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0] ?? null;
    validateAndSetFile(droppedFile);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setFileError("Please select a PDF file to upload.");
      return;
    }
    onSubmit(file, password);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-md space-y-4 sm:space-y-6 w-full max-w-xl mx-auto text-left relative overflow-hidden my-auto box-border"
    >
      {/* Back Link */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer py-1 -ml-1 min-h-[36px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to import options</span>
        </button>
      )}

      {/* Visual Header */}
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        {/* Supporting Hand-Drawn Illustration Visual */}
        <div className="flex-shrink-0">
          <OnboardingIllustration variant="cas_upload" className="w-24 h-24 sm:w-28 sm:h-28 mx-auto" />
        </div>

        <div className="text-center w-full">
          <h1 className="font-display font-bold text-base sm:text-xl text-[var(--color-ink)] tracking-tight">
            Upload your statement
          </h1>
        </div>
      </div>

      {/* Drag & Drop File Upload Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-4 sm:p-6 text-center cursor-pointer transition-all duration-200 select-none min-h-[100px] sm:min-h-[125px] flex items-center justify-center",
          isDragging
            ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-surface))] scale-[1.005] shadow-xs"
            : file
            ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))]"
            : "border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-accent)_2%,var(--color-bg))] hover:border-[var(--color-accent)]/60 hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))]"
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
          <div className="w-full" onClick={(e) => e.stopPropagation()}>
            <ImportFileProgressList
              files={[{ file, status: "done" }]}
              onRemoveFile={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2 sm:space-y-2.5">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center shadow-xs">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-[var(--color-ink)]">
                <span className="sm:hidden">Tap to choose a PDF</span>
                <span className="hidden sm:inline">Click to choose file or drag &amp; drop PDF here</span>
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Select a Detailed CAS PDF from your device
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
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="cas-password-input" className="text-xs font-semibold text-[var(--color-ink)]">
            PDF Password
          </Label>
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
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors p-1.5 rounded-lg cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
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
        className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px]"
      >
        <UploadCloud className="h-4 w-4" />
        <span>Upload Statement</span>
      </Button>
    </form>
  );
}
