/** Compare port against an unmodified v3.2 directory in isolated browser frames. */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(resolve(root, "frontend/package.json"));
const { chromium } = require("@playwright/test");
const original = process.argv[2];
if (!original)
  throw new Error("Pass the original v3.2 directory as the first argument");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    timezoneId: "Asia/Shanghai",
  });
  const port = await context.newPage(),
    reference = await context.newPage();
  await reference.route("**/wanfu-analysis-v3.2/js/**", (route) => {
    const relative = new URL(route.request().url()).pathname.split(
      "/wanfu-analysis-v3.2/",
    )[1];
    return route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: readFileSync(resolve(original, "app", relative)),
    });
  });
  for (const page of [port, reference]) {
    await page.goto("http://127.0.0.1:5173/bridges/10905200071/analysis");
    await page.frameLocator("iframe").locator("#rFr").waitFor();
  }
  const frames = [port, reference].map((p) => p.frameLocator("iframe"));
  const result = [];
  const capture = async (f) => ({
    values: await f.locator("#mMain .kv .v").allTextContents(),
    rows: await f.locator("#mMain tbody").allTextContents(),
    paths: await f
      .locator("#mMain svg path")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("d"))),
  });
  const compare = async (label) => {
    const results = await Promise.all(frames.map(capture));
    for (const r of results) {
      r.values = r.values.map((v) => v.replace("MQTT 实时", "MQTT 采集快照"));
      r.paths = createHash("sha256")
        .update(JSON.stringify(r.paths))
        .digest("hex");
    }
    assert.deepEqual(results[0], results[1], label);
    result.push(label);
    console.log(label + " PASS");
  };
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
    for (const f of frames) await f.locator(`[data-k="${key}"]`).click();
    await compare("default_" + key);
  }
  const cases = [
    [
      "score",
      async (f) => {
        await f.locator('[data-w="super"]').fill("40");
        await f.locator("#rFr").fill("1.10");
      },
    ],
    [
      "threshold",
      async (f) => {
        await f.locator("#thW").fill("0.70");
        await f.locator("#thW").dispatchEvent("change");
      },
    ],
    [
      "corr",
      async (f) => {
        await f.locator("tr[data-key]").first().click();
      },
    ],
    [
      "anomaly",
      async (f) => {
        await f.locator("#anVG").fill("8");
        await f.locator("#anSel").selectOption({ index: 1 });
      },
    ],
    [
      "cable",
      async (f) => {
        await f.locator("#cbSel").selectOption({ index: 1 });
        await f.locator("#cbL").fill("50");
        await f.locator("#cbF").fill("4.2");
      },
    ],
    [
      "temp",
      async (f) => {
        await f.locator("#tmSel").selectOption({ index: 1 });
        await f.locator("#tmCh").selectOption({ index: 1 });
      },
    ],
    [
      "trend",
      async (f) => {
        await f.locator("#trSel").selectOption({ index: 1 });
      },
    ],
  ];
  for (const [key, adjust] of cases) {
    for (const f of frames) {
      await f.locator(`[data-k="${key}"]`).click();
      await adjust(f);
    }
    await compare("adjusted_" + key);
  }
  writeFileSync(
    resolve(root, "runtime/analysis-parity.json"),
    JSON.stringify(
      {
        passed: result,
        comparison: "Displayed numeric cards, table rows and SVG paths",
        source: "v3.2 unmodified scripts",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
