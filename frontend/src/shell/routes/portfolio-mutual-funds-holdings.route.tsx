import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-holdings",
  path: "/portfolio/mutual-funds/holdings",
  label: "Holdings",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Holdings",
  page: () => import("../../features/mutual-funds/frame/ComingSoonPages").then(module => ({ default: module.HoldingsComingSoon })),
};

export default route;

