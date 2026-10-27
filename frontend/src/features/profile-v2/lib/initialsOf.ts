export function initialsOf(name: string | null | undefined): string {
  if (!name) {
    return "?";
  }
  const withoutMe = name.replace(/\s*\([Mm][Ee]\)\s*$/, "").trim();
  if (!withoutMe) {
    return "?";
  }
  const words = withoutMe.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return [...words[0]][0].toUpperCase();
  }
  return [...words[0]][0].toUpperCase() + [...words[words.length - 1]][0].toUpperCase();
}
