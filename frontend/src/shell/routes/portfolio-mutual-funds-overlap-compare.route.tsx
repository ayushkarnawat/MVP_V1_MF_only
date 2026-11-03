import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-overlap-compare",
  path: "/portfolio/mutual-funds/overlap/compare/:fundA/:fundB",
  label: "Fund comparison",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "live",
  title: "Fund comparison",
  page: () => import("../../features/individual-fund/ComparePage"),
};

export default route;
