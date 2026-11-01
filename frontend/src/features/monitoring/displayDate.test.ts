import { expect, it } from "vitest";
import { yesterdayInShanghai } from "./displayDate";

it("uses the previous Shanghai calendar day across UTC midnight and month/year boundaries", () => {
  expect(yesterdayInShanghai(new Date("2026-11-01T16:01:00Z"))).toBe(
    "2026-11-01",
  );
  expect(yesterdayInShanghai(new Date("2026-11-01T15:59:00Z"))).toBe(
    "2026-10-31",
  );
  expect(yesterdayInShanghai(new Date("2026-01-01T00:00:00Z"))).toBe(
    "2025-12-31",
  );
});
