import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const account = JSON.parse(
  readFileSync(path.resolve("../runtime/local-account.json"), "utf8").replace(
    /^\uFEFF/,
    "",
  ),
) as { username: string; password: string };

// 即使本地开启只读预览，也在浏览器中启用门禁，验证真实登录/退出接口。
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/config", (route) =>
    route.fulfill({ json: { code: "OK", data: { previewEnabled: false } } }),
  );
});

test("登录、地图筛选、桥梁下钻、刷新和退出", async ({ page }) => {
  // 准备：独立浏览器上下文，不继承登录状态。
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/screen");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("账号", { exact: true }).fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "登录驾驶舱" }).click();
  await expect(page.getByRole("alert")).toContainText("账号或密码错误");
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录驾驶舱" }).click();
  await expect(page).toHaveURL(/screen/);
  await expect(page.locator(".kpi").first()).toContainText("131", {
    timeout: 30000,
  });
  await expect(
    page.getByRole("img", { name: "江苏省桥梁分布地图" }),
  ).toBeVisible();
  // 实际鼠标点击单点，防止 SVG 捕获指针导致桥梁点击被父节点吞掉。
  const singles = page.locator('.map-point circle[r="3.2"]');
  const clickable = await singles.evaluateAll((nodes) =>
    nodes.findIndex((node) => {
      const r = node.getBoundingClientRect();
      return (
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
        node
      );
    }),
  );
  expect(clickable).toBeGreaterThanOrEqual(0);
  await singles.nth(clickable).click();
  await expect(page).toHaveURL(/bridges\//);
  await page.getByRole("link", { name: "返回路网" }).click();
  mkdirSync(path.resolve("../runtime/screenshots"), { recursive: true });
  await page.screenshot({
    path: "../runtime/screenshots/network-1080.png",
    fullPage: true,
  });
  // 执行：中文关键字过滤后下钻，再刷新验证路由可独立加载。
  await page.getByRole("searchbox", { name: "桥梁搜索" }).fill("万福");
  await page.getByRole("searchbox", { name: "桥梁搜索" }).press("Enter");
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator(".bridge-table")).toHaveCount(0);
  await expect(
    page.locator('[data-search-match="true"]').first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看桥梁清单", exact: true }).click();
  await expect(page.locator(".bridge-table .text-link").first()).toBeVisible();
  await page.locator(".bridge-table .text-link").first().click();
  await expect(page).toHaveURL(/bridges\//);
  await page.getByRole("button", { name: "基础档案", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "桥梁基础档案" }),
  ).toBeVisible();
  await page.reload();
  await page.locator(".archive-drawer .ant-drawer-close").click();
  await expect(
    page.getByRole("heading", { name: "BIM 结构模型" }),
  ).toBeVisible();
  await expect(page.getByText("正在读取测点…")).toHaveCount(0);
  await expect(page.getByText("正在读取报告…")).toHaveCount(0);
  await page.screenshot({
    path: "../runtime/screenshots/bridge-1080.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "返回路网" }).click();
  await expect(page.getByRole("searchbox", { name: "桥梁搜索" })).toHaveValue(
    "万福",
  );
  await page.locator(".bridge-list-drawer .ant-drawer-close").click();
  // 验证：清除条件、4K无横向溢出、退出后不能再次访问数据页。
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await page.setViewportSize({ width: 3840, height: 2160 });
  await expect(page.locator(".kpi").first()).toContainText("131");
  await page.screenshot({
    path: "../runtime/screenshots/network-4k.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto("/screen");
  await expect(page).toHaveURL(/login/);
  expect(errors).toEqual([]);
});

test("单桥历史报警、无监测值、报告来源缺失及空搜索", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("账号", { exact: true }).fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录驾驶舱" }).click();
  await expect(page).toHaveURL(/screen/);
  await page.goto("/bridges/10020200311");
  await expect(
    page.getByText("所选区间暂无监测值", { exact: false }).first(),
  ).toBeVisible({ timeout: 30000 });
  await page.locator(".monitor-history > summary").click();
  await page.getByLabel("监测开始时间").fill("2026-10-20T00:00");
  await page.getByLabel("监测结束时间").fill("2026-10-01T00:00");
  await page
    .locator(".monitor-panel")
    .getByRole("button", { name: "查询", exact: true })
    .click();
  await expect(
    page.locator(".monitor-panel").getByRole("alert").first(),
  ).toBeVisible();
  await page.goto("/bridges/10905200071");
  await expect(page.getByText("附件来源未配置")).toBeVisible();
  await page.goto("/screen");
  await expect(page.getByLabel("报警开始时间")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "查询历史" })).toHaveCount(0);
  await expect(
    page.locator(".alarm-panel .data-table tbody tr").first(),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("searchbox", { name: "桥梁搜索" })
    .fill("不存在的桥梁-xyz");
  await page.getByRole("searchbox", { name: "桥梁搜索" }).press("Enter");
  await expect(page.getByText("没有匹配的桥梁")).toBeVisible();
});

test("来源故障显示错误并可重试恢复，不能显示成零座桥梁", async ({ page }) => {
  await page.route(/\/api\/v1\/dashboard(\?|$)/, (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "SOURCE_UNAVAILABLE",
        message: "数据服务暂不可用，请稍后重试",
        data: null,
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("账号", { exact: true }).fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录驾驶舱" }).click();
  await expect(page.getByRole("alert")).toContainText("数据服务暂不可用", {
    timeout: 15000,
  });
  await expect(page.locator(".kpi").first()).toContainText("—");
  await page.unroute(/\/api\/v1\/dashboard(\?|$)/);
  await page
    .getByRole("alert")
    .getByRole("button", { name: "重新加载" })
    .click();
  await expect(page.locator(".kpi").first()).toContainText("131");
});

test("隔离监测夹具：数值曲线与缺测断点正常渲染", async ({ page }) => {
  // 仅浏览器测试拦截，不向任何来源库写入演示值。
  await page.route(/\/monitoring\/samples\?/, (route) =>
    route.fulfill({
      json: {
        code: "OK",
        message: "测试夹具",
        data: {
          items: [
            { time: "2026-10-01T00:00:00", rawValue: "0", value: 0 },
            { time: "2026-10-01T00:01:00", rawValue: "2", value: 2 },
            { time: "2026-10-01T00:02:00", rawValue: "离线", value: null },
            { time: "2026-10-01T00:03:00", rawValue: "4", value: 4 },
            { time: "2026-10-01T00:04:00", rawValue: "5", value: 5 },
          ],
          truncated: false,
          timezone: "Asia/Shanghai",
        },
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("账号", { exact: true }).fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录驾驶舱" }).click();
  await expect(page).toHaveURL(/screen/);
  await page.goto("/bridges/10020200311");
  await expect(
    page.locator(".monitor-panel .recharts-line-curve").first(),
  ).toBeVisible();
  await expect(
    page.locator(".monitor-panel .panel-foot").first(),
  ).toContainText("非数值 1 个");
  const curve = await page
    .locator(".monitor-panel .recharts-line-curve")
    .first()
    .getAttribute("d");
  expect(curve?.match(/M/g)?.length).toBe(2);
});
