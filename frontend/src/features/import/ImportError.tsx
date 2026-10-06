import { Button } from "@/components/ui/button";
import styles from "./ImportError.module.css";

interface ImportErrorProps {
  code: string;
  message: string;
  onUploadAnother: () => void;
  onRequestCas?: () => void;
}
const TITLES: Record<string, string> = {
  scanned_pdf: "We can’t read this PDF",
  damaged_pdf: "This file looks incomplete",
  unknown_issuer: "This isn’t a CAMS or KFintech statement",
  summary_cas: "This is a summary statement",
  demat_cas: "Demat statements aren’t supported yet",
};
const REQUEST_CODES = new Set(["scanned_pdf", "unknown_issuer", "summary_cas", "demat_cas"]);
export function ImportError({ code, message, onUploadAnother, onRequestCas }: ImportErrorProps) {
  return <div className={styles.container}>
    <h1>{TITLES[code] ?? "Import failed"}</h1>
    <p>{message}</p>
    <Button variant="primary" type="button" onClick={onUploadAnother}>Upload a different file</Button>
    {REQUEST_CODES.has(code) && onRequestCas && <Button type="button" variant="outline" onClick={onRequestCas}>Request CAS from CAMS</Button>}
  </div>;
}
