import { test, expect } from "@playwright/test";

test("万福健康评分对应 A1 快照，其他桥保持原评价", async ({ page }) => {
  await page.goto("/bridges/10905200071");
  const panel = page.locator(".bridge-health-column");
  await expect(panel.locator(".overall em")).toHaveText("89.2");
  for (const [zone, score] of [
    ["上部结构", "89.6"],
    ["下部结构", "91.5"],
    ["桥面系", "88.1"],
  ]) {
    const button = panel.getByRole("button", { name: new RegExp(zone) });
    await expect(button.locator("em")).toHaveText(score);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await expect(panel.getByTestId("wanfu-final-score")).toContainText(
    "最终得分 88.1 · B · 良好",
  );
  await expect(panel).toContainText("2026/10/21 23:27:04");
  await page.setViewportSize({ width: 1366, height: 900 });
  await panel.screenshot({ path: "../runtime/wanfu-health-score.png" });
  await panel.getByRole("link", { name: "查看评分依据" }).click();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#mTitle")).toContainText("A1");
  await expect(frame.locator("#mMain")).toContainText("89.2");
  await page.goto("/bridges/15032610123365813067");
  await expect(panel.locator(".overall em")).toHaveText("—");
  await expect(panel.getByTestId("wanfu-final-score")).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "查看评分依据" })).toHaveCount(
    0,
  );
});
