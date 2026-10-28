import { test, expect } from "@playwright/test";

test("搜索仅高亮地图桥梁，清空后恢复，清单由按钮打开", async ({ page }) => {
  const listRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/v1\/bridges\?/.test(request.url()))
      listRequests.push(request.url());
  });
  await page.goto("/screen");
  const markers = page.locator(".map-point");
  await expect(markers.first()).toBeVisible();
  const count = await markers.count();
  const search = page.getByRole("searchbox", { name: "桥梁搜索" });
  await search.fill("万福");
  await search.press("Enter");
  await expect(
    page.locator('[data-search-match="true"]').first(),
  ).toBeVisible();
  await expect(page.locator(".bridge-table")).toHaveCount(0);
  await expect(markers).toHaveCount(count);
  await expect(page).not.toHaveURL(/list=1/);
  await page.reload();
  await expect(
    page.locator('[data-search-match="true"]').first(),
  ).toBeVisible();
  await expect(page.locator(".bridge-table")).toHaveCount(0);
  await search.fill("不存在的桥梁xyz987");
  await search.press("Enter");
  await expect(page.locator(".map-panel .panel-title")).toContainText(
    "匹配 0 座",
  );
  await expect(page.locator('[data-search-match="true"]')).toHaveCount(0);
  await expect(markers).toHaveCount(count);
  await search.fill("");
  await expect(page).not.toHaveURL(/q=/);
  await expect(page.locator('.map-point[opacity="1"]')).toHaveCount(count);
  expect(listRequests).toHaveLength(0);
  await page.getByRole("button", { name: "查看桥梁清单", exact: true }).click();
  await expect(page.locator(".bridge-table")).toBeVisible();
  await expect(page.locator(".bridge-table .text-link").first()).toBeVisible();
  expect(listRequests).toHaveLength(1);
});

test("原型布局：地图占据中心，底数和分类通过抽屉保留", async ({ page }) => {
  await page.goto("/screen");
  await expect(page.locator(".kpi").first()).toContainText("131");
  expect(
    await page
      .locator(".map-frame")
      .evaluate((e) => e.getBoundingClientRect().height),
  ).toBeGreaterThan(750);
  await expect(page.locator(".bridge-table")).toHaveCount(0);
  await page.getByRole("button", { name: "查看桥梁清单", exact: true }).click();
  await expect(page.locator(".bridge-table .text-link").first()).toBeVisible();
  await page.locator(".bridge-list-drawer .ant-drawer-close").click();
  await page.getByRole("button", { name: "筛选与分类", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "地市筛选", exact: true }),
  ).toBeVisible();
  await page.locator(".filters-drawer .ant-drawer-close").click();
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
    [3840, 2160],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
});

test("单桥布局：历史图片绑定本桥，完整档案保留刷新入口", async ({ page }) => {
  await page.goto("/bridges/10905200071");
  await expect(page.locator(".wanfu-drawing canvas")).toBeVisible();
  expect(
    await page
      .locator(".bridge-visual-panel")
      .evaluate((e) => e.getBoundingClientRect().height),
  ).toBeGreaterThan(800);
  expect(
    await page
      .locator(".bridge-health-column")
      .evaluate((e) => e.getBoundingClientRect().height),
  ).toBeGreaterThan(900);
  await expect(page.locator(".structure-disclaimer")).toContainText("非实时");
  await page.getByRole("button", { name: "实拍图", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "万福大桥历史实拍资料", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "完整档案", exact: true }).click();
  await expect(page.locator(".archive-facts")).toBeVisible();
  await page.reload();
  await expect(page.locator(".archive-facts")).toBeVisible();
  await page.goto("/bridges/02000102281");
  await expect(page.locator(".structure-svg")).toBeVisible();
  await expect(page.getByRole("img", { name: /万福大桥/ })).toHaveCount(0);
});

test("指标行隔离：不同单位分别显示，切换测点不影响其他指标", async ({
  page,
}) => {
  const points = [
    {
      pointId: "p1",
      deviceId: "d1",
      metric: "D",
      metricName: "位移",
      unit: "mm",
    },
    {
      pointId: "p2",
      deviceId: "d2",
      metric: "D",
      metricName: "位移",
      unit: "mm",
    },
    {
      pointId: "p3",
      deviceId: "d3",
      metric: "D",
      metricName: "位移",
      unit: "cm",
    },
    {
      pointId: "p4",
      deviceId: "d4",
      metric: "T",
      metricName: "温度",
      unit: "℃",
    },
  ].map((p) => ({
    ...p,
    pointName: p.pointId,
    deviceName: p.deviceId,
    unitBasis: "SOURCE",
    deviceType: null,
    deviceModel: null,
    sourceDeviceStatus: null,
    sourceUpdatedAt: null,
  }));
  await page.route("**/bridges/02000102281/monitoring/points", (r) =>
    r.fulfill({ json: { code: "OK", data: points } }),
  );
  await page.route(/\/monitoring\/samples\?/, (r) =>
    r.fulfill({
      json: {
        code: "OK",
        data: { items: [], truncated: false },
      },
    }),
  );
  await page.goto("/bridges/02000102281");
  const rows = page.locator(".metric-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("单位：mm");
  await expect(rows.nth(1)).toContainText("单位：cm");
  await expect(rows.nth(2)).toContainText("单位：℃");
  await rows.nth(0).getByRole("combobox").click();
  const pending = page.waitForRequest(
    (r) =>
      r.url().includes("/monitoring/samples?") &&
      new URL(r.url()).searchParams.get("device") === "d2",
  );
  await page.getByTitle("p2 / d2", { exact: true }).click();
  await pending;
  await expect(rows.nth(0)).toContainText("p2 / d2");
  await expect(rows.nth(1)).toContainText("p3 / d3");
  await expect(rows.nth(2)).toContainText("p4 / d4");
  await expect(page.locator(".recharts-line-curve")).toHaveCount(0);
});
