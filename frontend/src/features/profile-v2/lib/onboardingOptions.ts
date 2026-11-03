import type { InvestorType, PrimaryGoal } from "@/features/auth/types";

export interface GoalOption {
  value: PrimaryGoal;
  title: string;
}

export interface InvestorOption {
  value: InvestorType;
  title: string;
  subtitle: string;
}

// The single list for sign-up, the mobile goals screen and Profile. The labels come from the signed-off design.
export const GOAL_OPTIONS: ReadonlyArray<GoalOption> = [
  { value: "wealth_creation", title: "Build my wealth" },
  { value: "retirement", title: "Plan for retirement" },
  { value: "childrens_education", title: "Fund my children's education" },
  { value: "buy_home", title: "Buy a home" },
  { value: "financial_freedom", title: "Achieve financial freedom" },
  { value: "tax_planning", title: "Plan my taxes" },
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
