import { Home } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "import",
  path: "/import",
  label: "Add data",
  icon: Home,
  section: null,
  order: 0,
  layout: "focus",
  scope: "none",
  status: "placeholder",
  title: "Add data",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

