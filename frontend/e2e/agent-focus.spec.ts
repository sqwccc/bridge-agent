import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

for (const scope of ["network", "bridge"]) {
  test(`${scope} 两个重点入口展示真实联调结果`, async ({ page }) => {
    test.skip(
      !existsSync("../runtime/agent-focus-evidence.json"),
      "先运行 python scripts/verify-agent-focus.py --model",
    );
    const results = JSON.parse(
      readFileSync("../runtime/agent-focus-evidence.json", "utf8"),
    );
    await page.route("**/agent/status", (route) =>
      route.fulfill({
        json: { code: "OK", data: { configured: true, dataMode: "source" } },
      }),
    );
    await page.route("**/agent/ask", (route) => {
      const body = route.request().postDataJSON();
      expect(body.scope).toBe(scope);
      const topic =
        body.question === "整体数据情况" ? "data_overview" : "maintenance_plan";
      const events = results[`${scope}_${topic}`];
      if (topic === "maintenance_plan") {
        const evidence = events.find(
          (e: { event: string }) => e.event === "evidence",
        );
        evidence.data.data["资料缓存"] = { 有效秒数: 30 };
      }
      return route.fulfill({
        contentType: "text/event-stream",
        body: events
          .map(
            (e: { event: string; data: unknown }) =>
              `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`,
          )
          .join(""),
      });
    });
    await page.goto(
      scope === "network" ? "/screen" : "/bridges/15032610123365813067",
    );
    await page
      .getByRole("button", {
        name: scope === "network" ? "打开总体问答" : "打开单桥问答",
      })
      .click();
    for (const question of ["整体数据情况", "养护方案"]) {
      await page.getByRole("button", { name: question, exact: true }).click();
      await expect(page.locator(".agent-progress").last()).toHaveText(
        "回答完成",
      );
      await expect(page.locator(".agent-chart table").last()).toBeVisible();
      await expect(page.locator(".agent-answer").last()).toContainText(
        question === "整体数据情况" ? "巡检" : "验收",
      );
      if (question === "养护方案") {
        await expect(page.locator(".agent-evidence-time").last()).toContainText(
          "资料查询时间",
        );
        await expect(page.locator(".agent-evidence-time").last()).toContainText(
          "最多复用30秒",
        );
      }
    }
    await page.screenshot({
      path: `../runtime/agent-focus-${scope}.png`,
      fullPage: true,
    });
  });
}
