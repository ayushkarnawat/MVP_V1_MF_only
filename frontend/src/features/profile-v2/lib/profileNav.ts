import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  FileText,
  Link2,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { paths } from "@/shell/nav/paths";

export interface ProfileNavChild {
  id: string;
  label: string;
  path: string;
}

export interface ProfileNavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  children?: ReadonlyArray<ProfileNavChild>;
}

export const PROFILE_NAV: ReadonlyArray<ProfileNavItem> = [
  {
    id: "personal",
    label: "Personal Information",
    path: paths.profilePersonal(),
    icon: UserRound,
  },
  {
    id: "family",
    label: "Family Members",
    path: paths.profileFamily(),
    icon: Users,
  },
  {
    id: "connected-accounts",
    label: "Connected Accounts",
    path: paths.profileConnectedAccounts(),
    icon: Link2,
  },
  {
    id: "settings",
    label: "Settings",
    path: paths.profileSettings(),
    icon: Settings,
    children: [
      {
        id: "notifications",
        label: "Notifications",
        path: paths.profileNotifications(),
      },
      {
        id: "preferences",
        label: "Preferences",
        path: paths.profilePreferences(),
      },
      {
        id: "security",
        label: "Security",
        path: paths.profileSecurity(),
      },
      {
        id: "import-history",
        label: "Import History",
        path: paths.profileImportHistory(),
      },
    ],
  },
  {
    id: "subscription",
    label: "Subscription & Billing",
    path: paths.profileSubscription(),
    icon: CreditCard,
  },
  {
    id: "tax",
    label: "Tax Information",
    path: paths.profileTax(),
    icon: FileText,
  },
  {
    id: "data-privacy",
    label: "Data & Privacy",
    path: paths.profileDataPrivacy(),
    icon: ShieldCheck,
  },
];

export function isNavItemCurrent(item: ProfileNavItem, pathname: string): boolean {
  const cleanPathname = pathname.replace(/\/+$/, "").toLowerCase();
  const cleanItemPath = item.path.replace(/\/+$/, "").toLowerCase();
  if (cleanPathname === cleanItemPath) {
    return true;
  }
  if (item.children && item.children.length > 0) {
    if (cleanPathname.startsWith(`${cleanItemPath}/`)) {
      return true;
    }
  }
  return false;
}
