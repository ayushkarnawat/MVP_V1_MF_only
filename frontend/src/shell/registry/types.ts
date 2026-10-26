import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export interface ShellRoute {
  id: string;
  path?: string;
  kind?: "page" | "group";
  label: string;
  modeLabel?: string;
  modeIcon?: LucideIcon;
  icon: LucideIcon;
  section: "main" | "portfolio" | "footer" | null;
  order: number;
  parentId?: string;
  layout: "app" | "focus";
  scope: "family-or-member" | "none";
  status: "live" | "placeholder";
  title: string;
  page?: () => Promise<{ default: ComponentType }>;
  redirectTo?: string;
}
