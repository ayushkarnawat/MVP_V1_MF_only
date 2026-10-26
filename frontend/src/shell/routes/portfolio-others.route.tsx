import { Shapes } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-others",
  path: "/portfolio/others",
  label: "Others",
  icon: Shapes,
  section: "portfolio",
  order: 6,
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Others",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

