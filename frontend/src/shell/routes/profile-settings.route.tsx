import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-settings",
  path: "/profile/settings",
  label: "Settings",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile",
  layout: "app",
  scope: "none",
  status: "live",
  title: "Settings",
  page: () => import("../../features/profile-v2/pages/SettingsPage"),
};

export default route;

