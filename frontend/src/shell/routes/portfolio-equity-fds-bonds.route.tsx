import { PiggyBank } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-equity-fds-bonds",
  path: "/portfolio/equity/fds-bonds",
  label: "FDs & bonds",
  icon: PiggyBank,
  section: "portfolio",
  order: 4,
  parentId: "portfolio-equity",
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "FDs & bonds",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

