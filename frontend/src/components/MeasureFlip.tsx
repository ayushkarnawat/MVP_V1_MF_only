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
    <>
      <div className={styles.head}>
        <div className={styles.titleRow}>
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
            aria-label={face === "xirr" ? "Show Returns" : "Show XIRR"}
            onClick={() => {
              setAnimate(true);
              onFlip();
            }}
            className={styles.flip}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            <span data-testid="flip-label" className={styles.flipLabel}>
              {face === "xirr" ? "Show Returns" : "Show XIRR"}
            </span>
          </button>
        )}
      </div>
      {belowTitle}
      <div aria-live="polite" className={styles.live}>
        <div
          key={face}
          className={
            animate ? `${styles.turnBox} ${styles.turn}` : styles.turnBox
          }
        >
          {children}
        </div>
      </div>
    </>
  );
}
