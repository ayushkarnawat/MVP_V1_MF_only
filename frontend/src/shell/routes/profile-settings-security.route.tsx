import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-settings-security",
  path: "/profile/settings/security",
  label: "Security",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile-settings",
  layout: "app",
  scope: "none",
  status: "live",
  title: "Security",
  page: () => import("../../features/profile-v2/pages/comingSoonPages").then(m => ({ default: m.SecurityPage })),
};

export default route;

