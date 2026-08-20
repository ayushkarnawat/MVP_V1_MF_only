import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getFundScore } from "./api";
import type { FundScoreRow } from "./types";
import { AlertCircle } from "lucide-react";
import { FundScoreCard } from "./FundScoreCard";

export interface FundScoreDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemeId: string | null;
  schemeName?: string;
  initialData?: FundScoreRow | null;
}

export function FundScoreDetailModal({
  isOpen,
  onClose,
  schemeId,
  schemeName,
  initialData = null,
}: FundScoreDetailModalProps) {
  const [data, setData] = useState<FundScoreRow | null>(initialData);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !schemeId) return;

    if (initialData && initialData.scheme_id === schemeId) {
      setData(initialData);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getFundScore(schemeId)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Failed to load fund score details");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, schemeId, initialData]);

  if (!isOpen) return null;

  const displayName = data?.scheme_name || schemeName || "Fund Score Detail";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-6 bg-[var(--color-surface)] border-[var(--color-border)]">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-[var(--color-accent)] border-[var(--color-accent)]/30">
              S20 · Unifolio Fund Score
            </Badge>
            {data?.thin_category && (
              <Badge variant="warning" className="text-[10px]">
                Thin Category
              </Badge>
            )}
          </div>
          <DialogTitle className="font-display text-lg font-bold text-[var(--color-ink)] leading-snug">
            {displayName}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--color-text-secondary)]">
            Comprehensive quality verdict relative to true SEBI category peers
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/5 p-4 text-center space-y-2 my-2">
            <AlertCircle className="h-6 w-6 text-[var(--color-negative)] mx-auto" />
            <p className="text-xs font-bold text-[var(--color-ink)]">Score Load Error</p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">{error}</p>
          </div>
        ) : data ? (
          <FundScoreCard data={data} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
