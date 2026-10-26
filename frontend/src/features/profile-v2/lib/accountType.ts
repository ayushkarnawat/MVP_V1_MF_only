export function accountType(memberCount: number): "Individual" | "Family" {
  return memberCount >= 2 ? "Family" : "Individual";
}
