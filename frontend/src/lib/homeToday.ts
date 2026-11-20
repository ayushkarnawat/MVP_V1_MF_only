export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}
