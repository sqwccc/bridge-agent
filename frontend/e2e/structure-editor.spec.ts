import { test, expect, type Page } from "@playwright/test";
const p1 = {
  pointId: "P1",
  pointName: "跨中",
  deviceId: "D1",
  deviceName: "位移设备",
  metric: "D",
  metricName: "位移",
  unit: "mm",
};
const p2 = {
  pointId: "P2",
  pointName: "桥墩",
  deviceId: "D2",
  deviceName: "温度设备",
  metric: "T",
  metricName: "温度",
  unit: "℃",
};
const part = (
  id: string,
  name: string,
  anchor: string | null,
  bindings: unknown[] = [],
) => ({ id, zone: "上部结构", name, anchor, description: "", bindings });
async function fixture(page: Page, conflict = false, anonymous = false) {
  let saved = {
    version: 0,
    shape: "girder",
    parts: [
      part("a", "主梁", "上部结构:主梁"),
      { ...part("b", "桥墩", "下部结构:桥墩"), zone: "下部结构" },
    ],
  };
  let authenticated = !anonymous;
  let pointRequests = 0;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/config")) data = { previewEnabled: true };
    else if (path.endsWith("/auth/me")) {
      if (!authenticated) {
        await route.fulfill({ status: 401, json: { message: "请登录" } });
        return;
      }
      data = { username: "test" };
    } else if (path.endsWith("/auth/login")) {
      authenticated = true;
      data = { username: "test" };
    } else if (path.endsWith("/auth/csrf"))
      data = { headerName: "X-CSRF-TOKEN", token: "test" };
    else if (path.endsWith("/structure-config")) {
      if (route.request().method() === "PUT") {
        if (conflict) {
          await route.fulfill({
            status: 409,
            json: { message: "配置版本已更新" },
          });
          return;
        }
        saved = {
          ...route.request().postDataJSON(),
          version: saved.version + 1,
        };
      }
      data = saved;
    } else if (path.endsWith("/monitoring/points")) {
      pointRequests++;
      data = [p1, p2];
    } else if (path.endsWith("/monitoring/samples"))
      data = { items: [], truncated: false };
    else if (path.endsWith("/alarms")) data = { items: [], total: 0 };
    else if (path.endsWith("/agent/status")) data = { available: false };
    else if (/\/bridges\/[^/]+$/.test(path))
      data = {
        id: "test",
        name: "测试桥",
        type: 1,
        typeName: "梁式桥",
        dataIssues: [],
        archive: {},
        conditionGradeName: "未提供",
        structureGradeName: "未提供",
      };
    await route.fulfill({ json: { code: "OK", data } });
  });
  await page.goto("/bridges/test");
  await expect(
    page.getByRole("button", { name: "编辑部件", exact: true }),
  ).toBeEnabled();
  return {
    get: () => saved,
    pointRequests: () => pointRequests,
    set: (config: typeof saved) => {
      saved = config;
    },
  };
}

