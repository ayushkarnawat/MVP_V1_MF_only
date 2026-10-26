import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-history",
  path: "/portfolio/mutual-funds/history",
  label: "History",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "History",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

