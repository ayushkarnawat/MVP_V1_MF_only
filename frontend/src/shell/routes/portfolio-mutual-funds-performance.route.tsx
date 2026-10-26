import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-performance",
  path: "/portfolio/mutual-funds/performance",
  label: "Performance",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Performance",
  page: () => import("../../features/mutual-funds/performance/PerformancePage"),
};

export default route;

