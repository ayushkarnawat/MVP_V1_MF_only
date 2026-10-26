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
  status: "placeholder",
  title: "Overlap",
  page: () => import("../../features/mutual-funds/frame/ComingSoonPages").then(module => ({ default: module.OverlapComingSoon })),
};

export default route;

