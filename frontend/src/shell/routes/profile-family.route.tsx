import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-family",
  path: "/profile/family",
  label: "Family Members",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile",
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Family Members",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

