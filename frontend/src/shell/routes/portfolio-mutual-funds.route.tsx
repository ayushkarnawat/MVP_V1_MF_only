import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds",
  path: "/portfolio/mutual-funds",
  label: "Mutual Fund",
  icon: ChartPie,
  section: "portfolio",
  order: 2,
  parentId: "portfolio-equity",
  layout: "app",
  scope: "family-or-member",
  status: "live",
  title: "Mutual Funds",
  page: () => import("../wrappers/DashboardWrapper"),
};

export default route;

