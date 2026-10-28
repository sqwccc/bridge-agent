import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import type { Page as ApiPage } from "../src/api/client";
import type {
  WorkRecord,
  WorkDetail,
  QualityAssessment,
  QualityIssue,
} from "../src/api/work";
import type { Report } from "../src/api/types";

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
  const response = await page.request.get(`/api/v1/${path}`, {
    timeout: 30000,
  });
  expect(response.ok(), path + " " + (await response.text())).toBe(true);
  return (await response.json()).data;
}

test("三期接口：分页、日期、归属、业务关联和原始数据质量口径", async ({
  page,
}) => {
  test.setTimeout(240000);
  await enter(page);
  const path = "bridges/320591-03664/records/patrols";
  const first = await get<ApiPage<WorkRecord>>(page, path + "?size=8");
  expect(first.total).toBe(1206);
  expect(first.items).toHaveLength(8);
  expect(
    first.items.every(
      (r) =>
        r.bridgeId === "320591-03664" &&
        r.result === null &&
        r.dataIssues.length > 0,
    ),
  ).toBe(true);
  expect(JSON.stringify(first)).not.toMatch(/attachmentRaw|matchingTotal/);
  const next = await get<ApiPage<WorkRecord>>(page, path + "?size=8&page=2");
  expect(next.total).toBe(first.total);
  expect(next.items.every((r) => !first.items.some((p) => p.id === r.id))).toBe(
    true,
  );
  const dated = await get<ApiPage<WorkRecord>>(
    page,
    path + "?from=2026-10-01&to=2026-10-08",
  );
  expect(dated.total).toBeGreaterThan(0);
  expect(
    dated.items.every(
      (r) => r.occurredAt! >= "2026-10-01" && r.occurredAt! < "2026-10-09",
    ),
  ).toBe(true);
  const detail = await get<WorkDetail>(
    page,
    path + "/" + encodeURIComponent(first.items[0].id),
  );
  expect(detail.record.id).toBe(first.items[0].id);
  expect(detail.relationStatus).toBe("NOT_APPLICABLE");
  expect(JSON.stringify(detail)).not.toContain("attachmentRaw");
  const borrowed = await page.request.get(
    "/api/v1/bridges/QXQR001A/records/patrols/" +
      encodeURIComponent(first.items[0].id),
  );
  expect(borrowed.status()).toBe(404);
  for (const kind of ["defects", "maintenance"]) {
    const records = await get<ApiPage<WorkRecord>>(
      page,
      `bridges/15032610123365813067/records/${kind}?size=8`,
    );
    expect(records.total).toBeGreaterThan(0);
    const r = records.items[0];
    const filtered = await get<ApiPage<WorkRecord>>(
      page,
      `bridges/15032610123365813067/records/${kind}?status=${r.status}`,
    );
    expect(filtered.items.every((f) => f.status === r.status)).toBe(true);
    const d = await get<WorkDetail>(
      page,
      `bridges/15032610123365813067/records/${kind}/${encodeURIComponent(r.id)}`,
    );
    expect(
      d.relatedRecords.items.every(
        (f) =>
          f.bridgeId === "15032610123365813067" &&
          f.cityCode === r.cityCode &&
          f.code === r.code,
      ),
    ).toBe(true);
    if (kind === "maintenance")
      expect(d.relationStatus).toBe(
        d.relatedRecords.total === 1
          ? "UNIQUE"
          : d.relatedRecords.total === 0
            ? "UNMATCHED"
            : "AMBIGUOUS",
      );
    expect(
      d.attachments.every((a) =>
        ["SOURCE_NOT_CONFIGURED", "UNSUPPORTED_SOURCE"].includes(a.status),
      ),
    ).toBe(true);
  }
  for (const [kind, raw, mapped, unmatched] of [
    ["patrols", 23345, 23345, 0],
    ["defects", 722, 722, 0],
    ["maintenance", 484, 484, 0],
  ] as const) {
    const q = await get<QualityAssessment>(
      page,
      `data-quality/records?kind=${kind}`,
    );
    expect(q.scope).toBe("RAW_IMPORT");
    expect(q.checkedAt).toBeTruthy();
    expect(q.profile.rawRows).toBe(raw);
    expect(q.profile.mappedRows).toBe(mapped);
    expect(q.profile.unmatchedRows).toBe(unmatched);
    expect(q.profile.duplicateExcess).toBe(0);
    const issues = await get<ApiPage<QualityIssue>>(
      page,
      `data-quality/records/issues?kind=${kind}&issue=UNMATCHED_BRIDGE&size=8`,
    );
    expect(issues.total).toBe(unmatched);
    expect(
      issues.items.every(
        (r) => r.bridgeId === null && r.issues.includes("UNMATCHED_BRIDGE"),
      ),
    ).toBe(true);
    if (kind === "maintenance")
      expect(
        q.relations!.uniqueMaintenance +
          q.relations!.unmatchedMaintenance +
          q.relations!.ambiguousMaintenance +
          q.relations!.missingReferenceKeys,
      ).toBe(mapped);
  }
  for (const query of [
    "?page=0",
    "?size=101",
    "?from=2026-10-08&to=2026-01-01",
    "?status=1",
  ]) {
    expect((await page.request.get("/api/v1/" + path + query)).status()).toBe(
      400,
    );
  }
  expect(
    (await page.request.get("/api/v1/bridges/none/records/patrols")).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(
        "/api/v1/bridges/15032610123365813067/records/unknown",
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get("/api/v1/data-quality/records?city=110100")
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get("/api/v1/data-quality/records/issues?issue=bad")
    ).status(),
  ).toBe(400);
});

