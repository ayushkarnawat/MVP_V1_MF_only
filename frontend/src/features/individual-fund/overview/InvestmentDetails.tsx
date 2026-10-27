import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICK_ROW, DISABLED } from "@/lib/clickable";
import { formatDate, formatRupees } from "@/lib/format";
import { useScope } from "@/shell/scope/ScopeContext";
import { fundPageApi } from "../api";
import {
  COMING_SOON,
  COPY_FOLIO_FAILED,
  type TileId,
} from "../fundCopy";
import {
  changeDirection,
  formatNav,
  formatSignedPercent,
  formatSignedRupees,
  formatXirr,
} from "../fundFormat";
import type { FolioInfo, SummaryResponse } from "../types";
import { TileDialog } from "./TileDialog";

export interface InvestmentDetailsProps {
  summary: SummaryResponse;
  refreshing?: boolean;
}

interface FolioRowProps {
  folio: FolioInfo;
  schemeId: string;
  scope: string;
}

function FolioRow({ folio, schemeId, scope }: FolioRowProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      const res = await fundPageApi.folioNumber(schemeId, folio.folio_id);
      await navigator.clipboard.writeText(res.folio_number);
      setCopyState("copied");
      timerRef.current = setTimeout(() => {
        setCopyState("idle");
      }, 2000);
    } catch {
      setCopyState("failed");
    }
  };

  const label =
    scope === "combined"
      ? `Folio · ${folio.member_name}`
      : "Folio number";

  return (
    <li
      data-testid={`folio-${folio.folio_id}`}
      className="flex items-center justify-between py-2 text-sm"
    >
      <span className="text-[var(--ui-text-muted)]">{label}</span>
      <div className="flex items-center gap-2">
        {copyState === "copied" && (
          <span role="status" className="text-xs text-[var(--pos-text)]">
            Copied
          </span>
        )}
        {copyState === "failed" && (
          <span role="alert" className="text-xs text-[var(--neg-text)]">
            {COPY_FOLIO_FAILED}
          </span>
        )}
        <button
          type="button"
          aria-label={`Copy folio number ${folio.folio_masked}`}
          title="Copies the full number"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--ui-text)] hover:text-[var(--c4)]"
        >
          <span>{folio.folio_masked}</span>
          {copyState === "copied" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
    </li>
  );
}

export function InvestmentDetails({
  summary,
  refreshing,
}: InvestmentDetailsProps) {
  const { selectedMember } = useScope();
  const [tile, setTile] = useState<TileId | null>(null);

  const { details } = summary;

  const handleKeyDown = (e: React.KeyboardEvent, tileId: TileId) => {
    if (e.key === "Enter") {
      setTile(tileId);
    } else if (e.key === " ") {
      e.preventDefault();
      setTile(tileId);
    }
  };

  const rows: {
    id: string;
    label: string;
    tile: TileId;
    value: React.ReactNode;
  }[] = [
    {
      id: "units",
      label: "Units",
      tile: "value",
      value: details.units ?? "—",
    },
    {
      id: "average-nav",
      label: "Average NAV (invested)",
      tile: "invested",
      value: formatNav(details.average_nav),
    },
    {
      id: "current-nav",
      label: "Current NAV",
      tile: "value",
      value: (
        <>
          {formatNav(details.current_nav)}{" "}
          <span
            data-testid="detail-current-nav-asof"
            className="text-xs font-normal text-[var(--ui-text-muted)]"
          >
            {`as of ${formatDate(summary.nav_as_of)}`}
          </span>
        </>
      ),
    },
    {
      id: "invested",
      label: "Invested amount",
      tile: "invested",
      value: formatRupees(details.invested),
    },
    {
      id: "value",
      label: "Current value",
      tile: "value",
      value: formatRupees(details.current_value),
    },
    {
      id: "gain",
      label: "Gain / Loss",
      tile: "gain",
      value: (
        <span
          data-direction={changeDirection(details.gain)}
          className={
            changeDirection(details.gain) === "up"
              ? "text-[var(--pos-text)]"
              : changeDirection(details.gain) === "down"
                ? "text-[var(--neg-text)]"
                : "text-[var(--ui-text)]"
          }
        >
          {details.gain_pct != null
            ? `${formatSignedRupees(details.gain)} (${formatSignedPercent(details.gain_pct, 1)})`
            : formatSignedRupees(details.gain)}
        </span>
      ),
    },
    {
      id: "xirr",
      label: "XIRR",
      tile: "xirr",
      value: formatXirr(details.xirr),
    },
    {
      id: "first",
      label: "First investment",
      tile: "invested",
      value: formatDate(details.first_investment),
    },
    {
      id: "last",
      label: "Last investment",
      tile: "invested",
      value: formatDate(details.last_investment),
    },
  ];

  return (
    <section
      aria-labelledby="details-title"
      className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
    >
      <div className="flex items-center justify-between pb-3">
        <h3
          id="details-title"
          className="text-base font-semibold text-[var(--ui-text)]"
        >
          Your Investment Details
        </h3>
        <button
          type="button"
          aria-disabled="true"
          title={COMING_SOON}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${DISABLED}`}
        >
          Update
        </button>
      </div>

      {refreshing ? (
        <div
          role="status"
          aria-label="Loading investment details"
          className="space-y-3 py-2"
        >
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      ) : !summary.held ? (
        <p
          data-testid="details-not-held"
          className="py-2 text-sm text-[var(--ui-text-muted)]"
        >
          {`Not held by ${selectedMember?.name ?? "this member"}.`}
        </p>
      ) : (
        <ul aria-label="Investment details" className="divide-y divide-[var(--ui-divider)]">
          {rows.map((row) => (
            <li key={row.id}>
              <div
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                data-testid={`detail-${row.id}`}
                onClick={() => setTile(row.tile)}
                onKeyDown={(e) => handleKeyDown(e, row.tile)}
                className={`flex items-center justify-between py-2 text-sm ${CLICK_ROW}`}
              >
                <span className="text-[var(--ui-text-muted)]">{row.label}</span>
                <span
                  data-testid={`detail-${row.id}-value`}
                  className="font-semibold text-[var(--ui-text)]"
                >
                  {row.value}
                </span>
              </div>
            </li>
          ))}
          {details.folios.map((folio) => (
            <FolioRow
              key={folio.folio_id}
              folio={folio}
              schemeId={summary.scheme.id}
              scope={summary.scope}
            />
          ))}
        </ul>
      )}

      <TileDialog tile={tile} summary={summary} onClose={() => setTile(null)} />
    </section>
  );
}
