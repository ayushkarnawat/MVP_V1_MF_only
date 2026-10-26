import { Briefcase, LayoutGrid } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio",
  path: "/portfolio",
  label: "Portfolio",
  modeLabel: "Investments",
  modeIcon: LayoutGrid,
  icon: Briefcase,
  section: "main",
  order: 2,
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Portfolio",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

