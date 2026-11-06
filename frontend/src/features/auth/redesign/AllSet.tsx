import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Check, ChevronRight, Coins, Lightbulb } from "lucide-react";
import { AuthAlert } from "./AuthAlert";
import { AuthButton } from "./AuthButton";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { IconBadge } from "./IconBadge";
import { ALL_SET_FINISH_ERROR, ALL_SET_HEADLINE, ALL_SET_PARAGRAPH, ALL_SET_STATUS } from "./finishCopy";
import { sketchSrc, SKETCH_MOTION } from "./sketches";
import { StatusRow } from "./StatusRow";

export interface AllSetProps {
  /** Writes the completion and opens the chosen place. May be async; a rejection shows the retry message. */
  onFinish: (target: "home") => void | Promise<void>;
  /** Opens the read-only import details over this screen. It never finishes onboarding. */
  onViewDetails: () => void;
}

/** Sign-up screen 6. Shown after a real import, before onboarding is marked complete. No timed redirect (design Q18). */
export function AllSet({ onFinish, onViewDetails }: AllSetProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const finish = async (target: "home") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await onFinish(target);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const tickMotion = SKETCH_MOTION["tick"];
  const tickVars = { "--auth-float-distance": `${tickMotion.distance}px`, "--auth-float-duration": `${tickMotion.duration}s` } as CSSProperties;

  return (
    <AuthPage>
      <AuthSplitCard
        step={5}
        tone="white"
        done
        left={
          <AuthLeftPanel
            sketch="wallet"
            headline={ALL_SET_HEADLINE}
            paragraph={ALL_SET_PARAGRAPH}
            status={ALL_SET_STATUS.map((row) => <StatusRow key={row.label} label={row.label} description={row.description} state={row.state} />)}
          />
        }
        right={
          <div className="flex flex-col gap-[var(--auth-gap)]">
            <img
              src={sketchSrc("tick")}
              alt=""
              data-testid="right-sketch-tick"
              className="auth-sketch mx-auto h-[clamp(72px,14vh,130px)] w-auto"
              data-motion="float"
              style={tickVars}
            />
            <h1 className="auth-h1 text-center">Getting your accounts ready</h1>
            <section aria-labelledby="all-set-list" className="rounded-2xl border border-[var(--auth-hairline)] bg-white p-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <h2 id="all-set-list" className="text-[15px] font-semibold text-[var(--auth-ink)]">Accounts being imported</h2>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onViewDetails}
                  aria-label="View details ›"
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--auth-green-ink)] hover:underline disabled:opacity-60"
                >
                  <span>View details</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
              <ul className="mt-3 space-y-2">
                <li className="flex items-center gap-3.5 rounded-xl border border-[var(--auth-hairline)] bg-white p-3 text-left">
                  <IconBadge icon={<Coins aria-hidden="true" />} tone="strong" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[15px] font-semibold text-[var(--auth-ink)]">Mutual Funds</strong>
                    <span className="block text-[13px] text-[var(--auth-muted)]">Imported via CAS statement</span>
                  </span>
                  <Check size={18} aria-hidden="true" className="shrink-0 text-[var(--auth-green)]" />
                </li>
              </ul>
            </section>
            <section className="flex items-start gap-3.5 rounded-2xl bg-[#F6F7F9] p-4 text-left">
              <IconBadge icon={<Lightbulb aria-hidden="true" />} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-[var(--auth-ink)]">While we fetch your data...</h2>
                <p className="mt-1 text-[13px] text-[var(--auth-muted)]">
                  We&apos;ll analyse your portfolio, organise everything in one place and prepare personalised insights for you.
                </p>
              </div>
            </section>
            {failed ? <AuthAlert tone="error">{ALL_SET_FINISH_ERROR}</AuthAlert> : null}
            <AuthButton type="button" disabled={busy} onClick={() => void finish("home")}>
              {busy ? "Opening..." : "Go to my dashboard"}
            </AuthButton>
          </div>
        }
      />
    </AuthPage>
  );
}
