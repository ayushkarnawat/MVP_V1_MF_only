import type { InvestorType } from "../types";

// Copy for sign-up screens 4 to 6 (design slides 11 to 21, 2 and 3 Nov 2026).
export const PROFILE_HEADLINE_BEFORE = "Help us personalise your ";
export const PROFILE_HEADLINE_ACCENT = "experience.";
export const PROFILE_PARAGRAPH = "Tell us a little about how you invest and what you're working towards, so we can make your insights more relevant.";
export const PROFILE_ROWS = [
  { text: "More relevant insights", detail: "Explore insights that relate to your investments and goals." },
  { text: "A tailored experience", detail: "Get a more relevant experience based on your preferences." },
  { text: "You're always in control", detail: "Update your preferences anytime in settings." },
];

// The sign-up wording for the four investor types. Profile and the mobile screens keep the wording in
// profile-v2/lib/onboardingOptions.ts; only desktop sign-up uses this list.
export const INVESTOR_PROFILE_OPTIONS: ReadonlyArray<{ value: InvestorType; title: string; subtitle: string }> = [
  { value: "beginner", title: "I'm just getting started", subtitle: "I'm new to investing or still building my portfolio." },
  { value: "self_directed", title: "I manage my own investments", subtitle: "I choose and manage investments myself." },
  { value: "advisor_assisted", title: "I work with a financial professional", subtitle: "I invest with help from an advisor, distributor or family office." },
  { value: "mixed", title: "A mix of both", subtitle: "I manage some investments myself and get professional guidance for others." },
];

export const CONNECT_HEADLINE_BEFORE = "Bring your investments ";
export const CONNECT_HEADLINE_ACCENT = "together.";
export const CONNECT_PARAGRAPH = "Connect your accounts to see your family's investments in one place and understand how they fit together.";
export const CONNECT_ROWS = [
  { text: "Secure & Private", detail: "Secure connections designed to give you visibility into your investments." },
  { text: "Takes just a few minutes", detail: "Connect multiple accounts in one go." },
  { text: "All major asset types", detail: "Mutual funds, stocks, PMS, real estate, gold and more." },
];
export const CONNECT_SOURCES: ReadonlyArray<{ title: string; description: string; comingSoon: boolean }> = [
  { title: "Mutual funds", description: "Import your holdings via CAMS or MF Central", comingSoon: false },
  { title: "Stocks & ETFs", description: "Connect your demat accounts (NSDL / CDSL)", comingSoon: true },
  { title: "PMS & AIFs", description: "Add your PMS and alternative investments", comingSoon: true },
  { title: "Real estate", description: "Track the value of your properties", comingSoon: true },
  { title: "Gold", description: "Track your digital and physical gold", comingSoon: true },
  { title: "Bank accounts, loans & credit cards", description: "Track your cash, loans and credit cards", comingSoon: true },
];

export const ALL_SET_HEADLINE = "You're all set!";
export const ALL_SET_PARAGRAPH = "We're importing your investment data and getting your dashboard ready. This may take a few minutes.";
export const ALL_SET_STATUS = [
  { label: "Accounts connected", description: "Your account connections have been initiated.", state: "done" as const },
  { label: "Importing your investment data", description: "We're retrieving your holdings from the connected accounts.", state: "done" as const },
  { label: "Preparing your dashboard", description: "Your investments will come together in one view as your data becomes available.", state: "active" as const },
];
export const ALL_SET_FINISH_ERROR = "Your statement is saved, but we couldn't finish setting up your account. Try again.";
