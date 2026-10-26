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
  status: "placeholder",
  title: "Planning",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

