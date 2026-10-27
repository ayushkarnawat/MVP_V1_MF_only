import { Wrench } from "lucide-react";
import { useDevToolsEnabled } from "@/features/dev/useDevToolsEnabled";
import { paths } from "@/shell/nav/paths";
import { useAppNavigate } from "@/shell/nav/useAppNavigate";
import { ProfileFrame } from "../ProfileFrame";
import { SettingsRows } from "../components/SettingsRows";

export default function SettingsPage() {
  const devToolsEnabled = useDevToolsEnabled();
  const navigate = useAppNavigate();

  return (
    <ProfileFrame>
      <section className="rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 shadow-sm">
        <h2 className="font-heading text-lg font-semibold text-[var(--ui-text)]">
          Settings
        </h2>
        <p className="mt-1 text-sm text-[var(--shell-text-body)]">
          Manage how Unifolio works for you.
        </p>

        <SettingsRows />

        {devToolsEnabled ? (
          <button
            type="button"
            onClick={() => {
              // Passing state { from: "profile" } allows Import health's Back link to pop straight back here
              void navigate(paths.importHealth(), {
                state: { from: "profile" },
              });
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--ui-disabled-border)] px-3 py-2 text-sm font-medium text-[var(--ui-text-muted)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <Wrench size={15} aria-hidden="true" />
            Import health (staging)
          </button>
        ) : null}
      </section>
    </ProfileFrame>
  );
}
