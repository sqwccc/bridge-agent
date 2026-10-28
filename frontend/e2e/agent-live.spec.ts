import { test, expect } from "@playwright/test";

test("真实Dify答案在完成前逐段显示", async ({ page }) => {
  test.skip(process.env.LIVE_AGENT !== "true", "显式启用真实模型调用");
  test.setTimeout(180000);
  await page.goto("/screen");
  await page.getByRole("button", { name: "打开总体问答" }).click();
  await page
    .getByLabel("桥梁问题", { exact: true })
    .fill("系统当前接入多少座桥梁？请列出各地市数量并说明统计范围。");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(page.locator(".agent-answer")).not.toBeEmpty({
    timeout: 120000,
  });
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  const partial = await page.locator(".agent-answer").innerText();
  await expect(page.locator(".agent-progress")).toHaveText("回答完成", {
    timeout: 120000,
  });
  const completed = await page.locator(".agent-answer").innerText();
  expect(completed.length).toBeGreaterThan(partial.length);
  await expect(page.locator(".agent-totals")).toContainText("131");
  await expect(page.locator(".agent-answer")).toContainText("131");
  await page.screenshot({
    path: "../runtime/agent-stream-live-browser.png",
    fullPage: true,
  });
});
