export type ResultKind =
  | "fund"
  | "category"
  | "manager"
  | "member"
  | "sip"
  | "transactions"
  | "stocks"
  | "page";

export type ResultAction =
  | { type: "jump-fund"; schemeId: string; switchTo: { memberIds: string[]; label: string } | null } // null = already in scope
  | { type: "filter"; chip: { kind: "category" | "member" | "period"; value: string } }
  | { type: "go"; path: string; sectionId?: string; text?: string } // a move to another page / section / hand-off with text
  | { type: "switch-member"; memberId: string; label: string }
  | { type: "none" }; // greyed "Coming soon"

export interface ResultRow {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  tag?: string;
  action: ResultAction;
  disabled?: boolean;
}

export interface ResultGroup {
  kind: ResultKind;
  label: string;
  rows: ResultRow[];
  total: number;
} // rows = the shown rows (capped), total = all matches

export interface PageFilterSource {
  pageKey: string;
  noun: string;
  total: number;
  matched: number;
  chipsAllowed: Array<"period" | "member" | "category">;
  extraResults?: ResultRow[];
}

export interface SectionEntry {
  id: string;
  title: string;
  path: string;
  tabLabel: string;
  built: boolean;
} // from F's list; `built: false` renders "Coming soon"

export interface Recents {
  funds: string[];
  searches: string[];
} // fund ids (newest first), last typed searches (newest first, at most 5)

export interface SearchScope {
  memberIds: string[] | "family";
} // who the page is showing now
