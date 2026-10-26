import { CircleHelp } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "help",
  path: "/help",
  label: "Help & Support",
  icon: CircleHelp,
  section: "footer",
  order: 2,
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Help & Support",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

