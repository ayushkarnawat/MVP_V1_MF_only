import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

export type SearchChip = { kind: "category" | "member" | "period"; value: string };

const VALID_KINDS = new Set<SearchChip["kind"]>(["category", "member", "period"]);

function parseChip(raw: string): SearchChip | null {
  const idx = raw.indexOf(":");
  if (idx <= 0) return null;
  const kind = raw.slice(0, idx);
  if (!VALID_KINDS.has(kind as SearchChip["kind"])) return null;
  const value = raw.slice(idx + 1);
  if (value.length === 0) return null;
  return { kind: kind as SearchChip["kind"], value };
}

function sameChip(a: SearchChip, b: SearchChip): boolean {
  return a.kind === b.kind && a.value === b.value;
}

export function usePageSearchState(_pageKey: string): {
  text: string;
  chips: SearchChip[];
  setText(text: string): void;
  addChip(chip: SearchChip): void;
  removeChip(chip: SearchChip): void;
  clear(): void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const text = searchParams.get("q") ?? "";

  const chips = useMemo(
    () =>
      searchParams
        .getAll("f")
        .map(parseChip)
        .filter((chip): chip is SearchChip => chip !== null),
    [searchParams],
  );

  const setText = useCallback(
    (nextText: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (nextText === "") next.delete("q");
          else next.set("q", nextText);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const addChip = useCallback(
    (chip: SearchChip) => {
      setSearchParams(
        (prev) => {
          const exists = prev
            .getAll("f")
            .map(parseChip)
            .some((existing) => existing !== null && sameChip(existing, chip));
          if (exists) return prev;
          const next = new URLSearchParams(prev);
          next.append("f", `${chip.kind}:${chip.value}`);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const removeChip = useCallback(
    (chip: SearchChip) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const all = next.getAll("f");
          next.delete("f");
          for (const raw of all) {
            const parsed = parseChip(raw);
            if (!parsed || !sameChip(parsed, chip)) {
              next.append("f", raw);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clear = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("q");
        next.delete("f");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { text, chips, setText, addChip, removeChip, clear };
}
