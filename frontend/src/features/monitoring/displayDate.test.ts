import { expect, it } from "vitest";
import { nowInShanghai, samplesUntilNow } from "./displayDate";

it("uses Shanghai's current calendar date across UTC midnight", () => {
  expect(nowInShanghai(new Date("2026-11-01T16:01:00Z"))).toBe(
    "2026-11-02T00:01:00",
  );
  expect(nowInShanghai(new Date("2026-11-01T15:59:00Z"))).toBe(
    "2026-11-01T23:59:00",
  );
});

it("cuts off future clock times, keeps the boundary and null gaps without mutating source samples", () => {
  const rows = ["10:29:59", "10:30:00", "10:30:00.001", "23:59:59"].map(
    (t, i) => ({
      time: `2026-10-22T${t}`,
      value: i === 1 ? null : i,
      rawValue: String(i),
    }),
  );
  const result = samplesUntilNow(rows, "2026-11-01T10:30:00");
  expect(result.map((r) => r.time)).toEqual([
    "2026-11-01T10:29:59",
    "2026-11-01T10:30:00",
  ]);
  expect(result[1].value).toBeNull();
  expect(rows[0].time).toBe("2026-10-22T10:29:59");
  expect(samplesUntilNow(rows, "2026-11-02T00:00:00")).toEqual([]);
});
