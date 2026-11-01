import { test, expect } from "@playwright/test";
import { nowInShanghai } from "../src/features/monitoring/displayDate";

test("横轴延伸至当前时间，最后一条记录之后保留空白", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-01T14:26:00Z"));
  await page.goto("/bridges/10905200071");
  const row = page.locator(".metric-row").first();
  await expect(row.locator(".chart-box")).toBeVisible();
  await expect(row.locator(".chart-box")).toContainText("11-01 00:00");
  await expect(row.locator(".chart-box")).toContainText("11-01 22:26");
  const blank = await row.evaluate((el) => {
    const curve = el.querySelector<SVGPathElement>(".recharts-line-curve")!;
    const end = el.querySelectorAll<SVGLineElement>(
      ".recharts-xAxis .recharts-cartesian-axis-tick-line",
    );
    const box = curve.getBBox();
    return end[end.length - 1].x1.baseVal.value - (box.x + box.width);
  });
  expect(blank).toBeGreaterThan(5);
});

test("缓慢往返滚动，悬停暂停，移开立即继续且到底不跳转", async ({ page }) => {
  await page.goto("/bridges/10905200071");
  const list = page.getByRole("region", { name: "监测指标滚动列表" });
  await expect(list.locator(".chart-box").first()).toBeVisible();
  await page.mouse.move(0, 0);
  await expect
    .poll(() => list.evaluate((e) => e.scrollTop))
    .toBeGreaterThan(20);
  await list.hover();
  const paused = await list.evaluate((e) => e.scrollTop);
  await page.waitForTimeout(400);
  expect(await list.evaluate((e) => e.scrollTop)).toBe(paused);
  await list.dispatchEvent("wheel", { deltaY: 0 });
  await page.mouse.move(0, 0);
  await expect
    .poll(() => list.evaluate((e) => e.scrollTop), { timeout: 1200 })
    .toBeGreaterThan(paused);
  await list.focus();
  const focused = await list.evaluate((e) => e.scrollTop);
  await page.waitForTimeout(400);
  expect(await list.evaluate((e) => e.scrollTop)).toBe(focused);
  await expect(
    page.getByRole("button", { name: "暂停滚动", exact: true }),
  ).toHaveCount(0);
  await list.evaluate((e) => e.blur());
  await list.evaluate((e) => (e.scrollTop = e.scrollHeight));
  const bottom = await list.evaluate((e) => e.scrollTop);
  await page.mouse.move(0, 0);
  await expect
    .poll(() => list.evaluate((e) => e.scrollTop), { timeout: 8000 })
    .toBeLessThan(bottom - 2);
  expect(await list.evaluate((e) => e.scrollTop)).toBeGreaterThan(bottom - 60);
});

test("默认最近有数据日，指标独立滚动，历史查询可恢复", async ({ page }) => {
  const samples: URL[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/monitoring/samples?"))
      samples.push(new URL(r.url()));
  });
  await page.goto("/bridges/10905200071");
  const panel = page.locator(".monitor-panel");
  const list = panel.getByRole("region", { name: "监测指标滚动列表" });
  await expect(
    list.locator(".metric-row").first().locator(".chart-box"),
  ).toBeVisible();
  await expect(list.locator(".monitor-meta").first()).toContainText(
    `${nowInShanghai().slice(0, 10)} 00:00 至 ${nowInShanghai().slice(0, 10)}`,
  );
  expect(samples[0].searchParams.get("from")).toBe("2026-10-22T00:00");
  expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(
    true,
  );
  await list.evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect(list.locator(".metric-row").last()).toBeInViewport();
  await list.evaluate((e) => (e.scrollTop = 0));
  await panel.getByText("历史时间查询", { exact: true }).click();
  await panel.getByLabel("监测开始时间").fill("2099-01-01T00:00");
  await panel.getByLabel("监测结束时间").fill("2099-01-02T00:00");
  await panel.getByRole("button", { name: "查询", exact: true }).click();
  await expect(list.locator(".metric-row").first()).toContainText(
    "所选区间暂无监测值",
  );
  await panel
    .getByRole("button", { name: "最近有数据日", exact: true })
    .click();
  await expect(
    list.locator(".metric-row").first().locator(".chart-box"),
  ).toBeVisible();
  await panel.getByText("历史时间查询", { exact: true }).click();
  await panel.screenshot({ path: "../runtime/monitoring-latest-day.png" });
});

test("没有历史记录时显示缺数，不请求当前时间空曲线", async ({ page }) => {
  let calls = 0;
  await page.route("**/monitoring/latest", (r) =>
    r.fulfill({ json: { code: "OK", data: [] } }),
  );
  page.on("request", (r) => {
    if (r.url().includes("/monitoring/samples?")) calls++;
  });
  await page.goto("/bridges/10905200071");
  await expect(page.locator(".metric-row").first()).toContainText(
    "本测点暂无历史监测记录",
  );
  expect(calls).toBe(0);
});

test("显式链接日期优先于自动最近日", async ({ page }) => {
  await page.goto(
    "/bridges/10905200071?from=2099-01-01T00:00&to=2099-01-02T00:00",
  );
  await expect(page.locator(".metric-row").first()).toContainText(
    "2099-01-01 00:00",
  );
  await expect(page.locator(".metric-row").first()).toContainText(
    "所选区间暂无监测值",
  );
});
