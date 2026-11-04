import type { ReturnsMode } from "../types";
import { Segmented, type SegmentedOption } from "../components/Segmented";

const MODE_OPTIONS: readonly SegmentedOption<ReturnsMode>[] = [
  {
    value: "inception",
    label: "Model Portfolio Returns",
    info: "The fund's own track record, the same for every investor. It shows how the fund did against its benchmark and similar funds over each period.",
  },
  {
    value: "current",
    label: "Actual XIRR",
    info: "How your own money in this fund has done, based on when and how much you invested. It only shows if you hold the fund, and is compared with the benchmark on the same dates.",
  },
];

export interface ReturnsModeToggleProps {
  mode: ReturnsMode;
  onChange: (mode: ReturnsMode) => void;
}

/** The one place the returns basis options are defined. The values stay the API's mode names. */
export function ReturnsModeToggle({ mode, onChange }: ReturnsModeToggleProps) {
  return <Segmented label="Returns basis" options={MODE_OPTIONS} value={mode} onChange={onChange} />;
}
