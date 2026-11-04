import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { CONNECT_ROW_ICONS } from "./authRowIcons";
import { CONNECT_HEADLINE_ACCENT, CONNECT_HEADLINE_BEFORE, CONNECT_PARAGRAPH, CONNECT_ROWS, CONNECT_SOURCES } from "./finishCopy";
import { SourceRow } from "./SourceRow";

export interface ConnectAccountsProps {
  /** Continue on Mutual funds: today's statement import screens follow. */
  onContinue: () => void;
  /** Back to screen 4, with the answers filled. */
  onBack: () => void;
}

/** Sign-up screen 5. Only Mutual funds works today; the others are drawn as Coming soon. There is no skip (design Q16). */
export function ConnectAccounts({ onContinue, onBack }: ConnectAccountsProps) {
  const [selected, setSelected] = useState("Mutual funds");
  return (
    <AuthPage>
      <AuthSplitCard
        step={5}
        tone="white"
        onBack={onBack}
        left={
          <AuthLeftPanel
            sketch="wallet"
            headline={<>{CONNECT_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{CONNECT_HEADLINE_ACCENT}</span></>}
            paragraph={CONNECT_PARAGRAPH}
            rows={CONNECT_ROWS}
            rowIcons={CONNECT_ROW_ICONS}
          />
        }
        right={
          <div className="space-y-5 text-left">
            <div className="space-y-2">
              <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">What would you like to connect first?</h1>
              <p className="text-sm text-[var(--ui-text-muted)]">You can always add more accounts later.</p>
            </div>
            <div role="radiogroup" aria-label="What would you like to connect first?" className="space-y-2">
              {CONNECT_SOURCES.map((source) => (
                <SourceRow
                  key={source.title}
                  title={source.title}
                  description={source.description}
                  comingSoon={source.comingSoon}
                  selected={selected === source.title}
                  onSelect={() => setSelected(source.title)}
                />
              ))}
            </div>
            <Button type="button" onClick={onContinue} className="h-[52px] w-full rounded-full text-[15px] font-bold">
              Continue
            </Button>
          </div>
        }
      />
    </AuthPage>
  );
}
