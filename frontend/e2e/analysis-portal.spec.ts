import { test, expect } from "@playwright/test";

test.skip(
  process.env.E2E_PORTAL_PREFIX !== "/zntmh/ql/",
  "Requires a production build served with /zntmh/ql/ and E2E_PORTAL_PREFIX=/zntmh/ql/",
);

test("门户前缀下分析模块加载、切换、刷新与重试", async ({ page }) => {
  const failures: string[] = [];
  const paths: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) => failures.push(request.url()));
  page.on("request", (request) => paths.push(new URL(request.url()).pathname));
  await page.goto("/zntmh/ql/bridges/10905200071/analysis");
  const iframe = page.locator('iframe[title="万福大桥分析模块"]');
  await expect(iframe).toHaveAttribute(
    "src",
    "/zntmh/ql/wanfu-analysis-v3.2/index.html",
  );
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  const frame = page.frameLocator('iframe[title="万福大桥分析模块"]');
  await expect(frame.locator("#mTitle")).toContainText("A1");
  await expect(frame.locator("#mNav .nav-item")).toHaveCount(9);
  for (const key of [
    "score",
    "threshold",
    "corr",
    "anomaly",
    "cable",
    "temp",
    "trend",
    "vib",
    "rules",
  ]) {
    await frame.locator(`[data-k="${key}"]`).click();
    await expect(frame.locator("#mMain")).not.toBeEmpty();
    if (key === "vib") await expect(frame.locator("#vib00 svg")).toBeVisible();
  }
  await page.reload();
  await expect(frame.locator("#mTitle")).toContainText("A1");
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(frame.locator("#mTitle")).toContainText("A1");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(paths.filter((path) => !path.startsWith("/zntmh/ql/"))).toEqual([]);
  expect(failures).toEqual([]);
});
