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
        "p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-3.5 sm:space-y-4 text-left relative overflow-hidden box-border my-auto w-full",
        className
      )}
    >
      {/* Back Link */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5C5C5C] dark:text-[#A3A3A3] hover:text-[var(--color-ink)] transition-colors cursor-pointer py-1 -ml-1 min-h-[36px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to import options</span>
        </button>
      )}

      {/* Header Section with Supporting Illustration */}
      <div className="flex flex-col items-center justify-center gap-1.5 text-center">
        <div className="flex-shrink-0">
          <OnboardingIllustration variant="cas_upload" className="w-20 h-20 sm:w-24 sm:h-24 mx-auto" />
        </div>

        <div className="w-full text-center">
          <h3 className="font-display font-bold text-[17px] sm:text-[18px] text-[var(--color-ink)] tracking-tight leading-tight">
            Upload your statement
          </h3>
        </div>
      </div>

      {/* Mobile Touch Dropzone: Light, Chic & Integrated */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-3.5 sm:p-4 text-center cursor-pointer transition-all duration-200 select-none min-h-[96px] sm:min-h-[105px] flex items-center justify-center active:scale-[0.99]",
          isDragging
            ? "border-[#22C55E] bg-[#22C55E]/[0.08]"
            : file
            ? "border-[#22C55E] bg-[#22C55E]/[0.04]"
            : "border-[var(--color-border)] bg-black/[0.015] dark:bg-white/[0.02] hover:border-[#22C55E]/50 hover:bg-[#22C55E]/[0.02]"
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
          <div className="flex flex-col items-center justify-center space-y-1.5">
            <div className="h-9 w-9 rounded-xl bg-[#22C55E]/10 text-[#22C55E] flex items-center justify-center shadow-2xs">
              <UploadCloud className="h-4.5 w-4.5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-[var(--color-ink)]">
                Tap to choose a PDF
              </p>
              <p className="text-[11px] text-[#5C5C5C] dark:text-[#A3A3A3]">
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
          className="flex items-center gap-2 p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {/* Password Field */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-1">
          <Label htmlFor="mobile-cas-password" className="text-xs font-semibold text-[var(--color-ink)] font-body">
            PDF Password
          </Label>
        </div>

        <div className="relative flex items-center rounded-xl bg-white/90 dark:bg-[var(--color-surface)] border border-[var(--color-border)] focus-within:border-[#22C55E] focus-within:ring-2 focus-within:ring-[#22C55E]/20 transition-all overflow-hidden h-11 px-3">
          <Lock className="h-4 w-4 text-[#5C5C5C] dark:text-[#A3A3A3] pointer-events-none flex-shrink-0 mr-2" />
          <Input
            id="mobile-cas-password"
            aria-label="PDF Password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter password if protected"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 bg-transparent text-xs sm:text-sm font-medium text-[var(--color-ink)] placeholder:text-[#5C5C5C]/50 dark:placeholder:text-[#A3A3A3]/50 focus:outline-none border-none outline-none ring-0 shadow-none appearance-none caret-[#22C55E] p-0 h-auto"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? "Hide password" : "Show password"}
            className="text-[#5C5C5C] dark:text-[#A3A3A3] hover:text-[var(--color-ink)] p-1 rounded-lg cursor-pointer flex items-center justify-center flex-shrink-0 ml-1"
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
        className="w-full h-13 sm:h-13.5 rounded-full bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white font-bold text-[14px] sm:text-[15px] shadow-lg shadow-[#22C55E]/25 gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[48px] border-none"
      >
        <UploadCloud className="h-4 w-4" />
        <span>{isLoading ? "Parsing Statement..." : "Upload Statement"}</span>
      </Button>
    </form>
  );
}
