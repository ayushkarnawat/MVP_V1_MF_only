import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-connected-accounts",
  path: "/profile/connected-accounts",
  label: "Connected Accounts",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile",
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Connected Accounts",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

