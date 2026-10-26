import { Landmark } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-debt",
  path: "/portfolio/debt",
  label: "Debt",
  icon: Landmark,
  section: "portfolio",
  order: 3,
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Debt",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

