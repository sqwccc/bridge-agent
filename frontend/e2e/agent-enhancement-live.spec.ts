import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

// Separate live acceptance: source selection is produced by the read-only audit script.
const evidencePath = "../runtime/agent-enhancement-evidence.json";
test("真实历史监测规则回答、曲线及解释追问", async ({ page }) => {
  test.skip(
    !existsSync(evidencePath),
    "先运行 python scripts/verify-agent-enhancement.py",
  );
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const pack = evidence.monitoring.find(
    (e: { event: string }) => e.event === "evidence",
  ).data.data["监测分析"];
  await page.goto(`/bridges/${evidence.sourceBridge}`);
  await page.getByRole("button", { name: "打开单桥问答" }).click();
  await page.getByLabel("回答方式").selectOption("rule");
  await page
    .getByLabel("桥梁问题", { exact: true })
    .fill(`设备 ${evidence.sourceDevice}，趋势，${pack.from}至${pack.to}`);
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(page.locator(".agent-progress").last()).toHaveText("回答完成");
  await expect(page.locator(".agent-answer")).toContainText(
    `有效样本 ${evidence.sourceSampleCount}`,
  );
  await expect(page.locator(".agent-chart .recharts-line-curve")).toBeVisible();
  await page.screenshot({
    path: "../runtime/agent-enhancement-live-ui.png",
    fullPage: true,
  });
  await page.getByLabel("桥梁问题", { exact: true }).fill("为什么");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(page.locator(".agent-answer").last()).toContainText("依据说明");
  await expect(page.locator(".agent-progress").last()).toHaveText("回答完成");
});
