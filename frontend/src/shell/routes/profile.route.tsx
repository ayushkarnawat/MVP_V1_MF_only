import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile",
  path: "/profile",
  label: "Profile",
  icon: User,
  section: "footer",
  order: 1,
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Profile",
  redirectTo: "/profile/personal",
};

export default route;

