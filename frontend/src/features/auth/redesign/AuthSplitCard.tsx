import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { AuthLayoutContext, type AuthLayout } from "./authLayout";
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
  /** A hairline above the bottom row (sign-up 1 and the log-in screens draw it; sign-up 3 does not). */
  bottomRule?: boolean;
  /** "wide" puts the sketch beside the text (sign-up 1, log-in 1); "stacked" puts it above. */
  layout?: AuthLayout;
  /** "mint" is the very light green panel; "white" is a white panel with a short hairline on its right edge. */
  tone?: "mint" | "white";
}

const COLUMNS: Record<AuthLayout, string> = {
  wide: "lg:grid-cols-[1.5fr_1fr]",
  stacked: "lg:grid-cols-[0.95fr_1fr]",
};

// A card as tall as the window allows (the --auth-card-h budget in auth-tokens.css), so a whole screen fits one window
// on any desktop. The right panel is three rows: a top bar that is identical on every screen, one block centred both
// ways, and an optional bottom row. Below 1024 px the panels stack and the page may scroll.
export function AuthSplitCard({ left, right, step, done, onBack, bottom, bottomRule = true, layout = "stacked", tone = "mint" }: AuthSplitCardProps) {
  return (
    <AuthLayoutContext.Provider value={layout}>
      <div
        data-testid="auth-card"
        data-layout={layout}
        data-tone={tone}
        className={`auth-card mx-auto grid w-full max-w-[var(--auth-card-w)] grid-cols-1 overflow-hidden rounded-[28px] bg-white lg:h-[var(--auth-card-h)] lg:min-h-[520px] ${COLUMNS[layout]}`}
        style={{ boxShadow: "var(--auth-card-shadow)" }}
      >
        <div
          data-testid="auth-left-slot"
          className={`order-2 min-h-0 lg:order-1 ${tone === "mint" ? "auth-left-mint" : "auth-left-white"}`}
          style={{ padding: "var(--auth-pad-y) 40px" }}
        >
          {left}
        </div>
        <div data-testid="auth-right" className="order-1 flex min-h-0 flex-col lg:order-2" style={{ padding: "var(--auth-pad-y) var(--auth-pad-x)" }}>
          <div data-testid="auth-topbar" className="flex h-10 shrink-0 items-center justify-between">
            <div>
              {onBack ? (
                <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-[var(--auth-muted)] hover:text-[var(--auth-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-green)]">
                  <ArrowLeft size={17} aria-hidden="true" />
                  Back
                </button>
              ) : null}
            </div>
            <div>{step !== undefined ? <StepProgress step={step} done={done} /> : null}</div>
          </div>
          <div data-testid="auth-content" className="flex min-h-0 flex-1 overflow-y-auto">
            <div data-testid="auth-block" className="m-auto w-full max-w-[440px] py-2">{right}</div>
          </div>
          {bottom ? (
            <div
              data-testid="auth-bottom"
              className={`mx-auto w-full max-w-[440px] shrink-0 pt-4 text-center text-sm ${bottomRule ? "border-t border-[var(--auth-hairline)]" : ""}`}
            >
              {bottom}
            </div>
          ) : null}
        </div>
      </div>
    </AuthLayoutContext.Provider>
  );
}
