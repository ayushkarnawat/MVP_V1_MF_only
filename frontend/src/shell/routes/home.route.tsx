import { Home } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "home",
  path: "/home",
  label: "Home",
  icon: Home,
  section: "main",
  order: 1,
  layout: "app",
  scope: "family-or-member",
  status: "live",
  title: "Home",
  page: () => import("../../features/home/HomePage"),
};

export default route;

