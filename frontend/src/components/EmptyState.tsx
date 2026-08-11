import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: string;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon = "📈",
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn("text-center p-8 max-w-lg mx-auto my-8 border border-[var(--color-border)] shadow-sm bg-[var(--color-surface)]", className)}>
      <CardContent className="flex flex-col items-center justify-center p-0 space-y-4">
        <div className="text-4xl p-3 bg-[var(--color-bg)] rounded-2xl w-16 h-16 flex items-center justify-center border border-[var(--color-border)] shadow-sm" aria-hidden="true">
          {icon}
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
