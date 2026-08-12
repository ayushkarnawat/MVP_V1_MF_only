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

export interface MobileUploadFormProps {
  onSubmit: (file: File, password: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function MobileUploadForm({
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
        "p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4 text-left",
        className
      )}
    >
      {/* Form Title & Subtitle */}
      <div className="space-y-0.5">
        <h3 className="font-display font-bold text-sm sm:text-base text-[var(--color-ink)]">
          Upload CAS Statement
        </h3>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Upload your CAMS or KFintech Detailed PDF statement.
        </p>
      </div>

      {/* Mobile Touch Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-150 select-none min-h-[120px] flex items-center justify-center active:scale-[0.99]",
          isDragging
            ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
            : file
            ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_4%,transparent)]"
            : "border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-accent)]"
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
                <p className="text-xs font-semibold text-[var(--color-ink)] truncate">
                  {file.name}
                </p>
                <p className="text-[10px] text-[var(--color-text-secondary)] tabular-nums">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB • PDF Document
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              title="Remove file"
              className="h-9 w-9 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-surface)] flex items-center justify-center transition-colors cursor-pointer active:scale-90"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-1.5">
            <div className="h-10 w-10 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center shadow-2xs">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-[var(--color-ink)]">
                Tap to choose CAS PDF
              </p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">
                Detailed statement up to 25MB
              </p>
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
        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor="mobile-cas-password"
            className="text-xs font-semibold text-[var(--color-ink)]"
          >
            PDF Password
          </Label>
          <span className="text-[10px] text-[var(--color-text-secondary)]">
            Usually PAN in UPPERCASE
          </span>
        </div>

        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-secondary)] pointer-events-none" />
          <Input
            id="mobile-cas-password"
            aria-label="PDF Password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter PDF password if protected"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10 pr-10 h-11 text-xs bg-[var(--color-bg)] border-[var(--color-border)] rounded-xl focus-visible:ring-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors p-2 rounded-lg cursor-pointer active:scale-90"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Parse File Action Button */}
      <Button
        type="submit"
        disabled={isLoading}
        className="w-full h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs shadow-xs gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[48px]"
      >
        <UploadCloud className="h-4 w-4" />
        <span>{isLoading ? "Processing..." : "Upload & Parse Statement"}</span>
      </Button>
    </form>
  );
}
