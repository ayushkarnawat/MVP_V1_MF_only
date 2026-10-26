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
  status: "placeholder",
  title: "Security",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

