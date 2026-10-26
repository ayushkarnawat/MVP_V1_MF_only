import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-legacy",
  path: "/profile/legacy",
  label: "Profile (old)",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile",
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Profile (old)",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

