import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-settings-import-history",
  path: "/profile/settings/import-history",
  label: "Import History",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile-settings",
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Import History",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

