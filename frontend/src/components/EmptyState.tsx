import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn("text-center p-8 max-w-lg mx-auto my-8 border border-[var(--color-border)] shadow-xs bg-[var(--color-surface)]", className)}>
      <CardContent className="flex flex-col items-center justify-center p-0 space-y-4">
        <div className="p-3 bg-[var(--color-bg)] text-[var(--color-accent)] rounded-2xl w-16 h-16 flex items-center justify-center border border-[var(--color-border)] shadow-2xs" aria-hidden="true">
          {icon ?? <TrendingUp className="h-7 w-7 text-[var(--color-accent)]" />}
        </div>
        <h3 className="font-display text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          {title}
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-sm leading-relaxed">
          {description}
        </p>
        {actionLabel && onAction && (
          <div className="pt-2">
            <Button variant="primary" size="md" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
