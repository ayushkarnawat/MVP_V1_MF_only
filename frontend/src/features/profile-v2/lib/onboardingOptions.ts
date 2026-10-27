import type { InvestorType, PrimaryGoal } from "@/features/auth/types";

export interface GoalOption {
  value: PrimaryGoal;
  title: string;
  subtitle: string;
}

export interface InvestorOption {
  value: InvestorType;
  title: string;
  subtitle: string;
}

export const GOAL_OPTIONS: ReadonlyArray<GoalOption> = [
  {
    value: "consolidated_view",
    title: "Consolidated portfolio view",
    subtitle: "See all my mutual funds across every broker and fund house in one place",
  },
  {
    value: "understand_holdings",
    title: "Understand true performance",
    subtitle: "See your true returns after fees, taxes and plan type",
  },
  {
    value: "family_management",
    title: "Family wealth tracking",
    subtitle: "Managing investments for family members under one dashboard",
  },
  {
    value: "performance_comparison",
    title: "Compare distributor fees",
    subtitle: "Compare returns and costs across different distributors",
  },
];

export const INVESTOR_OPTIONS: ReadonlyArray<InvestorOption> = [
  {
    value: "self_directed",
    title: "Mostly on my own",
    subtitle: "Direct SIPs, mutual funds, maybe some stocks",
  },
  {
    value: "advisor_assisted",
    title: "Through an advisor or distributor",
    subtitle: "Distributor, bank advisor or family office, alongside my own tracking",
  },
  {
    value: "mixed",
    title: "A mix of both",
    subtitle: "A bit of self-directed investing and a bit through an advisor",
  },
  {
    value: "beginner",
    title: "Just getting started",
    subtitle: "Haven't invested much yet, building my portfolio",
  },
];

export function humanizeCode(code: string): string {
  const trimmed = code.replace(/_+/g, " ").trim();
  if (!trimmed) {
    return "";
  }
  const chars = [...trimmed];
  chars[0] = chars[0].toUpperCase();
  return chars.join("");
}
