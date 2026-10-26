import { Home } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "root",
  path: "/",
  label: "Home",
  icon: Home,
  section: null,
  order: 0,
  layout: "app",
  scope: "none",
  status: "live",
  title: "Home",
  redirectTo: "/home",
};

export default route;

