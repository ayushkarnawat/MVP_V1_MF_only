import { TrendingUp } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-equity",
  path: "/portfolio/equity",
  kind: "group",
  label: "Equity",
  icon: TrendingUp,
  section: "portfolio",
  order: 2,
  layout: "app",
  scope: "none",
  status: "live",
  title: "Equity",
  redirectTo: "/portfolio/mutual-funds",
};

export default route;

