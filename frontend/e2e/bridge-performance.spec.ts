import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";

test("真实大屏悬停档案与单桥页面共享请求和缓存", async ({ page }) => {
  const path = "/api/v1/bridges/10905200071";
  let requests = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === path) requests++;
  });
  await page.goto("/screen");
  const marker = page.locator('.map-point[data-bridge-id="10905200071"]');
  await expect(marker).toBeVisible();
  const hoverAt = Date.now();
  await marker.hover();
  await expect(page.locator(".map-card-facts")).toBeVisible();
  const hoverMs = Date.now() - hoverAt;
  expect(requests).toBe(1);
  const enterAt = Date.now();
  await page.getByRole("button", { name: "查看档案 →", exact: true }).click();
  await expect(page.locator(".bridge-health-column")).toBeVisible();
  const enterMs = Date.now() - enterAt;
  await expect(page.locator(".wanfu-drawing canvas")).toBeVisible();
  await page.waitForTimeout(300);
  expect(requests).toBe(1);
  writeFileSync(
    "../runtime/bridge-browser-performance.json",
    JSON.stringify({ hoverMs, enterMs, detailRequests: requests }, null, 2),
  );
});

test("快速划过多个标点只加载最终停留的档案", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (/^\/api\/v1\/bridges\/[^/]+$/.test(p)) requested.push(p);
  });
  await page.goto("/screen");
  await expect(page.locator(".map-point").first()).toBeVisible();
  // Dispatch in one frame to reproduce rapid traversal without Playwright's action delays.
  await page.locator(".map-point").evaluateAll((nodes) => {
    for (const n of nodes.slice(0, 5)) {
      n.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      n.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    }
    nodes[5].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  await expect(page.locator(".map-card-facts")).toBeVisible();
  expect(requested).toHaveLength(1);
});
