import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-data-privacy",
  path: "/profile/data-privacy",
  label: "Data & Privacy",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile",
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Data & Privacy",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

