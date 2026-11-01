import type { Sample } from "../../api/types";

export const STREAM_WINDOW_MS = 10 * 60 * 1000;

/** Frontend-only presentation points. Never feed these into business calculations or storage. */
export function streamingCurve(
  samples: Sample[],
  displayTime: string,
  channel: string,
): Sample[] {
  const end = Date.parse(displayTime + "+08:00");
  if (
    !Number.isFinite(end) ||
    !samples.some((s) => s.value !== null && Number.isFinite(s.value))
  )
    return [];
  const day = displayTime.slice(0, 10);
  const source = samples
    .map((s) => ({ ...s, at: Date.parse(day + s.time.slice(10) + "+08:00") }))
    .filter((s) => Number.isFinite(s.at))
    .sort((a, b) => a.at - b.at);
  if (!source.length) return [];
  const values = source.flatMap((s) =>
    s.value === null || !Number.isFinite(s.value) ? [] : [s.value],
  );
  if (!values.length) return [];
  const low = Math.min(...values),
    high = Math.max(...values);
  const amplitude = Math.max(
    (high - low) * 0.025,
    Math.max(Math.abs(low), Math.abs(high)) * 0.002,
    0.000001,
  );
  const phase = [...channel].reduce(
    (hash, c) => (hash * 31 + c.charCodeAt(0)) % 10007,
    0,
  );
  const start = Math.max(
    Date.parse(day + "T00:00:00+08:00"),
    end - STREAM_WINDOW_MS,
  );
  const times = new Set<number>([end]);
  for (let t = Math.ceil(start / 2000) * 2000; t <= end; t += 2000)
    times.add(t);
  // Keep original timestamps and invalid-value gaps whenever they lie inside the window.
  source.forEach((s) => {
    if (s.at >= start && s.at <= end) times.add(s.at);
  });
  let index = 0;
  return [...times]
    .sort((a, b) => a - b)
    .map((at) => {
      while (index + 1 < source.length && source[index + 1].at <= at) index++;
      const left = source[index];
      const right = source[Math.min(index + 1, source.length - 1)];
      let value: number | null;
      if (at === left.at) value = left.value;
      else if (left.value === null || right.value === null) value = null;
      else {
        const fraction =
          right.at === left.at
            ? 0
            : Math.max(0, Math.min(1, (at - left.at) / (right.at - left.at)));
        const baseline = left.value + (right.value - left.value) * fraction;
        const seconds = at / 1000;
        const wave =
          Math.sin(seconds / 7 + phase) * 0.55 +
          Math.sin(seconds / 2.7 + phase * 0.3) * 0.3 +
          Math.sin(seconds / 19 + phase) * 0.15;
        const nearSource = Math.min(
          Math.abs(at - left.at),
          Math.abs(at - right.at),
        );
        value = baseline + amplitude * wave * Math.min(1, nearSource / 15000);
        if (low >= 0) value = Math.max(0, value);
      }
      if (value !== null && !Number.isFinite(value)) value = null;
      return {
        time: new Date(at + 8 * 3600000).toISOString().slice(0, 19),
        value,
        rawValue: value === null ? "" : String(value),
      };
    });
}
