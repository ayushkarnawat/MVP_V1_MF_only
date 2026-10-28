import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-fund-overlap",
  path: "/portfolio/mutual-funds/funds/:schemeId/overlap",
  label: "Fund Overlap",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "live",
  title: "Fund Overlap",
  page: () => import("../../features/individual-fund/OverlapPage"),
};

export default route;

