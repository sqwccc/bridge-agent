import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Bridge } from "../../api/types";
import {
  ZONES,
  structureQuery,
  monitorPointsQuery,
  type Zone,
} from "../../api/structure";
export { ZONES, type Zone } from "../../api/structure";
export type Selection = { zone: Zone; part?: string } | "all" | null;
function useStructureState(bridgeId: string) {
  const [rawSelection, setSelection] = useState<Selection>(null);
  const config = useQuery(structureQuery(bridgeId));
  const points = useQuery(monitorPointsQuery(bridgeId));
  const parts = config.data?.parts || [];
  const selection =
    rawSelection &&
    rawSelection !== "all" &&
    rawSelection.part &&
    !parts.some((p) => p.id === rawSelection.part)
      ? null
      : rawSelection;
  const selectedPart =
    selection && selection !== "all"
      ? parts.find((p) => p.id === selection.part)
      : undefined;
  const drawingSelection: Selection = selectedPart
    ? {
        zone: selectedPart.zone,
        ...(selectedPart.anchor
          ? {
              part: selectedPart.anchor.slice(
                selectedPart.anchor.indexOf(":") + 1,
              ),
            }
          : {}),
      }
    : selection;
  const select = (value: Selection) =>
    setSelection((old) =>
      JSON.stringify(old) === JSON.stringify(value) ? null : value,
    );
  const drawingPart = (zone: Zone, name: string) =>
    parts.find((p) => p.anchor === `${zone}:${name}`);
  const selectDrawing = (value: Selection) => {
    if (value && value !== "all" && value.part) {
      const part = drawingPart(value.zone, value.part);
      if (part) select({ zone: part.zone, part: part.id });
    } else select(value);
  };
  return {
    selection,
    select,
    config,
    points,
    parts,
    selectedPart,
    drawingSelection,
    drawingPart,
    selectDrawing,
    bridgeId,
  };
}
const Context = createContext<ReturnType<typeof useStructureState> | null>(
  null,
);
export function StructureProvider({
  bridgeId,
  children,
}: {
  bridgeId: string;
  children: ReactNode;
}) {
  const value = useStructureState(bridgeId);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useStructure = () => {
  const value = useContext(Context);
  if (!value) throw new Error("StructureProvider required");
  return value;
};
export function isSelected(selection: Selection, zone: Zone, part?: string) {
  return (
    selection === "all" ||
    !!(
      selection &&
      selection.zone === zone &&
      (!selection.part || selection.part === part)
    )
  );
}
export const isWanfu = (b: Bridge) =>
  b.id === "10905200071" && b.name === "万福大桥";
export type Shape =
  "girder" | "rigid" | "truss" | "arch" | "suspension" | "stay" | "unknown";
export function shapeOf(b: Bridge): Shape {
  if (isWanfu(b)) return "suspension";
  // Source bridge type takes precedence; girder detail only refines a compatible type.
  if (b.type === 3) return "suspension";
  if (b.type === 4) return "stay";
  if (b.type === 2) return "arch";
  if (b.type === 1) {
    const detail = b.archive?.mainGirderName || "";
    if (/桁架/.test(detail)) return "truss";
    if (/刚构/.test(detail)) return "rigid";
    return "girder";
  }
  return "unknown";
}
export const SHAPE_NAMES: Record<Shape, string> = {
  girder: "梁式桥",
  rigid: "刚构桥",
  truss: "桁架桥",
  arch: "拱桥",
  suspension: "悬索桥",
  stay: "斜拉桥",
  unknown: "通用部位",
};
export function Schematic({ bridge }: { bridge: Bridge }) {
  const {
    drawingSelection: selection,
    selectDrawing: select,
    drawingPart,
    config,
  } = useStructure();
  const shape = (config.data?.shape as Shape) || shapeOf(bridge);
  const group = (zone: Zone, part: string, children: ReactNode) => (
    <g
      key={part}
      role={drawingPart(zone, part) ? "button" : undefined}
      tabIndex={drawingPart(zone, part) ? 0 : undefined}
      aria-label={`${zone} · ${drawingPart(zone, part)?.name || part}（示意）`}
      aria-pressed={isSelected(selection, zone, part)}
      className={`structure-part ${!drawingPart(zone, part) ? "structure-background" : ""} ${isSelected(selection, zone, part) ? "selected" : ""} ${selection && !isSelected(selection, zone, part) ? "dimmed" : ""}`}
      onClick={() => select({ zone, part })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select({ zone, part });
        }
      }}
    >
      <title>
        {zone} · {part}（示意，非实际构件台账）
      </title>
      {children}
    </g>
  );
  if (shape === "unknown")
    return (
      <svg
        className="structure-svg"
        viewBox="0 0 1400 400"
        aria-label="桥型未明确，通用部位示意图"
      >
        {ZONES.map((z, i) =>
          group(
            z,
            z,
            <>
              <rect
                x={180 + i * 360}
                y={130}
                width={320}
                height={120}
                rx={12}
              />
              <text x={340 + i * 360} y={195} textAnchor="middle">
                {z}
              </text>
            </>,
          ),
        )}
      </svg>
    );
  const cable = shape === "stay" || shape === "suspension";
  const piers =
    cable || shape === "arch" || shape === "truss"
      ? [420, 980]
      : [320, 570, 830, 1080];
  const nodes = [60, ...piers, 1340];
  return (
    <svg
      className="structure-svg"
      viewBox="0 0 1400 440"
      aria-label={`${SHAPE_NAMES[shape]}结构示意图`}
    >
      <path className="structure-ground" d="M25 392 H1375" />
      {group(
        "下部结构",
        "基础",
        piers.map((x) => (
          <rect key={x} x={x - 42} y={367} width={84} height={25} />
        )),
      )}
      {group(
        "下部结构",
        "桥墩",
        piers.map((x) => (
          <path
            key={x}
            d={`M${x - 22} 286 H${x + 22} L${x + 17} 367 H${x - 17} Z`}
          />
        )),
      )}
      {group(
        "下部结构",
        "桥台",
        [60, 1340].map((x) => (
          <path key={x} d={`M${x - 24} 280 H${x + 24} V392 H${x - 30} Z`} />
        )),
      )}
      {shape !== "rigid" &&
        group(
          "下部结构",
          "支座",
          nodes.map((x) => (
            <rect key={x} x={x - 16} y={276} width={32} height={10} />
          )),
        )}
      {shape !== "arch" &&
        group(
          "上部结构",
          "主梁",
          nodes
            .slice(1)
            .map((x, i) => (
              <rect
                key={x}
                x={nodes[i]}
                y={252}
                width={x - nodes[i]}
                height={24}
              />
            )),
        )}
      {shape === "arch" && (
        <>
          {group(
            "上部结构",
            "主拱圈",
            <path fill="none" strokeWidth={12} d="M70 365 Q700 140 1330 365" />,
          )}
          {group(
            "上部结构",
            "拱上构造",
            <>
              {[180, 300, 420, 540, 660, 780, 900, 1020, 1140, 1260].map(
                (x) => {
                  const t = (x - 70) / 1260;
                  const y = 365 - 450 * t * (1 - t);
                  return <path key={x} d={`M${x} 251 V${y}`} />;
                },
              )}
              <path d="M60 252 H1340" />
            </>,
          )}
        </>
      )}
      {shape === "truss" &&
        group(
          "上部结构",
          "桁架",
          <>
            <path
              d="M60 250 L200 140 H1200 L1340 250 Z"
              fill="none"
              strokeWidth={7}
            />
            {Array.from({ length: 8 }, (_, i) => (
              <path
                key={i}
                d={`M${200 + i * 125} 250 V140 L${200 + (i + 1) * 125} 250`}
                fill="none"
              />
            ))}
          </>,
        )}
      {cable &&
        group(
          "上部结构",
          "索塔",
          [420, 980].map((x) => (
            <path
              key={x}
              d={`M${x - 15} 252 V50 H${x + 15} V252 M${x - 15} 100 H${x + 15}`}
            />
          )),
        )}
      {shape === "stay" &&
        group(
          "上部结构",
          "斜拉索",
          [420, 980].flatMap((t) =>
            [-3, -2, -1, 1, 2, 3].map((i) => (
              <path
                key={`${t}-${i}`}
                d={`M${t} 65 L${t + i * 85} 252`}
                fill="none"
              />
            )),
          ),
        )}
      {shape === "suspension" && (
        <>
          {group(
            "上部结构",
            "主缆",
            <path
              d="M60 252 L420 65 Q700 325 980 65 L1340 252"
              fill="none"
              strokeWidth={6}
            />,
          )}
          {group(
            "上部结构",
            "吊索",
            Array.from({ length: 19 }, (_, i) => {
              const x = 140 + i * 62;
              const y =
                x < 420
                  ? 252 - (187 * (x - 60)) / 360
                  : x > 980
                    ? 65 + (187 * (x - 980)) / 360
                    : 65 + 520 * ((x - 420) / 560) * (1 - (x - 420) / 560);
              return <path key={x} d={`M${x} ${y} V252`} fill="none" />;
            }),
          )}
        </>
      )}
      {group(
        "桥面系",
        "桥面",
        <rect x={60} y={239} width={1280} height={13} />,
      )}
      {group(
        "桥面系",
        "伸缩缝",
        [70, 1330].map((x) => (
          <rect key={x} x={x} y={238} width={10} height={17} />
        )),
      )}
    </svg>
  );
}
