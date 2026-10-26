import { ChartCandlestick } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-equity-direct-stocks",
  path: "/portfolio/equity/direct-stocks",
  label: "Direct Stocks",
  icon: ChartCandlestick,
  section: "portfolio",
  order: 1,
  parentId: "portfolio-equity",
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Direct Stocks",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

