import { Briefcase, Compass, FileText, GraduationCap, Home, Sprout, Sun, TrendingUp, Umbrella, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { InvestorType, PrimaryGoal } from "./types";

export const INVESTOR_TYPE_ICONS: Record<InvestorType, LucideIcon> = {
  beginner: Sprout,
  self_directed: Compass,
  advisor_assisted: Users,
  mixed: Briefcase,
};

export const GOAL_TILE_ICONS: Record<PrimaryGoal, LucideIcon> = {
  wealth_creation: TrendingUp,
  retirement: Umbrella,
  childrens_education: GraduationCap,
  buy_home: Home,
  financial_freedom: Sun,
  tax_planning: FileText,
};
