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
  status: "placeholder",
  title: "Preferences",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

