import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-allocation",
  path: "/portfolio/mutual-funds/allocation",
  label: "Allocation",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "live",
  title: "Allocation",
  page: () => import("../../features/mutual-funds/allocation/AllocationPage"),
};

export default route;

