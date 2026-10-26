import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Banknote,
  Bell,
  Building2,
  ChartCandlestick,
  Clock,
  Coins,
  FileText,
  Landmark,
  Link2,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";

export type ComingSoonVariant =
  | "connected-accounts"
  | "notifications"
  | "preferences"
  | "security"
  | "tax"
  | "financial-details";

interface VariantConfig {
  heading: string;
  line: string;
  icon: LucideIcon;
  backToSettings?: boolean;
}

const VARIANTS: Record<ComingSoonVariant, VariantConfig> = {
  "connected-accounts": {
    heading: "Connected Accounts",
    line: "Connected accounts are coming. Today you add mutual fund data by importing a statement.",
    icon: Link2,
  },
  notifications: {
    heading: "Notifications",
    line: "Notification settings are coming. Today Unifolio only emails you the code you sign in with.",
    icon: Bell,
    backToSettings: true,
  },
  preferences: {
    heading: "Preferences",
    line: "Display and other preferences are coming. You can switch between light and dark mode from the top bar.",
    icon: SlidersHorizontal,
    backToSettings: true,
  },
  security: {
    heading: "Security",
    line: "Security settings are coming. You sign in with a one-time code or your Google account, so there is no password to manage.",
    icon: ShieldCheck,
    backToSettings: true,
  },
  tax: {
    heading: "Tax Information",
    line: "Tax information is coming.",
    icon: FileText,
  },
  "financial-details": {
    heading: "Financial Details",
    line: "Financial details are coming.",
    icon: Landmark,
  },
};

interface PlannedAccount {
  label: string;
  icon: LucideIcon;
}

const PLANNED_ACCOUNTS: ReadonlyArray<PlannedAccount> = [
  { label: "Bank accounts", icon: Landmark },
  { label: "Stocks & ETFs", icon: TrendingUp },
  { label: "Fixed deposits & bonds", icon: Banknote },
  { label: "Gold", icon: Coins },
  { label: "US stocks", icon: ChartCandlestick },
  { label: "Real estate", icon: Building2 },
];

export function ComingSoonPage({ variant }: { variant: ComingSoonVariant }) {
  const config = VARIANTS[variant];
  const Icon = config.icon;

  return (
    <div className="space-y-4">
      {config.backToSettings && (
        <AppLink
          to={paths.profileSettings()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--shell-text-body)] hover:text-[var(--ui-text)]"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Settings
        </AppLink>
      )}
      <section
        data-testid="coming-soon"
        data-variant={variant}
        className="grid justify-items-center gap-2.5 rounded-[14px] border border-dashed border-[var(--ui-disabled-border)] bg-[var(--ui-elevated)] px-5 py-10 text-center"
      >
        <span className="grid h-[60px] w-[60px] place-items-center rounded-2xl bg-[var(--ui-card)] text-[var(--ui-text-muted)]">
          <Icon size={28} aria-hidden="true" />
        </span>
        <h2 className="font-heading text-lg font-semibold text-[var(--ui-text)]">
          {config.heading}
        </h2>
        <span
          data-testid="coming-soon-tag"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ui-divider)] bg-[var(--ui-card)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--ui-text-muted)]"
        >
          <Clock size={12} aria-hidden="true" />
          Coming soon
        </span>
        <p className="max-w-[50ch] text-sm text-[var(--shell-text-body)]">
          {config.line}
        </p>

        {variant === "connected-accounts" && (
          <>
            <p className="mt-2 text-xs text-[var(--ui-text-muted)]">
              What we plan to connect
            </p>
            <ul
              aria-label="Planned accounts"
              className="grid w-full max-w-[420px] gap-2"
            >
              {PLANNED_ACCOUNTS.map((account) => {
                const AccountIcon = account.icon;
                return (
                  <li
                    key={account.label}
                    data-status="planned"
                    className="flex items-center gap-3 rounded-xl border border-[var(--ui-divider)] px-3 py-2 text-left text-sm opacity-60"
                  >
                    <AccountIcon size={18} aria-hidden="true" />
                    <span className="flex-1 font-medium text-[var(--ui-text)]">
                      {account.label}
                    </span>
                    <span className="rounded-full border border-[var(--ui-divider)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ui-text-muted)]">
                      Coming soon
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
