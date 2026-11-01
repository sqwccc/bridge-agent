import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInContext, createContext } from "node:vm";

describe("v3.2 快照和原算法基准", () => {
  it("保留原数据、内核、布局和图表的字节校验", () => {
    const root = "public/wanfu-analysis-v3.2/";
    const manifest = JSON.parse(
      readFileSync(root + "source-manifest.json", "utf8"),
    );
    for (const [file, hash] of Object.entries(manifest.sourceHashes)) {
      if (file === "js/bridge/algo.js") continue;
      expect(
        createHash("sha256")
          .update(readFileSync(root + file))
          .digest("hex"),
        file,
      ).toBe(hash);
    }
  });
  it("默认评分、索力和频率换算与原版基准一致", () => {
    const context = createContext({ window: {} });
    for (const file of ["seed-data.js", "bridge/core.js"]) {
      runInContext(
        readFileSync("public/wanfu-analysis-v3.2/js/" + file, "utf8"),
        context,
      );
    }
    // Expected values independently captured from the unmodified source v3.2.
    const score = runInContext(
      'window.BA.assess({mgt:"I",frRatio:1,ifRatio:0.95})',
      context,
    );
    expect(score.finalScore).toBe(88.1);
    expect(score.Dr).toBeCloseTo(89.24176010434782, 10);
    expect(score.BSI).toBeCloseTo(89.57139565217393, 10);
    expect(score.grade).toBe("B");
    expect(score.channels).toHaveLength(181);
    expect(score.comps).toHaveLength(32);
    expect(
      runInContext("window.BA.cableForce(18.5,50,3.8)", context),
    ).toBeCloseTo(2671.4, 8);
  });
});
