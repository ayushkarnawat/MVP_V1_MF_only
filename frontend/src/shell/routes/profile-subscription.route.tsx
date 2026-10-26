import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-subscription",
  path: "/profile/subscription",
  label: "Subscription & Billing",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile",
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Subscription & Billing",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

