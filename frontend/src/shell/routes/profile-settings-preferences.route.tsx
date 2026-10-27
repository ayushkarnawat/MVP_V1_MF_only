import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-settings-preferences",
  path: "/profile/settings/preferences",
  label: "Preferences",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile-settings",
  layout: "app",
  scope: "none",
  status: "live",
  title: "Preferences",
  page: () => import("../../features/profile-v2/pages/comingSoonPages").then(m => ({ default: m.PreferencesPage })),
};

export default route;

