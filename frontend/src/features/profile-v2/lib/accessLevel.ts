export function accessLevel(relationship: string | null | undefined): "Admin" | "Member" {
  return relationship === "self" ? "Admin" : "Member";
}
