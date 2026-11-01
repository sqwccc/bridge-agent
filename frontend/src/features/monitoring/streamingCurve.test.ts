import { expect, it } from "vitest";
import { streamingCurve } from "./streamingCurve";

const samples = [
  { time: "2026-10-22T12:00:00", value: 1, rawValue: "1" },
  { time: "2026-10-22T12:10:00", value: 2, rawValue: "2" },
];
it("adds bounded stable points through now, preserves originals and leaves the input untouched", () => {
  const a = streamingCurve(samples, "2026-11-01T12:10:00", "A");
  const b = streamingCurve(samples, "2026-11-01T12:10:02", "A");
  expect(a).toHaveLength(301);
  expect(a[0].value).toBe(1);
  expect(a.at(-1)?.value).toBe(2);
  expect(b.at(-1)?.time).toBe("2026-11-01T12:10:02");
  expect(b.slice(0, -1)).toEqual(a.slice(1));
  expect(
    a.every(
      (p) =>
        p.value !== null &&
        Number.isFinite(p.value) &&
        p.value >= 0.975 &&
        p.value <= 2.025,
    ),
  ).toBe(true);
  expect(samples[0].time).toBe("2026-10-22T12:00:00");
  expect(streamingCurve(samples, "2026-11-01T12:10:00", "B")).not.toEqual(a);
});
it("handles absent history, null gaps and midnight without fabricating a source channel", () => {
  expect(streamingCurve([], "2026-11-01T12:00:00", "A")).toEqual([]);
  const gaps = streamingCurve(
    [samples[0], { ...samples[1], value: null }],
    "2026-11-01T12:10:00",
    "A",
  );
  expect(gaps.slice(1).every((p) => p.value === null)).toBe(true);
  const midnight = streamingCurve(samples, "2026-11-02T00:00:02", "A");
  expect(midnight.map((p) => p.time)).toEqual([
    "2026-11-02T00:00:00",
    "2026-11-02T00:00:02",
  ]);
});
