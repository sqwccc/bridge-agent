import { describe, it, expect } from "vitest";
import { localTime, time, num } from "./types";

describe("来源时间和缺测展示", () => {
  it("不受运行机器时区影响，统一北京时间跨日", () => {
    expect(localTime(new Date("2026-10-22T18:30:00Z"))).toBe(
      "2026-10-23T02:30",
    );
  });
  it("保留零值并区分未提供值", () => {
    expect(num(0)).toBe("0");
    expect(num(null)).toBe("—");
    expect(time(null)).toBe("未提供");
  });
});
