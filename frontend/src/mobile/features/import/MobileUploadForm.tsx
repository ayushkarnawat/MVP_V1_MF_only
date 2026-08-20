import { useState, useRef } from "react";
import type { ChangeEvent, FormEvent, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImportFileProgressList } from "@/features/import/ImportFileProgressList";
import { OnboardingIllustration } from "@/features/auth/OnboardingIllustration";
import { cn } from "@/lib/utils";
import {
  UploadCloud,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";

export interface MobileUploadFormProps {
  onBack?: () => void;
  onSubmit: (file: File, password: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function MobileUploadForm({
  onBack,
  onSubmit,
  isLoading = false,
  className,
}: MobileUploadFormProps) {
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
      setFileError("File too large. Maximum supported size is 25MB.");
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
      setFileError("Please select a PDF statement to upload.");
      return;
    }
    onSubmit(file, password);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "p-5 sm:p-6 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-md space-y-5 text-left relative overflow-hidden",
        className
      )}
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

      {/* Header Section with Supporting Illustration */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <OnboardingIllustration variant="cas_upload" className="w-14 h-14" />
        </div>

        <div className="space-y-0.5 flex-1 min-w-0">
          <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-[var(--color-accent)] block">
            CAS INGESTION
          </span>
          <h3 className="font-display font-bold text-sm sm:text-base text-[var(--color-ink)]">
            Upload your statement
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Drop in the Detailed CAS PDF you already have.
          </p>
        </div>
      </div>

      {/* Mobile Touch Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-150 select-none min-h-[120px] flex items-center justify-center active:scale-[0.99]",
          isDragging
            ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-surface))]"
            : file
            ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))]"
            : "border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-accent)_2%,var(--color-bg))] hover:border-[var(--color-accent)]/60"
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
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="h-10 w-10 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center shadow-xs">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--color-ink)]">
                Tap to choose a PDF
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Select a Detailed CAS PDF from your device
              </p>
              <div className="flex items-center justify-center gap-1 flex-wrap pt-0.5">
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)]">
                  CAMS
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  Detailed CAS (up to 25MB)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* File Validation Error */}
      {fileError && (
        <div
          role="alert"
          className="flex items-center gap-2 p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {/* Password Field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <Label htmlFor="mobile-cas-password" className="text-xs font-semibold text-[var(--color-ink)]">
            PDF Password
          </Label>
          <span className="text-[10px] text-[var(--color-text-secondary)] flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-[var(--color-accent)]" />
            <span>PAN or DOB</span>
          </span>
        </div>

        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-secondary)] pointer-events-none" />
          <Input
            id="mobile-cas-password"
            aria-label="PDF Password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter password if protected"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-9 pr-9 h-11 text-xs bg-[var(--color-bg)] border-[var(--color-border)] rounded-xl focus-visible:ring-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] p-1.5 rounded-lg cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
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
        disabled={isLoading}
        className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[44px]"
      >
        <UploadCloud className="h-4 w-4" />
        <span>{isLoading ? "Parsing Statement..." : "Upload & Parse Statement"}</span>
      </Button>
    </form>
  );
}
