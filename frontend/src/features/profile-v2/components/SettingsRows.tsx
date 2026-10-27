import {
  Bell,
  ChevronRight,
  History,
  Lock,
  type LucideIcon,
  SlidersHorizontal,
} from "lucide-react";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";

interface SettingsRowItem {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
  tag: string;
}

const SETTINGS_ROWS: ReadonlyArray<SettingsRowItem> = [
  {
    id: "notifications",
    title: "Notifications",
    description: "Manage how Unifolio contacts you",
    path: paths.profileNotifications(),
    icon: Bell,
    tag: "Coming soon",
  },
  {
    id: "preferences",
    title: "Preferences",
    description: "Display and other preferences",
    path: paths.profilePreferences(),
    icon: SlidersHorizontal,
    tag: "Coming soon",
  },
  {
    id: "security",
    title: "Security",
    description: "Sign-in and account security",
    path: paths.profileSecurity(),
    icon: Lock,
    tag: "Coming soon",
  },
  {
    id: "import-history",
    title: "Import History",
    description: "See the statements you imported, and delete one",
    path: paths.profileImportHistory(),
    icon: History,
    tag: "Live",
  },
];

export function SettingsRows() {
  return (
    <ul
      aria-label="Settings sections"
      className="mt-4 divide-y divide-[var(--ui-divider)]"
    >
      {SETTINGS_ROWS.map(row => {
        const Icon = row.icon;
        return (
          <li key={row.id} data-row={row.id}>
            <AppLink
              to={row.path}
              className="flex items-center gap-3 rounded-lg px-1 py-3 hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--ui-card)] text-[var(--ui-text-muted)]">
                <Icon size={19} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    data-testid="settings-row-title"
                    className="text-sm font-semibold text-[var(--ui-text)]"
                  >
                    {row.title}
                  </span>
                  <span
                    data-testid="settings-row-tag"
                    className="rounded-full border border-[var(--ui-divider)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ui-text-muted)]"
                  >
                    {row.tag}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-[var(--shell-text-body)]">
                  {row.description}
                </span>
              </span>
              <ChevronRight
                size={18}
                aria-hidden="true"
                className="shrink-0 text-[var(--ui-text-muted)]"
              />
            </AppLink>
          </li>
        );
      })}
    </ul>
  );
}
