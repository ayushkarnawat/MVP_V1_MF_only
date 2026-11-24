import { usePrintSettled } from "./usePrintSettled";

export function PrintPlaceholder({ id, title }: { id: string; title: string }) {
  usePrintSettled(id, true);
  return <><h3>{title}</h3><p>This section is not in the PDF yet.</p></>;
}
