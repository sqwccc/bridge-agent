import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import type { Bridge, Dashboard } from "../src/api/types";
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

test("BCI和BSI按养护类别独立分组，冲突不进入正常等级", async ({ page }) => {
  await enter(page);
  const data = await get<Dashboard>(page, "dashboard");
  for (const categories of [
    data.conditionGradeCategories,
    data.structureGradeCategories,
  ]) {
    expect(categories.map((c) => c.code)).toEqual(["I", "II_V", "unknown"]);
    expect(categories.map((c) => c.total)).toEqual([27, 93, 11]);
    expect(categories.reduce((sum, c) => sum + c.total, 0)).toBe(data.total);
    for (const c of categories)
      expect(c.grades.reduce((sum, g) => sum + g.count, 0)).toBe(c.total);
  }
  expect(
    data.conditionGradeCategories[0].grades.find((g) => g.code === "1")?.count,
  ).toBe(8);
  expect(
    data.conditionGradeCategories[1].grades.find((g) => g.code === "other")
      ?.count,
  ).toBe(59);
  expect(
    data.structureGradeCategories.map(
      (c) => c.grades.find((g) => g.code === "other")?.count,
    ),
  ).toEqual([11, 46, 11]);
  for (const [name, button] of [
    ["完好状况", "完好状况 BCI"],
    ["结构状况", "结构状况 BSI"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(
      page.getByRole("button", { name: button, exact: true }),
    ).toHaveClass("active");
    await expect(page.locator(".assessment-category")).toHaveCount(3);
    const unknown = page.getByRole("region", {
      name: `${name} 养护类别未明确`,
      exact: true,
    });
    await expect(unknown).toContainText("11 座");
    await expect(unknown.locator(".assessment-bars, button")).toHaveCount(0);
    const one = page.getByRole("region", {
      name: `${name} Ⅰ类养护`,
      exact: true,
    });
    const others = page.getByRole("region", {
      name: `${name} Ⅱ～Ⅴ类养护`,
      exact: true,
    });
    await expect(
      one.getByRole("button", {
        name: `${name} Ⅰ类养护 合格 ${name === "完好状况" ? 8 : 16}座`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(one.locator(".grade-row > span")).toHaveText([
      "合格",
      "不合格",
      "其他",
    ]);
    await expect(others.locator(".grade-row > span")).toHaveText([
      "A级",
      "B级",
      "C级",
      "D级",
      "E级",
      "其他",
    ]);
  }
  mkdirSync("../runtime/screenshots", { recursive: true });
  await page.screenshot({
    path: "../runtime/screenshots/assessment-bsi-1080.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "完好状况 BCI", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "完好状况 Ⅰ类养护 合格 8座",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "../runtime/screenshots/assessment-bci-1080.png",
    animations: "disabled",
  });
  await page.locator(".technical-panel").screenshot({
    path: "../runtime/screenshots/assessment-bci-panel.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("类别和异常点击筛选与列表一致，并保留刷新与返回状态", async ({ page }) => {
  test.setTimeout(180000);
  await enter(page);
  const cases = [
    { category: "I", grade: "1", name: "完好状况 Ⅰ类养护 合格 8座", count: 8 },
    {
      category: "I",
      grade: "other",
      name: "完好状况 Ⅰ类养护 其他 19座",
      count: 19,
    },
    {
      category: "II_V",
      grade: "other",
      name: "完好状况 Ⅱ～Ⅴ类养护 其他 59座",
      count: 59,
    },
  ];
  for (const c of cases) {
    await page.goto("/screen");
    await page.getByRole("button", { name: c.name, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`assessmentCategory=${c.category}`),
    );
    await expect(page).toHaveURL(new RegExp(`conditionGrade=${c.grade}`));
    await expect(page.locator(".kpi").first()).toContainText(String(c.count));
    const rows = await get<ApiPage<Bridge>>(
      page,
      `bridges?assessmentCategory=${c.category}&conditionGrade=${c.grade}&size=100`,
    );
    expect(rows.total).toBe(c.count);
    expect(rows.items.every((b) => b.hasMonitoringDevices)).toBe(true);
    if (c.category === "I")
      expect(
        rows.items.every(
          (b) =>
            b.maintenanceCategory === 1 &&
            (c.grade === "1"
              ? b.conditionGrade?.trim() === "1"
              : !["1", "2"].includes(b.conditionGrade?.trim() || "")),
        ),
      ).toBe(true);
    if (c.category === "II_V")
      expect(
        rows.items.every(
          (b) =>
            (b.maintenanceCategory ?? 0) >= 2 &&
            (b.maintenanceCategory ?? 0) <= 5 &&
            !["3", "4", "5", "6", "7"].includes(b.conditionGrade?.trim() || ""),
        ),
      ).toBe(true);
    await page.reload();
    const selected = page.getByRole("button", { name: c.name, exact: true });
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await selected.click();
    await expect(page).not.toHaveURL(/assessmentCategory=/);
    await expect(page.locator(".kpi").first()).toContainText("131");
  }
});

test("健康度统计区分评价体系，与左侧同步切换并联动筛选", async ({ page }) => {
  await enter(page);
  const panel = page.locator(".health-overview-panel");
  await expect(panel.locator(".panel-title")).toContainText("当前 131 座");
  await expect(panel.locator(".health-ring-total")).toHaveText(["27", "93"]);
  await expect(panel.locator(".health-category").first()).toContainText(
    "安全评估结论",
  );
  await expect(
    panel.locator(".health-category").nth(1).locator(".health-state span"),
  ).toHaveText([
    "A级 完好",
    "B级 良好",
    "C级 合格",
    "D级 不合格",
    "E级 危险",
    "其他",
  ]);
  await expect(
    panel.locator(".health-category").first().locator(".health-state b"),
  ).toHaveText(["8", "0", "19"]);
  await expect(
    panel.locator(".health-category").nth(1).locator(".health-state b"),
  ).toHaveText(["12", "6", "16", "0", "0", "59"]);
  await expect(panel.locator(".health-unknown")).toContainText("11 座");
  await expect(
    panel.locator(".health-unknown svg, .health-unknown button"),
  ).toHaveCount(0);
  await expect(panel.locator(".health-state").first()).toHaveAttribute(
    "title",
    /29.6%/,
  );
  await panel
    .getByRole("button", { name: "健康度统计：结构状况 BSI", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "结构状况 BSI", exact: true }),
  ).toHaveClass("active");
  await expect(
    panel.locator(".health-category").first().locator(".health-state b"),
  ).toHaveText(["16", "0", "11"]);
  await expect(
    panel.locator(".health-category").nth(1).locator(".health-state b"),
  ).toHaveText(["22", "4", "18", "0", "3", "46"]);
  const qualified = panel.getByRole("button", {
    name: "BSI Ⅰ类养护 合格 16座",
    exact: true,
  });
  await qualified.click();
  await expect(page).toHaveURL(/assessmentCategory=I/);
  await expect(page).toHaveURL(/structureGrade=1/);
  await expect(page.locator(".kpi").first()).toContainText("16");
  await expect(qualified).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", {
      name: "结构状况 Ⅰ类养护 合格 16座",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await qualified.click();
  await expect(page).not.toHaveURL(/assessmentCategory=|structureGrade=/);
  await expect(panel.locator(".panel-title")).toContainText("当前 131 座");
  await page.getByRole("button", { name: "完好状况 BCI", exact: true }).click();
  await expect(
    panel.getByRole("button", {
      name: "健康度统计：完好状况 BCI",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  mkdirSync("../runtime/screenshots", { recursive: true });
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        panel
          .locator(".panel-body")
          .evaluate(
            (el) =>
              el.scrollWidth <= el.clientWidth &&
              el.scrollHeight <= el.clientHeight,
          ),
      )
      .toBe(true);
    const lastGroup = await panel
      .locator(".health-category")
      .last()
      .boundingBox();
    const unknown = await panel.locator(".health-unknown").boundingBox();
    expect(lastGroup!.y + lastGroup!.height).toBeLessThanOrEqual(unknown!.y);
    await panel.screenshot({
      path: `../runtime/screenshots/health-overview-${size.width}.png`,
      animations: "disabled",
    });
    await page.screenshot({
      path: `../runtime/screenshots/health-screen-${size.width}.png`,
      animations: "disabled",
    });
  }
});

test("健康度接口失败显示错误，重试后恢复真实数据", async ({ page }) => {
  const dashboard = /\/api\/v1\/dashboard(?:\?|$)/;
  await page.route(dashboard, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "UNAVAILABLE",
        message: "评价数据暂不可用",
        data: null,
      }),
    }),
  );
  await enter(page);
  const panel = page.locator(".health-overview-panel");
  await expect(panel.getByRole("alert")).toContainText("评价数据暂不可用");
  await expect(panel.locator(".health-category-ring")).toHaveCount(0);
  await expect(panel.locator(".panel-title")).not.toContainText("0 座");
  await page.unroute(dashboard);
  await panel.getByRole("button", { name: "重新加载", exact: true }).click();
  await expect(panel.locator(".health-ring-total")).toHaveText(["27", "93"]);
  await expect(panel.getByRole("alert")).toHaveCount(0);
});
