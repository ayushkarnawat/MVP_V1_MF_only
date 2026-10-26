import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-tax",
  path: "/profile/tax",
  label: "Tax Information",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile",
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Tax Information",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

