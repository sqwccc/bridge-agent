import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import type { Bridge, Dashboard, Group } from "../src/api/types";
import type { Page as ApiPage } from "../src/api/client";

async function enter(page: Page) {
  const config = await (await page.request.get("/api/v1/auth/config")).json();
  await page.goto("/screen");
  if (!config.data.previewEnabled) {
    const account = JSON.parse(
      readFileSync("../runtime/local-account.json", "utf8").replace(
        /^\uFEFF/,
        "",
      ),
    );
    await page.getByLabel("账号", { exact: true }).fill(account.username);
    await page.getByLabel("密码", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "登录驾驶舱" }).click();
  }
  await expect(page).toHaveURL(/screen/);
}

async function get<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1/${path}`, {
    timeout: 30000,
  });
  expect(response.ok(), path).toBe(true);
  return (await response.json()).data;
}

test("设备桥梁范围：分页、地图、选项和单桥子资源一致", async ({ page }) => {
  test.setTimeout(180000);
  await enter(page);
  const dashboard = await get<Dashboard>(page, "dashboard");
  expect(dashboard.total).toBe(131);
  expect(dashboard.withMonitoringDevices).toBe(dashboard.total);
  const first = await get<ApiPage<Bridge>>(page, "bridges?size=100");
  const second = await get<ApiPage<Bridge>>(page, "bridges?size=100&page=2");
  const rows = [...first.items, ...second.items];
  expect(rows).toHaveLength(dashboard.total);
  expect(rows.every((b) => b.hasMonitoringDevices)).toBe(true);
  const ids = new Set(rows.map((b) => b.id));
  expect(ids.size).toBe(dashboard.total);
  expect(dashboard.points.every((p) => ids.has(p.id))).toBe(true);
  const cities = await get<Group[]>(page, "dashboard/options");
  expect(cities.reduce((sum, c) => sum + c.count, 0)).toBe(dashboard.total);
  expect(new Set(cities.map((c) => c.code))).toEqual(
    new Set(rows.map((b) => b.cityCode)),
  );
  for (const suffix of [
    "",
    "/monitoring/points",
    "/monitoring/thresholds",
    "/reports",
    "/records/patrols",
  ]) {
    expect(
      (await page.request.get(`/api/v1/bridges/QXQR001A${suffix}`)).status(),
    ).toBe(404);
  }
  await page.goto("/bridges/QXQR001A");
  await expect(page.getByRole("alert")).toContainText("无有效关联监测设备");
  await expect(page.locator(".bridge-facts")).toHaveCount(0);
});

test("其他分类：监测和桥型分布点击后与筛选、底数一致", async ({ page }) => {
  test.setTimeout(180000);
  await enter(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dashboard = await get<Dashboard>(page, "dashboard");
  expect(dashboard.monitoringTypes.map((g) => g.code).sort()).toEqual([
    "0",
    "1",
    "2",
  ]);
  const panel = page.locator(".distribution-panel");
  for (const [button, key, groups, code] of [
    ["按监测类型", "monitoringType", dashboard.monitoringTypes, "0"],
    ["按桥型", "type", dashboard.types, "99"],
  ] as const) {
    await page.goto("/screen");
    await panel.getByRole("button", { name: button, exact: true }).click();
    const other = groups.find((g) => g.code === code)!;
    expect(other.label).toBe("其他");
    await panel
      .locator(".distribution-row")
      .filter({ has: page.getByText("其他", { exact: true }) })
      .click();
    await expect(page).toHaveURL(new RegExp(`${key}=${code}`));
    await expect(page.locator(".kpi").first()).toContainText(
      String(other.count),
    );
    const list = await get<ApiPage<Bridge>>(
      page,
      `bridges?${key}=${code}&size=100`,
    );
    expect(list.total).toBe(other.count);
    expect(
      list.items.every((b) =>
        key === "type"
          ? b.type == null || b.type < 1 || b.type > 6
          : ![1, 2].includes(b.effectiveMonitoringType ?? 0),
      ),
    ).toBe(true);
    await panel
      .locator(".distribution-row")
      .filter({ has: page.getByText("其他", { exact: true }) })
      .click();
    await expect(page).not.toHaveURL(new RegExp(`${key}=${code}`));
    await expect(page.locator(".kpi").first()).toContainText("131");
  }
  mkdirSync("../runtime/screenshots", { recursive: true });
  await page.screenshot({
    path: "../runtime/screenshots/device-scope-screen.png",
  });
  expect(errors).toEqual([]);
});
