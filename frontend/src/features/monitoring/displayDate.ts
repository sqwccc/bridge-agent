/** Presentation-only calendar date. Source timestamps and API queries remain untouched. */
export function yesterdayInShanghai(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day") - 1))
    .toISOString()
    .slice(0, 10);
}
