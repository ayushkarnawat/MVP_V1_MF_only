import type { DistributorPortfolioRow } from "./types";

export type DistributorChannel = "direct" | "regular-no-arn" | "arn";

/** #17: a folio without an ARN is Direct only when its plan says so — a
 * Regular folio whose statement carries no ARN is still Regular. Rows from
 * before plan_type existed (no field) keep the old no-ARN-means-Direct reading. */
export function distributorChannel(row: DistributorPortfolioRow): DistributorChannel {
  if (row.arn_code) return "arn";
  return row.plan_type === "regular" ? "regular-no-arn" : "direct";
}

export function distributorLabel(row: DistributorPortfolioRow): string {
  switch (distributorChannel(row)) {
    case "direct":
      return "Direct Plan (No Broker)";
    case "regular-no-arn":
      return "Regular (no ARN on statement)";
    default:
      return row.distributor_name || "Regular Broker";
  }
}
