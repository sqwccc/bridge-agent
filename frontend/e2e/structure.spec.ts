import { test, expect, type Page } from "@playwright/test";

async function mock(
  page: Page,
  type = 1,
  mainGirderName = "连续箱梁",
  wanfu = false,
) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/config")) data = { previewEnabled: true };
    else if (path.endsWith("/auth/me"))
      data = { username: "preview", roles: [] };
    else if (path.endsWith("/structure-config")) {
      const shape =
        wanfu || type === 3
          ? "suspension"
          : type === 4
            ? "stay"
            : type === 2
              ? "arch"
              : type === 1
                ? mainGirderName.includes("桁架")
                  ? "truss"
                  : mainGirderName.includes("刚构")
                    ? "rigid"
                    : "girder"
                : "unknown";
      const upper =
        shape === "unknown"
          ? ["上部结构"]
          : shape === "arch"
            ? ["主拱圈", "拱上构造"]
            : shape === "truss"
              ? ["桁架", "主梁"]
              : shape === "stay"
                ? ["索塔", "斜拉索", "主梁"]
                : shape === "suspension"
                  ? wanfu
                    ? ["索塔", "主缆", "吊索", "加劲梁", "支座"]
                    : ["索塔", "主缆", "吊索", "主梁"]
                  : ["主梁"];
      const lower =
        shape === "unknown"
          ? ["下部结构"]
          : wanfu
            ? ["索塔基础", "桥墩", "桥台"]
            : shape === "rigid"
              ? ["桥墩", "桥台", "基础"]
              : ["桥墩", "桥台", "基础", "支座"];
      data = {
        version: 0,
        shape,
        parts: [
          upper,
          lower,
          shape === "unknown" ? ["桥面系"] : ["桥面", "伸缩缝"],
        ].flatMap((names, z) =>
          names.map((name, i) => ({
            id: `part-${z}-${i}`,
            zone: ["上部结构", "下部结构", "桥面系"][z],
            name,
            description: "",
            anchor: `${["上部结构", "下部结构", "桥面系"][z]}:${name}`,
            bindings: [],
          })),
        ),
      };
    } else if (path.endsWith("/agent/status")) data = { available: false };
    else if (path.endsWith("/alarms")) data = { items: [], total: 0 };
    else if (/\/bridges\/[^/]+$/.test(path))
      data = {
        id: wanfu ? "10905200071" : "test",
        name: wanfu ? "万福大桥" : "结构测试桥",
        type,
        typeName: "测试桥型",
        city: "测试",
        dataIssues: [],
        specialTypeCodes: [],
        specialTypeNames: [],
        conditionGradeName: "未提供",
        structureGradeName: "未提供",
        archive: { mainGirderName },
        code: "test",
      };
    await route.fulfill({ json: { code: "OK", data } });
  });
  await page.goto(`/bridges/${wanfu ? "10905200071" : "test"}`);
}

test("示意图与健康树双向联动、清除、键盘选择及响应式布局", async ({ page }) => {
  await mock(page);
  const tree = page.locator(".bridge-health-column");
  await tree.getByRole("button", { name: /上部结构/ }).click();
  await expect(
    page.getByRole("button", { name: "上部结构 · 主梁（示意）", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "下部结构 · 桥墩（示意）", exact: true })
    .locator("path")
    .first()
    .click();
  await expect(tree.getByRole("button", { name: /下部结构/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    tree.getByRole("button", { name: /桥墩.*待绑定/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "清除选择", exact: true }).click();
  await expect(page.locator(".structure-svg .selected")).toHaveCount(0);
  const deck = page.getByRole("button", {
    name: "桥面系 · 桥面（示意）",
    exact: true,
  });
  await deck.focus();
  await page.keyboard.press("Enter");
  await expect(deck).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".structure-selection")).toContainText(
    "高亮仅表示选择",
  );
  for (const width of [1366, 1920, 3840]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({
    path: "../runtime/structure-girder.png",
    fullPage: true,
  });
});

for (const [type, detail, label] of [
  [1, "连续箱梁", "梁式桥"],
  [1, "连续刚构", "刚构桥"],
  [1, "桁架梁", "桁架桥"],
  [2, "肋拱", "拱桥"],
  [3, "悬索桥", "悬索桥"],
  [4, "斜拉桥", "斜拉桥"],
  [99, "未知", "通用部位"],
] as const) {
  test(`按来源桥型显示${label}`, async ({ page }) => {
    await mock(page, type, detail);
    await expect(page.locator(".structure-svg")).toHaveAttribute(
      "aria-label",
      new RegExp(label),
    );
    await page.getByRole("button", { name: "全部部位", exact: true }).click();
    expect(
      await page.locator(".structure-svg .selected").count(),
    ).toBeGreaterThan(0);
    await expect(page.locator(".wanfu-drawing")).toHaveCount(0);
    await page
      .locator(".bridge-visual-panel")
      .screenshot({ path: `../runtime/structure-type-${type}-${label}.png` });
  });
}

test("万福原型像素高亮、实拍切换和部位联动", async ({ page }) => {
  await mock(page, 3, "悬索桥", true);
  const canvas = page.locator(".wanfu-drawing canvas");
  await expect(canvas).toBeVisible();
  const colors = () =>
    canvas.evaluate((e) => {
      const d = (e as HTMLCanvasElement)
        .getContext("2d")!
        .getImageData(0, 0, 1600, 356).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] === 255 && d[i + 1] === 80 && d[i + 3] > 0) n++;
      return n;
    });
  await page
    .locator(".bridge-health-column")
    .getByRole("button", { name: /上部结构/ })
    .click();
  await expect.poll(colors).toBeGreaterThan(100);
  await page.getByRole("button", { name: "清除选择", exact: true }).click();
  await expect.poll(colors).toBe(0);
  const point = await canvas.evaluate((e) => {
    const c = e as HTMLCanvasElement,
      d = c.getContext("2d")!.getImageData(0, 0, 1600, 356).data,
      r = c.getBoundingClientRect();
    for (let y = 30; y < 150; y++)
      for (let x = 200; x < 700; x++)
        if (d[(y * 1600 + x) * 4 + 3] > 200)
          return {
            x: r.left + (x / 1600) * r.width,
            y: r.top + (y / 356) * r.height,
          };
    throw new Error("missing tower ink");
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".drawing-tip")).toContainText("原型图示名称");
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(".structure-selection")).toContainText("上部结构");
  await expect(page.locator(".health-tree em")).toHaveText([
    "—",
    "—",
    "—",
    "—",
  ]);
  await page.getByRole("button", { name: "实拍图", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "万福大桥历史实拍资料" }),
  ).toBeVisible();
  await page
    .locator(".bridge-health-column")
    .getByRole("button", { name: /下部结构/ })
    .click();
  await expect(canvas).toBeVisible();
  await expect.poll(colors).toBeGreaterThan(100);
  await page.screenshot({
    path: "../runtime/structure-wanfu.png",
    fullPage: true,
  });
  await page.goto("/bridges/test");
  await expect(page.locator(".structure-selection")).toContainText(
    "未选择部位",
  );
});
