import { useEffect, useRef, useState } from "react";
import { getExportPayload } from "../api";
import { AllocationSection } from "../AllocationSection";
import { TerSection } from "../TerSection";
import { CategoryRankingSection } from "../CategoryRankingSection";
import { BenchmarkSection } from "../BenchmarkSection";
import { FundScoreCard } from "../FundScoreCard";
import type { AnalyticsExportPayload } from "../types";
import "./print.css";

function useQueryToken(): string | null {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token"));
  return token;
}

export function PrintAnalyticsView() {
  const token = useQueryToken();
  const [payload, setPayload] = useState<AnalyticsExportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The export token is single-use server-side (a consumed capability
  // token, not a re-fetchable resource) — this ref stops StrictMode's
  // dev-mode double-invocation of this effect from firing a second real
  // fetch that would always 404 against an already-consumed token.
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setError("Missing export token.");
      return;
    }
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    getExportPayload(token)
      .then(setPayload)
      .catch((err) => setError(err.message || "Failed to load export data."));
  }, [token]);

  useEffect(() => {
    if (payload || error) {
      document.documentElement.dataset.printReady = "true";
    }
  }, [payload, error]);

  if (error) {
    return <div data-testid="print-error">{error}</div>;
  }

  if (!payload) {
    return <div>Loading report…</div>;
  }

  return (
    <div className="p-10 space-y-10 bg-[var(--color-bg)]">
      <div className="print-cover space-y-2 py-24 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">Unifolio</p>
        <h1 className="font-display text-3xl font-bold text-[var(--color-ink)]">Analytics Report</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{payload.scopeName}</p>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Generated {new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="print-section">
        <AllocationSection summary={payload.allocation} isLoading={false} />
      </div>
      <div className="print-section">
        <TerSection ter={payload.ter} comparison={payload.terComparison} isLoading={false} />
      </div>
      <div className="print-section">
        <CategoryRankingSection ranking={payload.ranking} isLoading={false} />
      </div>
      <div className="print-section">
        <BenchmarkSection
          portfolioBenchmark={payload.portfolioBenchmark}
          fundBenchmark={payload.fundBenchmark}
          isLoading={false}
          printMode
        />
      </div>

      {payload.scoreSummary && payload.scoreSummary.funds.length > 0 && (
        <div className="space-y-6">
          <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">Fund Score Detail — every held fund</h2>
          {payload.scoreSummary.funds.map((fund) => (
            <div key={fund.scheme_id} className="print-section rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <h3 className="font-display text-base font-bold text-[var(--color-ink)] mb-3">{fund.scheme_name}</h3>
              <FundScoreCard data={fund} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