test("改名保留图形、自定义待绑定保存、删除默认图形入口、刷新持久化", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "编辑部件", exact: true }).click();
  await page
    .getByRole("textbox", { name: "a 部件名称", exact: true })
    .fill("主梁改名");
  await page
    .getByRole("button", { name: "添加上部结构部件", exact: true })
    .click();
  await page
    .locator(".structure-edit-zone")
    .first()
    .locator(".structure-edit-part")
    .last()
    .getByRole("textbox", { name: /部件名称/ })
    .fill("自定义横梁");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "上部结构 · 主梁改名（示意）",
      exact: true,
    }),
  ).toBeVisible();
  const controls = page.locator(".structure-part-controls");
  await controls
    .getByRole("button", { name: "自定义横梁", exact: true })
    .click();
  await expect(page.locator(".selected-part-info")).toContainText(
    "部位范围示意",
  );
  await expect(page.locator(".monitor-binding-filter")).toContainText(
    "待绑定测点",
  );
  await expect(page.locator(".structure-svg .selected")).toHaveCount(1);
  await page.reload();
  await expect(
    controls.getByRole("button", { name: "自定义横梁", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑部件", exact: true }).click();
  await page
    .locator('[data-part-id="a"]')
    .getByRole("button", { name: "删除部件" })
    .click();
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "上部结构 · 主梁改名（示意）",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(state.get().parts.some((p) => p.id === "a")).toBe(false);
});

test("手动绑定并筛选曲线、恢复全桥及复用测点缓存", async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "编辑部件", exact: true }).click();
  const select = page.getByRole("combobox", {
    name: "a 绑定测点",
    exact: true,
  });
  await select.click();
  await expect(page.locator(".ant-select-item-group")).toHaveText([
    "位移 · mm",
    "温度 · ℃",
  ]);
  await select.fill("温度设备");
  await expect(page.locator(".ant-select-item-option")).toHaveCount(1);
  await expect(page.locator(".ant-select-item-option")).toContainText("桥墩");
  await select.fill("跨中");
  await page
    .locator(".ant-select-item-option")
    .filter({ hasText: "跨中" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("list", { name: "已绑定测点" })).toContainText(
    "跨中",
  );
  await expect(page.getByRole("list", { name: "已绑定测点" })).toContainText(
    "位移设备",
  );
  await expect(page.getByRole("list", { name: "已绑定测点" })).toContainText(
    "位移 · mm",
  );
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect.poll(() => state.get().parts[0].bindings.length).toBe(1);
  await page
    .locator(".structure-part-controls")
    .getByRole("button", { name: "主梁", exact: true })
    .click();
  await expect(page.locator(".metric-row")).toHaveCount(1);
  await expect(page.locator(".metric-row-heading")).toContainText("位移");
  await page.getByRole("button", { name: "恢复全桥监测", exact: true }).click();
  await expect(page.locator(".metric-row")).toHaveCount(2);
  expect(state.pointRequests()).toBe(1);
});

test("冲突保留草稿，取消编辑二次确认，预览免登录直接编辑", async ({ page }) => {
  await fixture(page, true, true);
  await page.getByRole("button", { name: "编辑部件", exact: true }).click();
  await expect(page.getByText("登录后编辑本桥部件")).toHaveCount(0);
  await expect(page).toHaveURL(/bridges\/test/);
  await page
    .getByRole("textbox", { name: "a 部件名称", exact: true })
    .fill("冲突草稿");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "a 部件名称", exact: true }),
  ).toHaveValue("冲突草稿");
  await expect(
    page.getByRole("button", { name: "重新加载配置" }),
  ).toBeVisible();
  await page
    .locator(".structure-editor .ant-drawer-footer")
    .getByRole("button", { name: /取\s*消/, exact: true })
    .click();
  await expect(
    page
      .locator(".ant-modal-confirm-title")
      .filter({ hasText: "放弃未保存的部件修改？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(
    page.getByRole("textbox", { name: "a 部件名称", exact: true }),
  ).toHaveValue("冲突草稿");
  await page.screenshot({
    path: "../runtime/structure-editor.png",
    fullPage: true,
  });
});

test("失效绑定不显示全桥曲线", async ({ page }) => {
  const state = await fixture(page);
  state.set({
    version: 1,
    shape: "girder",
    parts: [
      part("a", "主梁", "上部结构:主梁", [
        { pointId: "gone", deviceId: "gone", metric: null },
      ]),
    ],
  });
  await page.reload();
  await page
    .locator(".structure-part-controls")
    .getByRole("button", { name: "主梁", exact: true })
    .click();
  await expect(page.locator(".monitor-binding-filter")).toContainText(
    "1个绑定已失效",
  );
  await expect(page.locator(".metric-row")).toHaveCount(0);
});

test("配置慢响应不阻塞档案和结构底图", async ({ page }) => {
  const state = await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/structure-config", async (route) => {
    await gate;
    await route.fulfill({ json: { code: "OK", data: state.get() } });
  });
  await page.reload();
  await expect(page.locator(".bridge-health-column")).toBeVisible();
  await expect(page.locator(".structure-svg")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "编辑部件", exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole("button", { name: "编辑部件", exact: true }),
  ).toBeEnabled();
});
