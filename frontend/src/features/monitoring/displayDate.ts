import type { Sample } from "../../api/types";

/** Presentation clock only; source timestamps and API queries remain untouched. */
export function nowInShanghai(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

export function samplesUntilNow(
  samples: Sample[],
  displayTime: string,
): Sample[] {
  const cutoff = Date.parse(displayTime + "+08:00");
  return samples
    .map((sample) => ({
      ...sample,
      time: displayTime.slice(0, 10) + sample.time.slice(10),
    }))
    .filter((sample) => Date.parse(sample.time + "+08:00") <= cutoff);
}
