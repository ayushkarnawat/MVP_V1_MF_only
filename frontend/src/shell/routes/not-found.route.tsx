import { CircleHelp } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "not-found",
  path: "*",
  label: "Page not found",
  icon: CircleHelp,
  section: null,
  order: 0,
  layout: "app",
  scope: "none",
  status: "live",
  title: "Page not found",
  page: () => import("../layout/NotFoundPage"),
};

export default route;

