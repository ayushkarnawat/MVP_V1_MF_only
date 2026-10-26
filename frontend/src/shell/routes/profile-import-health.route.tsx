import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-import-health",
  path: "/profile/import-health",
  label: "Import health",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile",
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Import health",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

