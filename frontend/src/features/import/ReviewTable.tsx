import { useState } from "react";
import { Badge } from "../../components/Badge";
import type { ImportPreviewResponse, SchemeConfirmation } from "./types";
import styles from "./ReviewTable.module.css";

interface ReviewTableProps {
  preview: ImportPreviewResponse;
  confirming: boolean;
  onConfirm: (confirmations: SchemeConfirmation[]) => void;
}

interface OverrideState {
  amfiCode: string;
  planType: "" | "direct" | "regular";
}

function needsAmfiOverride(matchStatus: string): boolean {
  return matchStatus !== "confirmed";
}

function needsPlanTypeOverride(planType: string): boolean {
  return planType === "unclassified";
}

export function ReviewTable({ preview, confirming, onConfirm }: ReviewTableProps) {
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});

  const updateOverride = (tempId: string, patch: Partial<OverrideState>) => {
    setOverrides((prev) => {
      const current = prev[tempId] ?? { amfiCode: "", planType: "" };
      return { ...prev, [tempId]: { ...current, ...patch } };
    });
  };

  const allResolved = preview.schemes.every((scheme) => {
    const override = overrides[scheme.temp_id];
    if (needsAmfiOverride(scheme.match_status) && !override?.amfiCode.trim()) {
      return false;
    }
    if (needsPlanTypeOverride(scheme.plan_type) && !override?.planType) {
      return false;
    }
    return true;
  });

  const handleConfirm = () => {
    const confirmations: SchemeConfirmation[] = preview.schemes
      .filter((scheme) => overrides[scheme.temp_id])
      .map((scheme) => {
        const override = overrides[scheme.temp_id];
        const confirmation: SchemeConfirmation = { temp_id: scheme.temp_id };
        if (override.amfiCode.trim()) {
          confirmation.amfi_code = override.amfiCode.trim();
        }
        if (override.planType) {
          confirmation.plan_type_override = override.planType;
        }
        return confirmation;
      });
    onConfirm(confirmations);
  };

  return (
    <div className={styles.container}>
      <h1>Review CAS Import</h1>
      <dl className={styles.investorInfo}>
        <dt>Investor</dt>
        <dd>{preview.investor_name ?? "Not found in CAS"}</dd>
        <dt>PAN</dt>
        <dd>{preview.pan_masked ?? "Not found in CAS"}</dd>
        <dt>Transactions found</dt>
        <dd>{preview.transaction_count}</dd>
      </dl>

      {preview.parse_warnings.length > 0 && (
        <ul className={styles.warnings}>
          {preview.parse_warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Scheme</th>
            <th>Folio / AMC</th>
            <th>AMFI Match</th>
            <th>Plan Type</th>
            <th>Txns</th>
          </tr>
        </thead>
        <tbody>
          {preview.schemes.map((scheme) => (
            <tr key={scheme.temp_id}>
              <td>{scheme.name}</td>
              <td>
                {scheme.folio} / {scheme.amc}
              </td>
              <td>
                <Badge variant={scheme.match_status === "confirmed" ? "positive" : "neutral"}>
                  {scheme.match_status}
                </Badge>
                {scheme.suggested_name && <div className={styles.suggestion}>{scheme.suggested_name}</div>}
                {needsAmfiOverride(scheme.match_status) && (
                  <input
                    type="text"
                    placeholder="AMFI code"
                    value={overrides[scheme.temp_id]?.amfiCode ?? ""}
                    onChange={(event) => updateOverride(scheme.temp_id, { amfiCode: event.target.value })}
                  />
                )}
              </td>
              <td>
                <Badge variant={scheme.plan_type === "unclassified" ? "neutral" : "positive"}>
                  {scheme.plan_type}
                </Badge>
                {needsPlanTypeOverride(scheme.plan_type) && (
                  <select
                    value={overrides[scheme.temp_id]?.planType ?? ""}
                    onChange={(event) =>
                      updateOverride(scheme.temp_id, {
                        planType: event.target.value as "" | "direct" | "regular",
                      })
                    }
                  >
                    <option value="">Select...</option>
                    <option value="direct">Direct</option>
                    <option value="regular">Regular</option>
                  </select>
                )}
              </td>
              <td>{scheme.transaction_count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" disabled={!allResolved || confirming} onClick={handleConfirm}>
        {confirming ? "Confirming..." : "Confirm Import"}
      </button>
    </div>
  );
}
