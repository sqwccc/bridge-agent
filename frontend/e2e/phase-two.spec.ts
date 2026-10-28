import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import type { Bridge, Dashboard, Report, Threshold } from "../src/api/types";

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
  return (await response.json()).data;
}

test("二期接口：范围、三特多选、档案、阈值和报告元数据", async ({ page }) => {
  test.setTimeout(150000);
  await enter(page);
  const d = await get<Dashboard>(page, "dashboard");
  expect(d.total).toBe(131);
  expect(d.normalUse).toBe(70);
  expect(d.specialTypesRegistered).toBe(23);
  expect(d.specialFlagProvided).toBe(0);
  expect(d.singleColumnPiers).toBe(17);
  for (const key of [
    "spanTypes",
    "maintenanceCategories",
    "bridgeStatuses",
  ] as const)
    expect(d[key].reduce((sum, g) => sum + g.count, 0)).toBe(d.total);
  expect(
    d.specialTypes
      .filter((g) => ["1", "2", "3"].includes(g.code))
      .reduce((sum, g) => sum + g.count, 0),
  ).toBe(26);
  for (const filter of [
    "specialTypes=1,2",
    "population=normalUse",
    "maintenanceCategory=missing",
    "spanType=1",
    "bridgeStatus=missing",
  ]) {
    const summary = await get<Dashboard>(page, `dashboard?${filter}`);
    const list = await get<{ total: number; items: Bridge[] }>(
      page,
      `bridges?${filter}&size=8`,
    );
    expect(summary.total, filter).toBe(list.total);
    if (list.items.length) expect(list.items[0]).not.toHaveProperty("archive");
    if (filter === "specialTypes=1,2") {
      expect(summary.total).toBe(14);
      expect(
        list.items.every((b) =>
          b.specialTypeCodes.some((c) => ["1", "2"].includes(c)),
        ),
      ).toBe(true);
    }
  }
  const b = await get<Bridge>(page, "bridges/10905200071");
  expect(b.id).toBe("10905200071");
  expect(b.archive?.spanCount).toBe(12);
  expect(b.archive?.deckArea).toBe(20252);
  expect(b.specialBridge).toBeNull();
  const thresholds = await get<Threshold[]>(
    page,
    "bridges/02000102281/monitoring/thresholds",
  );
  expect(thresholds).toHaveLength(366);
  expect(new Set(thresholds.map((t) => t.id)).size).toBe(366);
  expect(thresholds[0].unit).toBe("mm");
  expect(thresholds[0].boundaryConvention).toBe("UNSPECIFIED");
  const bad = await page.request.get(
    "/api/v1/bridges/02000102281/monitoring/thresholds?device=other-bridge-device",
  );
  expect(bad.status()).toBe(400);
  const reports = await get<Report[]>(page, "bridges/10905200071/reports");
  expect(
    reports.some(
      (r) =>
        r.source === "BASE_INSPECTION" && r.requirementStatus === "MISSING",
    ),
  ).toBe(true);
  expect(
    reports.some(
      (r) =>
        r.source === "REGULAR_INSPECTION" &&
        r.inspectionId &&
        r.sourceUpdatedAt,
    ),
  ).toBe(true);
  expect(reports.every((r) => !("path" in r))).toBe(true);
  const shared = await get<Report[]>(page, "bridges/10905200071/reports");
  expect(
    shared.some(
      (r) =>
        r.attachmentScope === "TASK" &&
        r.taskId &&
        (r.relatedBridgeCount || 0) >= 1,
    ),
  ).toBe(true);
});

