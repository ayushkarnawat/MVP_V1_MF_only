import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { compareDecimalStrings } from "@/lib/decimal";
import { formatDate, formatPercent } from "@/lib/format";
import { fundPageApi } from "../api";
import { SectionState } from "../components/SectionState";
import { ageTagText } from "../fundCopy";
import type { HoldingsListResponse } from "../types";
import { useFundSection } from "../useFundSection";

export interface AllHoldingsDialogProps {
  schemeId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AllHoldingsDialog({
  schemeId,
  isOpen,
  onClose,
}: AllHoldingsDialogProps) {
  const [requested, setRequested] = useState(false);
  if (isOpen && !requested) {
    setRequested(true);
  }

  const holdings = useFundSection<HoldingsListResponse>(
    (signal) => fundPageApi.holdings(schemeId, signal),
    [schemeId],
    { enabled: requested }
  );

  const [sort, setSort] = useState<{
    key: "weight" | "name";
    dir: "asc" | "desc";
  }>({
    key: "weight",
    dir: "desc",
  });

  const handleSort = (key: "weight" | "name") => {
    if (sort.key === key) {
      setSort({
        key,
        dir: sort.dir === "asc" ? "desc" : "asc",
      });
    } else {
      setSort({
        key,
        dir: key === "weight" ? "desc" : "asc",
      });
    }
  };

  const sortedRows = useMemo(() => {
    if (!holdings.data?.rows) return [];
    const copy = [...holdings.data.rows];
    const mult = sort.dir === "asc" ? 1 : -1;
    return copy.sort((a, b) => {
      if (sort.key === "weight") {
        return compareDecimalStrings(a.weight, b.weight) * mult;
      }
      return a.name.localeCompare(b.name) * mult;
    });
  }, [holdings.data?.rows, sort]);

  if (!isOpen) return null;

  const title = holdings.data
    ? `All holdings, as of ${formatDate(holdings.data.holdings_as_of)}`
    : "All holdings";

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <SectionState
        status={holdings.status}
        label="holdings"
        reason={holdings.reason}
        onRetry={holdings.retry}
      >
        {holdings.data ? (
          <div>
            <p data-testid="all-count" className="mb-2 text-sm text-[var(--ui-text-muted)]">
              {`${holdings.data.count} holding${holdings.data.count === 1 ? "" : "s"}`}
            </p>

            {ageTagText(holdings.data.age_tag) ? (
              <p
                data-testid="all-age-note"
                className="mb-2 text-xs text-[var(--warn-text)]"
              >
                {ageTagText(holdings.data.age_tag)}
              </p>
            ) : null}

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-left">
                <caption className="sr-only">All holdings</caption>
                <thead>
                  <tr className="border-b border-[var(--ui-divider)]">
                    <th
                      scope="col"
                      className="py-2 text-left text-xs font-semibold text-[var(--ui-text-muted)]"
                    >
                      #
                    </th>
                    <th
                      scope="col"
                      aria-sort={
                        sort.key === "name"
                          ? sort.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="py-2 text-left text-xs font-semibold text-[var(--ui-text-muted)]"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort("name")}
                        className="inline-flex items-center gap-1 hover:text-[var(--ui-text)]"
                      >
                        Stock
                      </button>
                    </th>
                    <th
                      scope="col"
                      className="py-2 text-left text-xs font-semibold text-[var(--ui-text-muted)]"
                    >
                      Sector
                    </th>
                    <th
                      scope="col"
                      aria-sort={
                        sort.key === "weight"
                          ? sort.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="py-2 text-right text-xs font-semibold text-[var(--ui-text-muted)]"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort("weight")}
                        className="inline-flex items-center gap-1 hover:text-[var(--ui-text)]"
                      >
                        Weight
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, index) => (
                    <tr
                      key={`${row.name}-${index}`}
                      data-testid="all-row"
                      className="border-b border-[var(--ui-divider)] last:border-b-0 hover:bg-[var(--ui-row-hover)]"
                    >
                      <td className="py-2 text-xs text-[var(--ui-text-muted)]">
                        {index + 1}
                      </td>
                      <td className="py-2 text-sm font-medium text-[var(--ui-text)]">
                        {row.name}
                      </td>
                      <td className="py-2 text-xs text-[var(--ui-text-muted)]">
                        {row.sector || "—"}
                      </td>
                      <td className="py-2 text-right text-sm font-semibold text-[var(--ui-text)]">
                        {formatPercent(row.weight, { digits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </SectionState>
    </Modal>
  );
}
