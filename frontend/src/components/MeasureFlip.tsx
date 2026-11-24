import { useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import styles from "./MeasureFlip.module.css";

export interface MeasureFlipProps {
  face: "xirr" | "returns";
  onFlip: () => void;
  canFlip: boolean;
  labelXirr: string;
  labelReturns: string;
  children: ReactNode;
  titleExtra?: ReactNode;
  belowTitle?: ReactNode;
}

export function MeasureFlip({
  face,
  onFlip,
  canFlip,
  labelXirr,
  labelReturns,
  children,
  titleExtra,
  belowTitle,
}: MeasureFlipProps) {
  const [animate, setAnimate] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ui-text-muted)]">
          <span data-testid="measure-title">
            {face === "xirr" ? labelXirr : labelReturns}
          </span>
          {titleExtra}
        </div>
        {canFlip && (
          <button
            type="button"
            data-testid="measure-flip"
            data-clickable=""
            data-effect="switch"
            onClick={() => {
              setAnimate(true);
              onFlip();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--ui-divider)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {face === "xirr" ? "Show Returns" : "Show XIRR"}
          </button>
        )}
      </div>
      {belowTitle}
      <div aria-live="polite" className="flex flex-col gap-1">
        <div
          key={face}
          className={`flex flex-col gap-1${animate ? ` ${styles.turn}` : ""}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