test("二期页面：多选范围、完整档案、指标单位和独立阈值区间", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page.goto("/screen?specialTypes=1%2C2");
  await expect(page.locator(".kpi").first()).toContainText("14");
  await page.getByRole("button", { name: "筛选与分类", exact: true }).click();
  await page.getByText("评价与生命周期筛选", { exact: false }).click();
  await expect(page.getByLabel("三特类型筛选")).toBeVisible();
  await expect(
    page.locator('.ant-select-selection-item[title="特大桥"]'),
  ).toBeVisible();
  await expect(
    page.locator('.ant-select-selection-item[title="特殊结构桥梁"]'),
  ).toBeVisible();
  await page
    .locator(".filters-drawer")
    .getByRole("button", { name: "重置", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "桥梁范围筛选", exact: true })
    .click();
  await page.getByTitle("正常使用且未拆除", { exact: true }).click();
  await expect(page).toHaveURL(/population=normalUse/);
  await expect(page.locator(".kpi").first()).toContainText("70");
  await page.goto("/bridges/10905200071");
  await page.getByRole("button", { name: "完整档案", exact: true }).click();
  await expect(page.locator(".archive-facts")).toContainText("最大跨径 m");
  await expect(page.locator(".archive-facts")).toContainText("20,252");
  await page.getByRole("button", { name: "建设与管养", exact: true }).click();
  await expect(page.locator(".archive-facts")).toContainText("建设单位");
  await page.getByRole("button", { name: "档案与附件", exact: true }).click();
  await expect(page.locator(".archive-facts")).toContainText("档案编号");
  await page.getByRole("button", { name: "结构与荷载", exact: true }).click();
  await expect(page.getByText("正在读取报告…")).toHaveCount(0);
  mkdirSync("../runtime/screenshots", { recursive: true });
  await page.screenshot({
    path: "../runtime/screenshots/phase-two-archive.png",
    fullPage: true,
  });
  await page.goto("/bridges/02000102281");
  await expect(page.locator(".monitor-meta").first()).toContainText(
    "mm（对接字典）",
  );
  await page.locator(".threshold-section > summary").first().click();
  await expect(page.locator(".threshold-table tbody tr").first()).toBeVisible();
  await expect(page.locator(".threshold-section").first()).toContainText(
    "来源未明确边界是否包含",
  );
  await expect(page.getByText("正在读取报告…")).toHaveCount(0);
  await page.screenshot({
    path: "../runtime/screenshots/phase-two-monitoring.png",
    fullPage: true,
  });
  await page.goto("/screen");
  await expect(page.locator(".kpi").first()).toContainText("131");
  await page.getByRole("button", { name: "查看桥梁清单", exact: true }).click();
  await expect(page.locator(".bridge-table .text-link").first()).toBeVisible();
  await page.locator(".bridge-list-drawer .ant-drawer-close").click();
  await page.getByRole("button", { name: "筛选与分类", exact: true }).click();
  await page.getByText("评价与生命周期筛选", { exact: false }).click();
  await page.screenshot({
    path: "../runtime/screenshots/phase-two-screen.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.screenshot({
    path: "../runtime/screenshots/phase-two-screen-4k.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("二期附件：读取失败不改写来源状态，PDF 下载与图片预览", async ({
  page,
}) => {
  // 仅拦截当前浏览器；不向来源数据库或文件服务写入测试文件。
  const metadata = {
    type: "测试定检",
    time: "2026-01-01T00:00:00",
    status: "AVAILABLE",
    pdf: true,
    source: "PERIODIC_INSPECTION",
    sourceLabel: "定期检测记录",
    inspectionId: "fixture",
    inspectionType: 2,
    inspectionTypeName: "结构定期检测",
    inspectionDate: "2026-01-01T00:00:00",
    sourceUpdatedAt: "2026-01-02T00:00:00",
    requirementStatus: "PRESENT",
    statusReason: "已提供附件地址，读取时校验",
    attachmentKind: "REPORT",
  };
  await page.route(/\/bridges\/10905200071\/reports$/, (r) =>
    r.fulfill({
      json: {
        code: "OK",
        data: [
          { ...metadata, id: "pdf-fixture", name: "测试PDF报告" },
          {
            ...metadata,
            id: "image-fixture",
            name: "测试桥梁图片",
            pdf: false,
            attachmentKind: "IMAGE",
            source: "BRIDGE_ATTACHMENT",
          },
        ],
      },
    }),
  );
  let pdfReads = 0;
  await page.route(/\/reports\/pdf-fixture\/file\?/, (r) => {
    pdfReads++;
    return pdfReads === 1
      ? r.fulfill({
          status: 502,
          json: { code: "REQUEST_FAILED", message: "来源附件不可访问" },
        })
      : r.fulfill({
          contentType: "application/pdf",
          headers: {
            "content-disposition":
              "attachment; filename*=UTF-8''%E6%A1%A5%E6%A2%81%E6%8A%A5%E5%91%8A.pdf",
          },
          body: "%PDF-1.4\n%%EOF",
        });
  });
  await page.route(/\/reports\/image-fixture\/file\?/, (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1kAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await enter(page);
  await page.goto("/bridges/10905200071");
  const row = page.locator(".report-row").filter({ hasText: "测试PDF报告" });
  await row.getByRole("button", { name: /测试PDF报告/ }).click();
  await expect(page.getByRole("alert")).toContainText("来源仍标记为已提供附件");
  await page.getByRole("button", { name: "重新预览", exact: true }).click();
  await expect(page.getByTitle("报告 PDF 预览")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载报告", exact: true }).click();
  expect((await pending).suggestedFilename()).toBe("桥梁报告.pdf");
  await page.locator(".ant-modal-close").click();
  await page
    .locator(".report-row")
    .filter({ hasText: "测试桥梁图片" })
    .getByRole("button", { name: /测试桥梁图片/ })
    .click();
  await expect(
    page.getByRole("img", { name: "测试桥梁图片", exact: true }),
  ).toBeVisible();
});
