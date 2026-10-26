import { Receipt } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "liabilities",
  path: "/liabilities",
  label: "Liabilities",
  icon: Receipt,
  section: "main",
  order: 3,
  layout: "app",
  scope: "none",
  status: "placeholder",
  title: "Liabilities",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

