import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-analytics",
  path: "/portfolio/mutual-funds/analytics",
  label: "Other Analytics",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Other Analytics",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

