import { useState } from "react";
import { useLocation } from "react-router";
import { LogOut } from "lucide-react";
import { AppLink } from "@/shell/nav/AppLink";
import { useAuth } from "@/features/auth/AuthContext";
import { LogoutConfirmDialog } from "@/features/profile/LogoutConfirmDialog";
import { PROFILE_NAV, isNavItemCurrent } from "./lib/profileNav";

const COMMON_LINK_CLASSES =
  "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]";

export function ProfileNav() {
  const location = useLocation();
  const { logout } = useAuth();
  const [confirming, setConfirming] = useState(false);

  return (
    <nav
      aria-label="Profile sections"
      className="sticky top-2 grid gap-0.5 rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-2.5 shadow-sm"
    >
      <ul className="grid gap-0.5">
        {PROFILE_NAV.map((item) => {
          const current = isNavItemCurrent(item, location.pathname);
          const linkMarksCurrent =
            location.pathname.toLowerCase() === item.path.toLowerCase();
          const markLi = current && !linkMarksCurrent;
          const Icon = item.icon;

          const linkClass = current
            ? `${COMMON_LINK_CLASSES} bg-[var(--pos-bg)] font-semibold text-[var(--ui-text)]`
            : `${COMMON_LINK_CLASSES} text-[var(--shell-text-body)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)]`;

          const iconClass = current
            ? "text-[var(--pos-text)]"
            : "text-[var(--ui-text-muted)]";

          return (
            <li key={item.id} aria-current={markLi ? "page" : undefined}>
              <AppLink to={item.path} className={linkClass}>
                <Icon size={19} aria-hidden="true" className={iconClass} />
                <span>{item.label}</span>
              </AppLink>
            </li>
          );
        })}
      </ul>
      <div role="separator" className="mx-1 my-2 h-px bg-[var(--ui-divider)]" />
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`${COMMON_LINK_CLASSES} text-left text-[var(--shell-text-body)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--neg-text)]`}
      >
        <LogOut size={19} aria-hidden="true" className="text-[var(--ui-text-muted)]" />
        <span>Logout</span>
      </button>
      <LogoutConfirmDialog
        isOpen={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          logout();
        }}
      />
    </nav>
  );
}
