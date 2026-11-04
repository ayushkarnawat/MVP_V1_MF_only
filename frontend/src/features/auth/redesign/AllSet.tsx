import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthAlert } from "./AuthAlert";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { ALL_SET_FINISH_ERROR, ALL_SET_HEADLINE, ALL_SET_PARAGRAPH, ALL_SET_STATUS } from "./finishCopy";
import { StatusRow } from "./StatusRow";

export interface AllSetProps {
  /** Writes the completion and opens the chosen place. May be async; a rejection shows the retry message. */
  onFinish: (target: "home" | "import-history") => void | Promise<void>;
}

/** Sign-up screen 6. Shown after a real import, before onboarding is marked complete. No timed redirect (design Q18). */
export function AllSet({ onFinish }: AllSetProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const finish = async (target: "home" | "import-history") => {
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

  return (
    <AuthPage>
      <AuthSplitCard
        step={5}
        tone="white"
        done
        left={
          <AuthLeftPanel
            sketch="tick"
            headline={ALL_SET_HEADLINE}
            paragraph={ALL_SET_PARAGRAPH}
            status={ALL_SET_STATUS.map((row) => <StatusRow key={row.label} label={row.label} description={row.description} state={row.state} />)}
          />
        }
        right={
          <div className="space-y-5 text-left">
            <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--auth-step-on)] text-white">
              <Check size={24} />
            </span>
            <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">Getting your accounts ready</h1>
            <section aria-labelledby="all-set-list" className="space-y-3 rounded-2xl border border-[var(--ui-divider)] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 id="all-set-list" className="text-sm font-semibold text-[var(--ui-text)]">Accounts being imported</h2>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finish("import-history")}
                  className="text-xs font-semibold text-[var(--pos-text)] hover:underline disabled:opacity-60"
                >
                  View details ›
                </button>
              </div>
              <ul className="space-y-2">
                <li className="flex items-center gap-3 text-sm">
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--auth-step-on)]/15 text-[var(--auth-step-on)]">
                    <Check size={14} />
                  </span>
                  <span>
                    <strong className="block font-semibold text-[var(--ui-text)]">Mutual Funds</strong>
                    <span className="block text-xs text-[var(--ui-text-muted)]">Imported via CAS statement</span>
                  </span>
                </li>
              </ul>
            </section>
            <section className="rounded-2xl bg-[var(--auth-step-on)]/10 p-4">
              <h2 className="text-sm font-semibold text-[var(--ui-text)]">While we fetch your data...</h2>
              <p className="mt-1 text-xs text-[var(--ui-text-muted)]">We&apos;ll analyse your portfolio, organise everything in one place and prepare personalised insights for you.</p>
            </section>
            {failed ? <AuthAlert tone="error">{ALL_SET_FINISH_ERROR}</AuthAlert> : null}
            <Button type="button" disabled={busy} onClick={() => void finish("home")} className="h-[52px] w-full rounded-full text-[15px] font-bold">
              {busy ? "Opening..." : "Go to my dashboard"}
            </Button>
          </div>
        }
      />
    </AuthPage>
  );
}
