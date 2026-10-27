import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-fund-insights",
  path: "/portfolio/mutual-funds/funds/:schemeId/insights",
  label: "Fund Insights",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "live",
  title: "Fund Insights",
  page: () => import("../../features/individual-fund/InsightsPage"),
};

export default route;

