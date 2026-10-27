import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-fund",
  path: "/portfolio/mutual-funds/funds/:schemeId",
  label: "Fund Overview",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Fund Overview",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

