import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-settings-notifications",
  path: "/profile/settings/notifications",
  label: "Notifications",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile-settings",
  layout: "app",
  scope: "none",
  status: "live",
  title: "Notifications",
  page: () => import("../../features/profile-v2/pages/comingSoonPages").then(m => ({ default: m.NotificationsPage })),
};

export default route;

