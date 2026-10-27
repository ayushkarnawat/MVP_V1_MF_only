import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-overlap",
  path: "/portfolio/mutual-funds/overlap",
  label: "Overlap",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "live",
  title: "Overlap",
  page: () => import("../../features/mutual-funds/overlap/OverlapPage"),
};

export default route;

