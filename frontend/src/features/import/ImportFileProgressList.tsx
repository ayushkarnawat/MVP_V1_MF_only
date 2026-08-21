import { motion } from "motion/react";
import { FileCheck, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listContainerVariants, listItemVariants } from "@/lib/motion";

export interface FileProgressItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress?: number; // 0 to 100
  errorMessage?: string;
}

export interface ImportFileProgressListProps {
  files: FileProgressItem[];
  onRemoveFile?: (index: number) => void;
  className?: string;
}

export function ImportFileProgressList({
  files,
  onRemoveFile,
  className,
}: ImportFileProgressListProps) {
  if (!files || files.length === 0) return null;

  return (
    <motion.div
      variants={listContainerVariants}
      initial="hidden"
      animate="visible"
      className={cn("w-full space-y-2.5", className)}
    >
      {files.map((item, index) => {
        const sizeMb = (item.file.size / (1024 * 1024)).toFixed(2);

        return (
          <motion.div
            key={`${item.file.name}-${index}`}
            variants={listItemVariants}
            className="w-full p-3 sm:p-3.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col gap-2 text-left transition-colors duration-150"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 transition-transform duration-150">
                  {item.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent)]" />
                  ) : item.status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-[var(--color-negative)]" />
                  ) : (
                    <FileCheck className="h-4 w-4 text-[var(--color-accent)]" />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-[var(--color-ink)] truncate">
                    {item.file.name}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
                    {sizeMb} MB • PDF Document
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {item.status === "done" && (
                  <Badge variant="positive" className="text-[10px] gap-1 px-2 py-0.5 animate-in fade-in zoom-in-95 duration-150">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Ready</span>
                  </Badge>
                )}
                {item.status === "uploading" && (
                  <Badge variant="accent" className="text-[10px] gap-1 px-2 py-0.5 animate-in fade-in duration-150">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Uploading...</span>
                  </Badge>
                )}
                {item.status === "pending" && (
                  <Badge variant="neutral" className="text-[10px] px-2 py-0.5 animate-in fade-in duration-150">
                    Pending
                  </Badge>
                )}
                {item.status === "error" && (
                  <Badge variant="negative" className="text-[10px] gap-1 px-2 py-0.5 animate-in fade-in zoom-in-95 duration-150">
                    <AlertCircle className="h-3 w-3" />
                    <span>Error</span>
                  </Badge>
                )}

                {onRemoveFile && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFile(index);
                    }}
                    title="Remove file"
                    aria-label="Remove file"
                    className="h-8 w-8 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-bg)] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar if progress is specified */}
            {typeof item.progress === "number" && item.status === "uploading" && (
              <div className="w-full bg-[var(--color-border)]/60 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[var(--color-accent)] h-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                />
              </div>
            )}

            {item.errorMessage && (
              <p className="text-[11px] text-[var(--color-negative)] font-medium animate-in fade-in duration-150">
                {item.errorMessage}
              </p>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
