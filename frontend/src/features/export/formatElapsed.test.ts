import { expect, it } from "vitest";
import { formatElapsed } from "./useExportJob";

it("formats_minutes_and_seconds_without_Intl", () => {
  for (const [seconds, expected] of [
    [0, "0 s so far"], [1, "1 s so far"], [45, "45 s so far"], [59, "59 s so far"],
    [60, "1 min 0 s so far"], [61, "1 min 1 s so far"], [130, "2 min 10 s so far"],
    [3600, "60 min 0 s so far"], [-5, "0 s so far"], [NaN, "0 s so far"], [12.9, "12 s so far"],
  ] as const) expect(formatElapsed(seconds)).toBe(expected);
});
