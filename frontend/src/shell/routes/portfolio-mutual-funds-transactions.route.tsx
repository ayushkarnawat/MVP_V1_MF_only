import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-transactions",
  path: "/portfolio/mutual-funds/transactions",
  label: "Transactions",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "placeholder",
  title: "Transactions",
  page: () => import("../../features/mutual-funds/frame/ComingSoonPages").then(module => ({ default: module.TransactionsComingSoon })),
};

export default route;

