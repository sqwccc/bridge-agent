import { useEffect, useRef, useState, type MouseEvent } from "react";
import ink from "../../assets/wanfu-ink.png";
import mask from "../../assets/wanfu-members.png";
import names from "./wanfu-names.json";
import { isSelected, useStructure, type Zone } from "./BridgeStructure";

const W = 1600,
  H = 356;
// These are drawing regions from the supplied prototype, never database member IDs.
export function wanfuRegion(k: number): { zone: Zone; part: string } | null {
  if (k === 1 || k === 2) return { zone: "上部结构", part: "索塔" };
  if (k === 3 || k === 4) return { zone: "下部结构", part: "索塔基础" };
  if (k >= 5 && k <= 7) return { zone: "上部结构", part: "主缆" };
  if (k >= 8 && k <= 10) return { zone: "上部结构", part: "加劲梁" };
  if (k === 11) return { zone: "桥面系", part: "桥面" };
  if (k === 12) return { zone: "桥面系", part: "伸缩缝" };
  if (k === 13 || k === 14) return { zone: "上部结构", part: "支座" };
  if (k === 16 || k === 23) return { zone: "下部结构", part: "桥台" };
  if (k >= 17 && k <= 22) return { zone: "下部结构", part: "桥墩" };
  if (k >= 24 && k <= 70) return { zone: "上部结构", part: "吊索" };
  return null;
}
function pixels(src: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(im, 0, 0);
      resolve(ctx.getImageData(0, 0, W, H).data);
    };
    im.onerror = () => reject(new Error("image"));
    im.src = src;
  });
}
export function WanfuStructure() {
  const cv = useRef<HTMLCanvasElement>(null);
  const {
    drawingSelection: selection,
    selectDrawing: select,
    drawingPart,
    parts,
  } = useStructure();
  const [data, setData] = useState<{
    alpha: Uint8ClampedArray;
    ids: Uint8Array;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([pixels(ink), pixels(mask)])
      .then(([alpha, raw]) => {
        const ids = new Uint8Array(W * H);
        for (let i = 0; i < ids.length; i++)
          if (alpha[i * 4 + 3])
            ids[i] =
              Math.round(raw[i * 4] / 17) * 16 +
              Math.round(raw[i * 4 + 1] / 17);
        if (active) setData({ alpha, ids });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const ctx = cv.current?.getContext("2d");
    if (!ctx || !data) return;
    const out = ctx.createImageData(W, H);
    const styles = Array.from({ length: 71 }, (_, k) => {
      const region = wanfuRegion(k),
        exists = region && drawingPart(region.zone, region.part);
      const hot = !!exists && k === hover;
      const on = region && isSelected(selection, region.zone, region.part);
      return {
        color: hot ? [255, 138, 60] : on ? [255, 80, 65] : [226, 236, 248],
        opacity: selection && region && !on && !hot ? 0.25 : 1,
      };
    });
    for (let i = 0; i < W * H; i++) {
      const alpha = data.alpha[i * 4 + 3];
      if (!alpha) continue;
      const style = styles[data.ids[i]] || styles[0];
      out.data[i * 4] = style.color[0];
      out.data[i * 4 + 1] = style.color[1];
      out.data[i * 4 + 2] = style.color[2];
      out.data[i * 4 + 3] = alpha * style.opacity;
    }
    ctx.putImageData(out, 0, 0);
  }, [data, selection, hover, parts]);
  const hit = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!data) return 0;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W),
      y = Math.floor(((e.clientY - r.top) / r.height) * H);
    for (let radius = 0; radius <= 5; radius++)
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
          const k = data.ids[yy * W + xx];
          const region = wanfuRegion(k);
          if (region && drawingPart(region.zone, region.part)) return k;
        }
    return 0;
  };
  if (failed) return <p role="alert">结构底图加载失败，请刷新重试。</p>;
  return (
    <div className="wanfu-drawing">
      {!data && <span role="status">正在加载结构底图…</span>}
      <canvas
        ref={cv}
        width={W}
        height={H}
        aria-label="万福大桥结构立面示意图，可使用下方部件按钮选择"
        onPointerMove={(e) => setHover(hit(e))}
        onPointerLeave={() => setHover(0)}
        onClick={(e) => {
          const region = wanfuRegion(hit(e));
          if (region) select(region);
        }}
      />
      <div className="drawing-tip" aria-live="polite">
        {hover
          ? `${names[hover] || "图示部件"} · ${wanfuRegion(hover)?.zone}（原型图示名称）`
          : "悬停查看图示名称，点击联动部位与部件"}
      </div>
    </div>
  );
}
