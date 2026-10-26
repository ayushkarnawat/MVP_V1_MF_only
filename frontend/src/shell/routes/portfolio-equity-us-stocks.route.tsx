import { Globe } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-equity-us-stocks",
  path: "/portfolio/equity/us-stocks",
  label: "US Stock",
  icon: Globe,
  section: "portfolio",
  order: 3,
  parentId: "portfolio-equity",
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "US Stock",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

