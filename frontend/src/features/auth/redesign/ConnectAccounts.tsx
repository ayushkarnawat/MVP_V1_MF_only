import { useState } from "react";
import type { ReactNode } from "react";
import { BarChart3, Building2, Coins, Gem, Home, Wallet } from "lucide-react";
import { AuthButton } from "./AuthButton";
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

const SOURCE_ICONS: Record<string, ReactNode> = {
  "Mutual funds": <Coins aria-hidden="true" />,
  "Stocks & ETFs": <BarChart3 aria-hidden="true" />,
  "PMS & AIFs": <Building2 aria-hidden="true" />,
  "Real estate": <Home aria-hidden="true" />,
  "Gold": <Gem aria-hidden="true" />,
  "Bank accounts, loans & credit cards": <Wallet aria-hidden="true" />,
};

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
            sketch="cards"
            headline={<>{CONNECT_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{CONNECT_HEADLINE_ACCENT}</span></>}
            paragraph={CONNECT_PARAGRAPH}
            rows={CONNECT_ROWS}
            rowIcons={CONNECT_ROW_ICONS}
          />
        }
        right={
          <div className="flex flex-col gap-[var(--auth-gap)] text-left">
            <div className="flex flex-col gap-[var(--auth-gap-sm)]">
              <h1 className="auth-h1">What would you like to connect first?</h1>
              <p className="auth-sub">You can always add more accounts later.</p>
            </div>
            <div role="radiogroup" aria-label="What would you like to connect first?" className="flex flex-col gap-[var(--auth-gap-sm)]">
              {CONNECT_SOURCES.map((source) => (
                <SourceRow
                  key={source.title}
                  title={source.title}
                  description={source.description}
                  comingSoon={source.comingSoon}
                  selected={selected === source.title}
                  icon={SOURCE_ICONS[source.title]}
                  onSelect={() => setSelected(source.title)}
                />
              ))}
            </div>
            <AuthButton type="button" onClick={onContinue}>
              Continue
            </AuthButton>
          </div>
        }
      />
    </AuthPage>
  );
}
