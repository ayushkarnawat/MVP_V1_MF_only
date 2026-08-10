import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { postOpeningBalance } from "./api";
import type { CoverageGapItem } from "./types";

interface OpeningBalanceModalProps {
  isOpen: boolean;
  gap: CoverageGapItem | null;
  onClose: () => void;
  onResolved: () => void;
}

export function OpeningBalanceModal({
  isOpen,
  gap,
  onClose,
  onResolved,
}: OpeningBalanceModalProps) {
  const [units, setUnits] = useState(gap ? gap.deficit_units : "");
  const [date, setDate] = useState(gap ? gap.first_deficit_date : "");
  const [amount, setAmount] = useState("");
  const [nav, setNav] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!gap) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!units || !date) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await postOpeningBalance(gap.folio_id, {
        units,
        date,
        amount: amount ? amount : undefined,
        nav: nav ? nav : undefined,
      });
      onResolved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record opening balance.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Opening Balance">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ background: "var(--color-surface-sunken)", padding: "var(--space-3)", borderRadius: "var(--radius-md)" }}>
          <div className="type-body-medium" style={{ color: "var(--color-text-primary)" }}>
            {gap.scheme_name}
          </div>
          <div className="type-caption" style={{ color: "var(--color-text-secondary)" }}>
            Folio: {gap.folio_number} • <span style={{ color: "var(--color-negative)", fontWeight: 600 }}>{gap.deficit_units} units missing</span> before {gap.first_deficit_date}
          </div>
        </div>

        <p className="type-body" style={{ color: "var(--color-text-secondary)", margin: 0 }}>
          Your uploaded statement includes redemptions with no recorded prior purchase. Provide an opening balance as of a date prior to the redemption to balance your portfolio ledger.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <label htmlFor="opening-units" className="type-caption" style={{ color: "var(--color-text-muted)" }}>
              Opening Units *
            </label>
            <input
              id="opening-units"
              type="number"
              step="0.001"
              required
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="e.g. 50.000"
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <label htmlFor="opening-date" className="type-caption" style={{ color: "var(--color-text-muted)" }}>
              Effective Date *
            </label>
            <input
              id="opening-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <label htmlFor="opening-amount" className="type-caption" style={{ color: "var(--color-text-muted)" }}>
              Cost Amount (₹, optional)
            </label>
            <input
              id="opening-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000.00"
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <label htmlFor="opening-nav" className="type-caption" style={{ color: "var(--color-text-muted)" }}>
              NAV (₹, optional)
            </label>
            <input
              id="opening-nav"
              type="number"
              step="0.0001"
              value={nav}
              onChange={(e) => setNav(e.target.value)}
              placeholder="e.g. 100.0000"
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
        </div>

        {error && (
          <p className="type-caption" style={{ color: "var(--color-negative)", margin: 0 }} role="alert">
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting || !units || !date}>
            {isSubmitting ? "Saving..." : "Save Opening Balance"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