test("三期页面：档案入口、业务筛选与详情、质量追溯及全高清和4K布局", async ({
  page,
}) => {
  test.setTimeout(180000);
  await enter(page);
  mkdirSync("../runtime/screenshots", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/bridges/15032610123365813067");
  await page.getByRole("link", { name: "巡检 · 病害 · 维修记录 →" }).click();
  await page.getByRole("button", { name: "检测病害", exact: true }).click();
  await expect(page.locator(".work-table tbody tr").first()).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "查看详情", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("来源记录标识", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("业务追溯", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("dialog").locator(".ant-modal-close").click();
  await page.getByLabel("业务开始日期").fill("2026-10-08");
  await page.getByLabel("业务结束日期").fill("2026-01-01");
  await page.getByRole("button", { name: "查询记录" }).click();
  await expect(page.getByRole("alert")).toHaveText("开始日期不能晚于结束日期");
  await page.getByRole("button", { name: "重置条件" }).click();
  await page.getByLabel("业务开始日期").fill("2099-01-01");
  await page.getByRole("button", { name: "查询记录" }).click();
  await expect(
    page.getByText("当前条件下没有可确认归属的有效记录。"),
  ).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.getByLabel("业务开始日期")).toHaveValue("2099-01-01");
  await page.getByRole("button", { name: "重置条件" }).click();
  await expect(page.locator(".work-table tbody tr").first()).toBeVisible({
    timeout: 30000,
  });
  await page.screenshot({
    path: "../runtime/screenshots/phase-three-defects.png",
  });
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.screenshot({
    path: "../runtime/screenshots/phase-three-records-4k.png",
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole("link", { name: "数据质量", exact: true }).click();
  await expect(
    page
      .locator(".quality-overview > div")
      .filter({ hasText: /^原始行/ })
      .locator("strong"),
  ).toHaveText("23,345", { timeout: 30000 });
  await expect(
    page.locator(".quality-table-scroll tbody tr").first(),
  ).toContainText("业务必需信息缺失");
  await page.getByRole("button", { name: /检查结果缺失/ }).click();
  await expect(
    page.locator(".quality-table-scroll tbody tr").first(),
  ).toContainText("业务必需信息缺失", { timeout: 30000 });
  await page.getByRole("button", { name: "维修养护", exact: true }).click();
  await expect(page.locator(".quality-relations")).toContainText(
    "唯一关联病害",
    { timeout: 30000 },
  );
  await expect(
    page.getByText("当前范围未发现所选类型问题。", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({
    path: "../runtime/screenshots/phase-three-quality.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("三期记录详情：歧义关联和附件读取失败、图片预览", async ({ page }) => {
  test.setTimeout(90000);
  await enter(page);
  const record = {
    id: "M",
    kind: "maintenance",
    cityCode: "320100",
    bridgeId: "UI-BRIDGE",
    bridgeName: "联调样桥",
    sourceBridgeKey: "TEST",
    occurredAt: "2025-01-01T00:00:00",
    sourceUpdatedAt: "2025-01-02T00:00:00",
    syncStatus: "U",
    code: "BH",
    status: 4,
    statusName: "整改完成",
    maintenanceType: 1,
    maintenanceTypeName: "保养小修",
    unit: "养护单位",
    attachmentProvided: true,
    dataIssues: [],
  } as WorkRecord;
  const report = {
    id: "attachment",
    name: "维修后照片",
    status: "AVAILABLE",
    attachmentKind: "IMAGE",
    pdf: false,
    statusReason: "已提供附件地址，读取时继续校验文件",
  } as Report;
  await page.route("**/api/v1/bridges/UI-BRIDGE", (route) =>
    route.fulfill({
      json: {
        code: "OK",
        data: { id: "UI-BRIDGE", name: "联调样桥" },
      },
    }),
  );
  await page.route("**/api/v1/bridges/UI-BRIDGE/records/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/file")) {
      await route.fulfill({
        status: 502,
        json: { message: "来源附件不可访问" },
      });
      return;
    }
    if (url.pathname.endsWith("/maintenance/M")) {
      await route.fulfill({
        json: {
          code: "OK",
          data: {
            record,
            attachments: [report],
            relatedRecords: { items: [], total: 2, page: 1, size: 20 },
            relationStatus: "AMBIGUOUS",
            relationReason:
              "本桥同一病害编号对应多条记录，仅列候选，不认定唯一病害",
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        code: "OK",
        data: { items: [record], total: 1, page: 1, size: 12 },
      },
    });
  });
  await page.goto("/bridges/UI-BRIDGE/records?kind=maintenance");
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  await expect(
    page.getByText("本桥同一病害编号对应多条记录，仅列候选，不认定唯一病害", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "预览附件", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("来源附件不可访问");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3V8AAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("**/attachments/attachment/file?*", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: png,
      headers: {
        "content-disposition":
          "inline; filename*=UTF-8''%E7%BB%B4%E4%BF%AE%E5%90%8E%E7%85%A7%E7%89%87.png",
      },
    }),
  );
  await page.getByRole("button", { name: "预览附件", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "维修后照片", exact: true }),
  ).toBeVisible();
  await page.getByRole("dialog").last().locator(".ant-modal-close").click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载附件", exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe("维修后照片.png");
});
