import { test, expect } from "@playwright/test";

test("九个分析模块使用本地快照并正常交互", async ({ page }) => {
  const errors: string[] = [];
  const calls: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => calls.push(request.url()));
  await page.goto("/bridges/10905200071/analysis");
  const frame = page.frameLocator('iframe[title="万福大桥分析模块"]');
  await expect(frame.locator("#mTitle")).toContainText("A1");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(frame.locator("#mNav .nav-item")).toHaveCount(9);
  await expect(page.locator("iframe")).toHaveAttribute(
    "sandbox",
    "allow-scripts",
  );
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
    if (key === "vib") await expect(frame.locator("#vib00 svg")).toBeVisible();
    await expect(frame.locator("#mMain")).not.toBeEmpty();
    await expect(frame.locator("#mMain")).not.toContainText("NaN");
    await page.screenshot({
      path: `../runtime/analysis-${key}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
  expect(
    calls.filter((url) => /\/api\/v1\//.test(url) && !/\/auth\//.test(url)),
  ).toEqual([]);
});

test("参数调整、恢复默认与窗口缩放", async ({ page }) => {
  await page.goto("/bridges/10905200071/analysis");
  const f = page.frameLocator("iframe");
  await expect(f.locator("#rFr")).toHaveValue("1.00");
  await f.locator('[data-w="super"]').fill("40");
  await expect(f.locator("#w1_super")).toHaveText("40.0%");
  await f.locator("#wReset").click();
  await expect(f.locator("#w1_super")).toHaveText("34.4%");
  await f.locator("#rFr").fill("1.10");
  await expect(f.locator("#sFr")).toContainText("100.0");
  await f.locator("#applyAll").click();
  await expect(f.locator("#analysisToast")).toContainText("本页分析");
  await f.locator('[data-k="threshold"]').click();
  await f.locator("#thW").fill("0.70");
  await f.locator("#thW").dispatchEvent("change");
  await f.locator("#thReset").click();
  await expect(f.locator("#thW")).toHaveValue("0.80");
  await f.locator('[data-k="corr"]').click();
  await f.locator("tr[data-key]").first().click();
  await f.locator('[data-k="anomaly"]').click();
  await f.locator("#anVG").fill("8");
  await expect(f.locator("#anVGv")).toHaveText("8");
  await f.locator("#anSel").selectOption({ index: 1 });
  await f.locator('[data-k="cable"]').click();
  await f.locator("#cbSel").selectOption({ index: 1 });
  await f.locator("#cbL").fill("50");
  await f.locator("#cbM").fill("18.5");
  await f.locator("#cbF").fill("3.8");
  await expect(f.locator(".kv .v").first()).toContainText("2671.4");
  await f.locator('[data-k="temp"]').click();
  await f.locator("#tmSel").selectOption({ index: 1 });
  await f.locator("#tmCh").selectOption({ index: 1 });
  await expect(f.locator("#mMain")).not.toContainText("NaN");
  await f.locator('[data-k="trend"]').click();
  await f.locator("#trSel").selectOption({ index: 1 });
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(f.locator("#mTitle")).toContainText("A7");
  await page.screenshot({
    path: "../runtime/analysis-1366.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(f.locator("#rFr")).toHaveValue("1.00");
  await expect(f.locator("#w1_super")).toHaveText("34.4%");
});

test("万福入口、返回、其他桥隔离和登录门禁", async ({ page }) => {
  await page.goto("/bridges/10905200071");
  await page.getByRole("link", { name: "数据分析 →", exact: true }).click();
  await expect(page).toHaveURL(/10905200071\/analysis$/);
  await page.getByRole("link", { name: "← 返回万福大桥" }).click();
  await expect(page).toHaveURL(/10905200071$/);
  await page.goto("/bridges/15032610123365813067");
  await expect(
    page.getByRole("link", { name: "数据分析 →", exact: true }),
  ).toHaveCount(0);
  await page.goto("/bridges/15032610123365813067/analysis");
  await expect(page).toHaveURL(/screen$/);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.route("**/auth/config", (r) =>
    r.fulfill({ json: { code: "OK", data: { previewEnabled: false } } }),
  );
  await page.route("**/auth/me", (r) =>
    r.fulfill({ status: 401, json: { code: "UNAUTHORIZED" } }),
  );
  await page.goto("/bridges/10905200071/analysis");
  await expect(page).toHaveURL(/login$/);
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("沙箱禁止联网和父页面访问，缺数不伪造结果", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/bridges/10905200071/analysis");
  const f = page.frameLocator("iframe");
  await expect(f.locator("#mTitle")).toContainText("A1");
  const inner = page
    .frames()
    .find((frame) => frame.url().includes("wanfu-analysis-v3.2/index.html"))!;
  const isolated = await inner.evaluate(async () => {
    let parentBlocked = false;
    try {
      void parent.document.body;
    } catch {
      parentBlocked = true;
    }
    let networkBlocked = false;
    try {
      await fetch("/api/v1/bridges/10905200071");
    } catch {
      networkBlocked = true;
    }
    return { parentBlocked, networkBlocked };
  });
  expect(isolated).toEqual({ parentBlocked: true, networkBlocked: true });
  await inner.evaluate(() => {
    const w = window as unknown as {
      BA: { setData: (d: unknown) => void };
      UI: { reassess: () => void };
      BRIDGE_LIVE: unknown;
    };
    w.BA.setData({
      devices: [],
      points: [],
      series: {},
      thresholds: {},
      indRanges: {},
      meta: {},
    });
    w.BRIDGE_LIVE = null;
    w.UI.reassess();
  });
  for (const key of [
    "score",
    "threshold",
    "corr",
    "anomaly",
    "cable",
    "temp",
    "trend",
    "vib",
  ]) {
    await f.locator(`[data-k="${key}"]`).click();
    await expect(f.locator("#mMain")).toContainText("没有可分析的监测通道");
    await expect(f.locator("#mMain")).not.toContainText("NaN");
  }
  expect(errors).toEqual([]);
});

test("静态资源加载失败提示并支持重试", async ({ page }) => {
  await page.route("**/wanfu-analysis-v3.2/js/bridge/core.js", (r) =>
    r.abort(),
  );
  await page.goto("/bridges/10905200071/analysis");
  await expect(page.getByRole("alert")).toContainText("加载失败");
  await page.unroute("**/wanfu-analysis-v3.2/js/bridge/core.js");
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.frameLocator("iframe").locator("#mTitle")).toContainText(
    "A1",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("稀疏样本与缺少温度配对时保留缺数说明", async ({ page }) => {
  await page.goto("/bridges/10905200071/analysis");
  const f = page.frameLocator("iframe");
  await expect(f.locator("#mTitle")).toContainText("A1");
  const inner = page
    .frames()
    .find((frame) => frame.url().includes("wanfu-analysis-v3.2/index.html"))!;
  await inner.evaluate(() => {
    const w = window as unknown as {
      BA: {
        D: { series: Record<string, number[][]> };
        setData: (d: unknown) => void;
      };
      UI: { reassess: () => void };
    };
    const d = structuredClone(w.BA.D);
    Object.keys(d.series).forEach((key) => {
      d.series[key] = d.series[key].slice(0, 1);
    });
    w.BA.setData(d);
    w.UI.reassess();
  });
  await f.locator('[data-k="temp"]').click();
  await expect(f.locator("#mMain")).toContainText("无同构件温度");
  for (const key of ["corr", "anomaly", "trend"]) {
    await f.locator(`[data-k="${key}"]`).click();
    await expect(f.locator("#mMain")).not.toBeEmpty();
    await expect(f.locator("#mMain")).not.toContainText("NaN");
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("振动按需加载、失败重试、离开后不抢回页面且同页复用", async ({ page }) => {
  let requests = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/js/live-vib.js", async (route) => {
    requests++;
    if (requests === 1) return route.abort();
    await gate;
    return route.continue();
  });
  await page.goto("/bridges/10905200071/analysis");
  const f = page.frameLocator("iframe");
  await expect(f.locator("#rFr")).toHaveValue("1.00");
  expect(requests).toBe(0);
  await f.locator('[data-k="vib"]').click();
  await expect(f.getByRole("alert")).toContainText("振动数据加载失败");
  await f.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    f.getByRole("status").filter({ hasText: "正在初始化振动图表" }),
  ).toBeVisible();
  await f.locator('[data-k="score"]').click();
  release();
  await expect
    .poll(() =>
      page
        .frames()
        .find((frame) =>
          frame.url().includes("wanfu-analysis-v3.2/index.html"),
        )!
        .evaluate(() =>
          Boolean(
            (window as unknown as { analysisVibrationLoaded: boolean })
              .analysisVibrationLoaded,
          ),
        ),
    )
    .toBe(true);
  await expect(f.locator("#mTitle")).toContainText("A1");
  await f.locator('[data-k="vib"]').click();
  await expect(f.locator("#vib00 svg")).toBeVisible();
  await f.locator('[data-k="score"]').click();
  await f.locator('[data-k="vib"]').click();
  await expect(f.locator("#vib00 svg")).toBeVisible();
  expect(requests).toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
