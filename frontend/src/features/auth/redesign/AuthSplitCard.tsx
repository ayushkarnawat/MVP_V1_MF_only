import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { StepProgress } from "./StepProgress";

export interface AuthSplitCardProps {
  left: ReactNode;
  right: ReactNode;
  /** The step number for the top bar; leave out on screens with no step. */
  step?: number;
  /** The last screen: the bar says Done with every segment full. */
  done?: boolean;
  onBack?: () => void;
  /** The Log in or Sign up link, or the shield line. */
  bottom?: ReactNode;
}

// Two equal panels with 40 px padding. The right panel is three rows: a 56 px top bar that is identical on every
// screen, one 360 px block centred both ways, and a 56 px bottom row. Below 1024 px the panels stack.
export function AuthSplitCard({ left, right, step, done, onBack, bottom }: AuthSplitCardProps) {
  return (
    <div
      data-testid="auth-card"
      className="auth-card mx-auto grid w-full max-w-[1100px] grid-cols-1 overflow-hidden rounded-3xl bg-white lg:grid-cols-2"
      style={{ boxShadow: "var(--auth-card-shadow)" }}
    >
      <div data-testid="auth-left-slot" className="p-10">{left}</div>
      <div data-testid="auth-right" className="grid grid-rows-[3.5rem_1fr_3.5rem] p-10">
        <div data-testid="auth-topbar" className="flex h-14 items-center justify-between">
          <div>
            {onBack ? (
              <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]">
                <ArrowLeft size={16} aria-hidden="true" />
                Back
              </button>
            ) : null}
          </div>
          <div>{step !== undefined ? <StepProgress step={step} done={done} /> : null}</div>
        </div>
        <div data-testid="auth-content" className="flex items-center justify-center">
          <div data-testid="auth-block" className="w-full max-w-[360px]">{right}</div>
        </div>
        <div data-testid="auth-bottom" className="flex h-14 items-center justify-center text-sm">{bottom}</div>
      </div>
    </div>
  );
}
