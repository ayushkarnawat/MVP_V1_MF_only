import { Target } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "planning",
  path: "/planning",
  label: "Planning",
  icon: Target,
  section: "main",
  order: 4,
  layout: "app",
  scope: "none",
  status: "live",
  title: "Planning",
  page: () => import("../../features/planning/PlanningPage"),
};

export default route;

