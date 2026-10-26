import { Building2 } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-real-estate",
  path: "/portfolio/real-estate",
  label: "Real Estate",
  icon: Building2,
  section: "portfolio",
  order: 5,
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Real Estate",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

