import { Coins } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-gold",
  path: "/portfolio/gold",
  label: "Gold",
  icon: Coins,
  section: "portfolio",
  order: 4,
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Gold",
  page: () => import("../layout/PlaceholderPage"),
};

export default route;

