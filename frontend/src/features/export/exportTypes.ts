import type { MfTabId } from "../../lib/pageSections";

export type ExportStage = "choose" | "preparing" | "ready" | "failed";
export type ExportPreset = "full" | "tab" | "custom";

export interface ExportChoice {
  who: "family" | string;
  sectionIds: string[];
  cover: boolean;
  dataDates: boolean;
  showFolios: boolean;
}

export interface StageRow {
  label: string;
  state: "done" | "now" | "todo";
  note?: string;
}

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: ExportStage;
  members: { id: string; name: string }[];
  currentTab: MfTabId | null;
  defaults: { who: "family" | string; preset: ExportPreset; showFolios: boolean };
  allowedTiers?: ("standard" | "pro")[];
  onStart: (choice: ExportChoice) => void;
  onCancel: () => void;
  onKeepWorking: () => void;
  progress: { subtitle: string; percent: number; rows: StageRow[] };
  ready: { fileName: string; chips: string[] };
  onDownloadAgain: () => void;
  onExportAnother: () => void;
  onDone: () => void;
  failed: { code: string | null; canTryFewer: boolean; canExportMember: boolean };
  onTryAgain: () => void;
  onFewerSections: () => void;
  onPrintInstead: () => void;
  onExportMember: () => void;
  onClose: () => void;
}
