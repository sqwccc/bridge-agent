import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import type { Bridge, Dashboard, BridgeDictionaries } from "../src/api/types";

const account = JSON.parse(
  readFileSync("../runtime/local-account.json", "utf8").replace(/^\uFEFF/, ""),
);

async function enter(page: Page) {
  const config = await (await page.request.get("/api/v1/auth/config")).json();
  await page.goto("/screen");
  if (!config.data.previewEnabled) {
    await page.getByLabel("账号", { exact: true }).fill(account.username);
    await page.getByLabel("密码", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "登录驾驶舱" }).click();
  }
  await expect(page).toHaveURL(/screen/);
}

async function get<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1/${path}`);
  expect(response.ok(), path).toBe(true);
  return (await response.json()).data as T;
}

test("一期接口：字典、两套评价、默认监测分类及组合筛选一致", async ({
  page,
}) => {
  test.setTimeout(120000);
  await enter(page);
  const d = await get<Dashboard>(page, "dashboard");
  expect(d.total).toBe(131);
  expect(d.monitored).toBe(98);
  expect(d.monitoringDefaulted).toBe(56);
  expect(d.withMonitoringDevices).toBe(131);
  expect(d.conditionGrades.reduce((sum, g) => sum + g.count, 0)).toBe(d.total);
  expect(d.structureGrades.reduce((sum, g) => sum + g.count, 0)).toBe(d.total);
  const dictionaries = await get<BridgeDictionaries>(
    page,
    "dictionaries/bridges",
  );
  expect(dictionaries.types.find((o) => o.code === "6")?.label).toBe(
    "其他特殊结构桥梁",
  );
  expect(dictionaries.grades.find((o) => o.code === "4")?.label).toContain(
    "B级",
  );
  for (const filter of [
    "monitoringType=2",
    "monitoringType=missing",
    "monitoringType=0",
    "structureGrade=99",
    "conditionGrade=missing",
    "bridgeStatus=0&transferred=0&demolished=0&demolitionStatus=0",
    "city=320100&conditionGrade=3&structureGrade=4",
  ]) {
    const summary = await get<Dashboard>(page, `dashboard?${filter}`);
    const list = await get<{ total: number; items: Bridge[] }>(
      page,
      `bridges?${filter}&size=8`,
    );
    expect(summary.total, filter).toBe(list.total);
    if (filter === "monitoringType=missing")
      expect(
        list.items.every(
          (b) => ![1, 2].includes(b.effectiveMonitoringType ?? 0),
        ),
      ).toBe(true);
    if (filter === "monitoringType=0")
      expect(
        list.items.every(
          (b) =>
            ![1, 2].includes(b.effectiveMonitoringType ?? 0) &&
            b.monitoringTypeBasis === "UNRECOGNIZED",
        ),
      ).toBe(true);
    if (filter === "structureGrade=99")
      expect(
        list.items.every(
          (b) =>
            b.structureGrade === "99" &&
            b.dataIssues.some((i) => i.field === "structureGrade"),
        ),
      ).toBe(true);
  }
  const legacy = await get<Bridge>(page, "bridges/10905200071");
  expect(legacy.technicalGrade).toBe(legacy.structureGrade);
  expect(legacy.monitoringType).toBe(legacy.reportedMonitoringType);
  const bad = await page.request.get("/api/v1/bridges?monitoringType=invalid");
  expect(bad.status()).toBe(400);
});

test("一期页面：评价筛选、刷新与返回保留条件，详情显示数据问题", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  await expect(page.getByText("有效监测分类", { exact: true })).toBeVisible();
  await expect(page.locator(".kpi").last()).toContainText("98");
  await expect(
    page.locator(".technical-panel .grade-row").first(),
  ).toBeVisible();
  const grade = page.getByRole("button", {
    name: "完好状况 Ⅱ～Ⅴ类养护 B级 6座",
    exact: true,
  });
  await grade.click();
  await expect(page).toHaveURL(/conditionGrade=4/);
  await expect(page.locator(".kpi").first()).toContainText("6");
  await page.getByRole("button", { name: "查看桥梁清单", exact: true }).click();
  await page.locator(".bridge-table .text-link").first().click();
  await page.getByRole("button", { name: "基础档案", exact: true }).click();
  await expect(page.getByText("桥梁基础档案", { exact: true })).toBeVisible();
  await expect(page.locator(".bridge-facts")).toContainText("完好状况 BCI");
  await expect(page.locator(".bridge-facts")).toContainText("结构状况 BSI");
  await page.reload();
  await expect(page.locator(".bridge-facts")).toContainText("Ⅱ～Ⅴ类：B级");
  await page.locator(".archive-drawer .ant-drawer-close").click();
  await page.getByRole("link", { name: "返回路网" }).click();
  await page.locator(".bridge-list-drawer .ant-drawer-close").click();
  await expect(page).toHaveURL(/conditionGrade=4/);
  await expect(page.locator(".kpi").first()).toContainText("6");
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await page.getByRole("button", { name: "结构状况 BSI", exact: true }).click();
  await page
    .getByRole("button", {
      name: "结构状况 Ⅰ类养护 其他 11座",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/structureGrade=other/);
  await expect(page.locator(".kpi").first()).toContainText("11");
  await page.getByRole("button", { name: "查看桥梁清单", exact: true }).click();
  await page.locator(".bridge-table .text-link").first().click();
  await page.getByRole("button", { name: "基础档案", exact: true }).click();
  await expect(page.locator(".bridge-facts")).toContainText("结构状况 BSI");
  await expect(page.locator(".bridge-facts")).toContainText("拆除 / 处理状态");
  await expect(page.getByText("正在读取测点…")).toHaveCount(0);
  await expect(page.getByText("正在读取报警…")).toHaveCount(0);
  await expect(page.getByText("正在读取报告…")).toHaveCount(0);
  await page.locator(".bridge-facts").scrollIntoViewIfNeeded();
  mkdirSync("../runtime/screenshots", { recursive: true });
  await page.screenshot({
    path: "../runtime/screenshots/phase-one-bridge.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/screen");
  await expect(page.locator(".kpi").first()).toContainText("131");
  await page.getByRole("button", { name: "查看桥梁清单", exact: true }).click();
  await expect(page.locator(".bridge-table .text-link").first()).toBeVisible();
  await page.locator(".bridge-list-drawer .ant-drawer-close").click();
  await page.screenshot({
    path: "../runtime/screenshots/phase-one-screen.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.getByRole("button", { name: "筛选与分类", exact: true }).click();
  await page.getByText("评价与生命周期筛选", { exact: false }).click();
  await expect(
    page.getByRole("combobox", { name: "使用状态筛选", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../runtime/screenshots/phase-one-screen-4k.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
