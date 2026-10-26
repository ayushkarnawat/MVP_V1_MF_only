import { User } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "profile-personal",
  path: "/profile/personal",
  label: "Personal Information",
  icon: User,
  section: null,
  order: 0,
  parentId: "profile",
  layout: "app",
  scope: "none",
  status: "live",
  title: "Personal Information",
  page: () => import("../wrappers/ProfileWrapper"),
};

export default route;

