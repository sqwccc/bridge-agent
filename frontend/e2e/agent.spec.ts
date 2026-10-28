import { test, expect } from "@playwright/test";

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
test.beforeEach(async ({ page }) => {
  await page.route("**/agent/status", (route) =>
    route.fulfill({
      json: { code: "OK", data: { configured: true, dataMode: "source" } },
    }),
  );
});

test("总体问答继承页面筛选并展示流式回答和引用", async ({ page }) => {
  await page.route("**/agent/ask", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.scope).toBe("network");
    expect(body.pageFilters.city).toBe("321000");
    expect(route.request().headers()).toHaveProperty("x-csrf-token");
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        frame("meta", { conversationId: "conversation-one" }) +
        frame("plan", { route: "business_query", topic: "overview" }) +
        frame("evidence", {
          data: { total: 43 },
          references: [
            { id: "E1", label: "桥梁档案", url: "/bridges/10905200071" },
          ],
        }) +
        frame("delta", { text: "当前接入 **43 座**" }) +
        frame("delta", { text: "扬州桥梁。" }) +
        frame("done", {}),
    });
  });
  await page.goto("/screen?city=321000");
  await page.getByRole("button", { name: "打开总体问答" }).click();
  await page.getByRole("button", { name: "接入桥梁概况", exact: true }).click();
  await expect(page.locator(".agent-answer")).toContainText("43 座扬州桥梁");
  await expect(page.locator(".agent-answer strong")).toHaveText("43 座");
  await expect(
    page.getByRole("link", { name: "[E1] 桥梁档案", exact: true }),
  ).toHaveAttribute("href", "/bridges/10905200071");
  await page.screenshot({
    path: "../runtime/agent-network-ui.png",
    fullPage: true,
  });
});

test("单桥问答从问题提取日期并保留受控会话", async ({ page }) => {
  let count = 0;
  await page.route("**/agent/ask", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.scope).toBe("bridge");
    expect(body.bridgeId).toBe("320591-03664");
    expect(body).not.toHaveProperty("from");
    expect(body).not.toHaveProperty("to");
    if (!count)
      expect(body.question).toBe("查询2026年10月1日至10月26日的巡检情况");
    if (count++) expect(body.conversationId).toBe("single-conversation");
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        frame("meta", { conversationId: "single-conversation" }) +
        frame("delta", { text: "查询完成，检查结果未提供，不能判断正常。" }) +
        frame("done", {}),
    });
  });
  await page.goto("/bridges/320591-03664");
  await page.getByRole("button", { name: "打开单桥问答" }).click();
  await expect(page.locator('.agent-chat input[type="date"]')).toHaveCount(0);
  await expect(
    page.getByText(
      "查询系统当前接入范围内的有效桥梁；总体不代表全省全部桥梁。回答附查询条件和来源。",
      { exact: true },
    ),
  ).toHaveCount(0);
  await page
    .getByLabel("桥梁问题", { exact: true })
    .fill("查询2026年10月1日至10月26日的巡检情况");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(page.locator(".agent-answer")).toContainText("检查结果未提供");
  await page
    .getByLabel("桥梁问题", { exact: true })
    .fill("为什么不能判断正常？");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(page.locator(".agent-message")).toHaveCount(2);
  await expect(page.locator(".agent-progress").last()).toHaveText("回答完成");
});

test("流中断保留部分回答并允许重试", async ({ page }) => {
  await page.route("**/agent/ask", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: frame("delta", { text: "已生成部分内容" }),
    }),
  );
  await page.goto("/screen");
  await page.getByRole("button", { name: "打开总体问答" }).click();
  await page.getByRole("button", { name: "接入桥梁概况", exact: true }).click();
  await expect(page.locator(".agent-answer")).toContainText("已生成部分内容");
  await expect(page.getByRole("alert")).toContainText("回答未完成");
  await expect(page.getByRole("button", { name: "重新生成" })).toBeEnabled();
});

test("未配置时禁止提交", async ({ page }) => {
  await page.route("**/agent/status", (route) =>
    route.fulfill({
      json: { code: "OK", data: { configured: false, dataMode: "demo" } },
    }),
  );
  await page.goto("/screen");
  await page.getByRole("button", { name: "打开总体问答" }).click();
  await expect(
    page.getByRole("button", { name: "接入桥梁概况", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("尚未配置 Dify");
});

test("用户可以停止未完成请求", async ({ page }) => {
  await page.route("**/agent/ask", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route
      .fulfill({ contentType: "text/event-stream", body: frame("done", {}) })
      .catch(() => {});
  });
  await page.goto("/screen");
  await page.getByRole("button", { name: "打开总体问答" }).click();
  await page.getByRole("button", { name: "接入桥梁概况", exact: true }).click();
  await page.getByRole("button", { name: "停止生成" }).click();
  await expect(page.getByRole("alert")).toContainText("已停止生成");
  await expect(
    page.getByRole("button", { name: "发送问题", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "新对话", exact: true }),
  ).toBeEnabled();
});
