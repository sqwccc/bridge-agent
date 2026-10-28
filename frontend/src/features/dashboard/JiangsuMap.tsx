import { gradeColor } from "./gradeColors";
import { useEffect, useMemo, useRef, useState } from "react";
import geoData from "../../assets/jiangsu.json";
import counties from "../../assets/jiangsu-counties.json";
import { BridgeMapCard } from "./BridgeMapCard";
import type { Group, Point } from "../../api/types";

type Geometry = { type: string; coordinates: unknown };
const polygons = (geometry: Geometry): number[][][][] =>
  geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : (geometry.coordinates as number[][][][]);
const vertices = polygons(geoData.province).flat(2);
const west = Math.min(...vertices.map((p) => p[0])),
  east = Math.max(...vertices.map((p) => p[0])),
  north = Math.max(...vertices.map((p) => p[1])),
  south = Math.min(...vertices.map((p) => p[1]));
const MW = 1000,
  MH = 760,
  PAD = 52;
const mercatorY = (latitude: number) =>
  Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
const ymin = mercatorY(south),
  ymax = mercatorY(north);
const mapScale = Math.min(
  (MW - 2 * PAD) / (((east - west) * Math.PI) / 180),
  (MH - 2 * PAD) / (ymax - ymin),
);
const mapLeft = (MW - (((east - west) * Math.PI) / 180) * mapScale) / 2,
  mapTop = (MH - (ymax - ymin) * mapScale) / 2;
const project = (lng: number, lat: number): [number, number] => [
  mapLeft + (((lng - west) * Math.PI) / 180) * mapScale,
  mapTop + (ymax - mercatorY(lat)) * mapScale,
];

function path(geometry: Geometry) {
  return polygons(geometry)
    .flatMap((poly) =>
      poly.map(
        (ring) =>
          ring
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"}${project(p[0], p[1]).join(",")}`,
            )
            .join(" ") + "Z",
      ),
    )
    .join(" ");
}

const provincePath = path(geoData.province);
const cityPaths = geoData.cities.map((city) => ({
  ...city,
  outline: path(city.geometry),
}));
// 区县边界取自用户提供的原型，统一使用与桥梁点位相同的投影。
const countyPaths = counties.map((county) => ({
  ...county,
  outline: path(county.geometry),
}));

/** 本地 SVG 地图；逐桥显示点位，重叠标记错位排布并连回真实坐标。拖动后不触发下钻。 */
export function JiangsuMap({
  points,
  cities,
  selectedCity,
  gradeBasis,
  searchQuery = "",
  highlightedIds = [],
  onCity,
  onBridge,
}: {
  points: Point[];
  cities: Group[];
  selectedCity: string;
  gradeBasis: "conditionGrades" | "structureGrades";
  searchQuery?: string;
  highlightedIds?: string[];
  onCity: (city: string) => void;
  onBridge: (id: string) => void;
}) {
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const highlighted = new Set(highlightedIds);
  useEffect(() => {
    if (searchQuery) {
      setView({ x: 0, y: 0, scale: 1 });
      setHover(null);
    }
  }, [searchQuery]);
  const [hover, setHover] = useState<{
    points: Point[];
    displaced: boolean;
    x: number;
    y: number;
  } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepCard = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const closeCard = () => {
    keepCard();
    closeTimer.current = setTimeout(() => setHover(null), 220);
  };
  const showCard = (
    points: Point[],
    element: SVGGElement,
    displaced = false,
  ) => {
    keepCard();
    const frame = container.current!.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const width = Math.min(330, frame.width - 24);
    const x = rect.right - frame.left + 12;
    setHover({
      points,
      displaced,
      x: Math.max(12, Math.min(x, frame.width - width - 12)),
      y: Math.max(12, Math.min(rect.top - frame.top - 24, frame.height - 400)),
    });
  };
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  useEffect(() => {
    setHover(null);
  }, [points]);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const element = svg.current!;
    const prevent = (event: WheelEvent) => event.preventDefault();
    element.addEventListener("wheel", prevent, { passive: false });
    return () => element.removeEventListener("wheel", prevent);
  }, []);
  const coordinate = (clientX: number, clientY: number) => {
    const point = svg.current!.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };
  const drag = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    moved: boolean;
  } | null>(null);
  const markers = useMemo(() => {
    const spacing = 18 / view.scale;
    const occupied = new Map<string, { x: number; y: number }[]>();
    const cell = (value: number) => Math.floor(value / spacing);
    const available = (x: number, y: number) => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighbors =
            occupied.get(`${cell(x) + dx}:${cell(y) + dy}`) || [];
          if (neighbors.some((p) => Math.hypot(p.x - x, p.y - y) < spacing))
            return false;
        }
      }
      return true;
    };
    // 确定性排列；从真实位置向外寻找最近可用位置，每座桥保留独立标记。
    return [...points]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((point) => {
        const [sourceX, sourceY] = project(point.longitude, point.latitude);
        let x = sourceX,
          y = sourceY;
        for (let ring = 1; !available(x, y); ring++) {
          const radius = (ring * spacing) / 3;
          const steps = Math.max(
            8,
            Math.ceil((2 * Math.PI * radius) / (spacing / 2)),
          );
          for (let step = 0; step < steps; step++) {
            const angle = (step * 2 * Math.PI) / steps - Math.PI / 2;
            x = sourceX + Math.cos(angle) * radius;
            y = sourceY + Math.sin(angle) * radius;
            if (available(x, y)) break;
          }
        }
        const key = `${cell(x)}:${cell(y)}`;
        occupied.set(key, [...(occupied.get(key) || []), { x, y }]);
        return {
          point,
          x,
          y,
          sourceX,
          sourceY,
          displaced: Math.hypot(x - sourceX, y - sourceY) > 0.01,
        };
      });
  }, [points, view.scale]);
  const zoom = (factor: number, x = 500, y = 380) => {
    setHover(null);
    setView((v) => {
      const scale = Math.max(1, Math.min(12, v.scale * factor));
      const ratio = scale / v.scale;
      return { scale, x: x - (x - v.x) * ratio, y: y - (y - v.y) * ratio };
    });
  };
  return (
    <div
      className="map-container"
      ref={container}
      onKeyDown={(e) => {
        if (e.key === "Escape") setHover(null);
      }}
    >
      <div className="map-caption">
        <span className="live-dot" /> {view.scale.toFixed(1)} 倍
        <small>
          {view.scale >= 2.4 ? "区县边界" : "地市边界 · 放大查看区县"}
        </small>
      </div>
      <div className="map-help">滚轮缩放 · 拖动平移 · 悬停查看桥梁</div>
      <svg
        ref={svg}
        className="jiangsu-map"
        viewBox="0 0 1000 760"
        role="img"
        aria-label="江苏省桥梁分布地图"
        onWheel={(e) => {
          const p = coordinate(e.clientX, e.clientY);
          zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            vx: view.x,
            vy: view.y,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            const d = drag.current;
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) {
              d.moved = true;
              setHover(null);
              e.currentTarget.setPointerCapture(e.pointerId);
            }
            if (d.moved) {
              const from = coordinate(d.x, d.y),
                to = coordinate(e.clientX, e.clientY);
              setView((v) => ({
                ...v,
                x: d.vx + to.x - from.x,
                y: d.vy + to.y - from.y,
              }));
            }
          }
        }}
        onPointerUp={() => {
          if (drag.current?.moved) {
            setTimeout(() => {
              drag.current = null;
            }, 0);
          } else drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#175b9c" stopOpacity=".72" />
            <stop offset="1" stopColor="#082e57" stopOpacity=".88" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <pattern
            id="map-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M48 0H0V48"
              fill="none"
              stroke="#4aa3cf"
              strokeOpacity=".07"
            />
          </pattern>
        </defs>
        <rect width="1000" height="760" fill="url(#map-grid)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <path
            d={provincePath}
            stroke="#4fc7ff"
            strokeWidth="9"
            opacity=".25"
            filter="url(#glow)"
          />
          <path d={provincePath} fill="url(#land)" fillRule="evenodd" />
          {cityPaths.map((city, index) => {
            const match = cities.find(
              (c) => c.label.replace(/市$/, "") === city.name,
            );
            return (
              <path
                key={city.name}
                d={city.outline}
                fill={
                  selectedCity && selectedCity === match?.code
                    ? "#23689c"
                    : index % 2
                      ? "#10447b"
                      : "#123c6c"
                }
                fillOpacity=".52"
                className="map-city-area"
                stroke="none"
                onClick={() => {
                  if (!drag.current?.moved && match)
                    onCity(selectedCity === match.code ? "" : match.code);
                }}
              >
                <title>{city.name} · 点击筛选</title>
              </path>
            );
          })}
          <g className="map-county-borders" pointerEvents="none">
            {countyPaths.map((county) => (
              <path
                key={county.adcode}
                d={county.outline}
                fill="none"
                stroke="#73bce3"
                strokeOpacity=".4"
                strokeWidth={0.65 / view.scale}
              />
            ))}
          </g>
          <g pointerEvents="none" fill="none" strokeLinejoin="round">
            {cityPaths.map((city) => (
              <g key={city.name}>
                <path
                  d={city.outline}
                  stroke="#26c8ff"
                  strokeWidth={7 / view.scale}
                  strokeOpacity=".10"
                />
                <path
                  d={city.outline}
                  stroke="#39d9ff"
                  strokeWidth={3.6 / view.scale}
                  strokeOpacity=".28"
                />
                <path
                  d={city.outline}
                  stroke="#b0f2ff"
                  strokeWidth={1.15 / view.scale}
                  strokeOpacity=".9"
                />
              </g>
            ))}
            <path
              d={provincePath}
              stroke="#68d4ff"
              strokeWidth={1.8 / view.scale}
            />
          </g>
          <g className="map-marker-leaders" pointerEvents="none">
            {markers
              .filter((marker) => marker.displaced)
              .map((marker) => (
                <g key={marker.point.id}>
                  <line
                    x1={marker.sourceX}
                    y1={marker.sourceY}
                    x2={marker.x}
                    y2={marker.y}
                    stroke="#70c9dd"
                    strokeOpacity=".45"
                    strokeWidth={0.8 / view.scale}
                  />
                  <circle
                    cx={marker.sourceX}
                    cy={marker.sourceY}
                    r={1.3 / view.scale}
                    fill="#9fd7e8"
                    fillOpacity=".65"
                  />
                </g>
              ))}
          </g>
          {markers.map((marker) => (
            <g
              key={marker.point.id}
              transform={`translate(${marker.x} ${marker.y})`}
              className="map-point"
              data-bridge-id={marker.point.id}
              data-search-match={highlighted.has(marker.point.id)}
              opacity={
                searchQuery && !highlighted.has(marker.point.id) ? 0.25 : 1
              }
              data-displaced={marker.displaced}
              data-count={1}
              data-grade={
                gradeBasis === "conditionGrades"
                  ? marker.point.conditionGradeBucket
                  : marker.point.structureGradeBucket
              }
              role="button"
              tabIndex={0}
              aria-label={`${marker.point.name}，查看桥梁信息`}
              onMouseEnter={(e) => {
                if (!drag.current?.moved)
                  showCard([marker.point], e.currentTarget, marker.displaced);
              }}
              onMouseLeave={closeCard}
              onFocus={(e) =>
                showCard([marker.point], e.currentTarget, marker.displaced)
              }
              onBlur={(e) => {
                if (!container.current?.contains(e.relatedTarget)) closeCard();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onBridge(marker.point.id);
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!drag.current?.moved) onBridge(marker.point.id);
              }}
            >
              {highlighted.has(marker.point.id) && (
                <circle
                  className="map-search-highlight"
                  r={9 / view.scale}
                  fill="#ffe066"
                  fillOpacity=".25"
                  stroke="#ffe066"
                  strokeWidth={2.5 / view.scale}
                  pointerEvents="none"
                />
              )}
              <circle r={8 / view.scale} fill="transparent" />
              <circle
                className="map-point-ring"
                r={5.5 / view.scale}
                style={{
                  fill: gradeColor(
                    gradeBasis === "conditionGrades"
                      ? marker.point.conditionGradeBucket
                      : marker.point.structureGradeBucket,
                  ),
                  stroke: gradeColor(
                    gradeBasis === "conditionGrades"
                      ? marker.point.conditionGradeBucket
                      : marker.point.structureGradeBucket,
                  ),
                }}
                fillOpacity=".18"

                strokeWidth={1.3 / view.scale}
              />
              <circle
                className="map-point-core"
                r={3.2 / view.scale}
                style={{
                  fill: gradeColor(
                    gradeBasis === "conditionGrades"
                      ? marker.point.conditionGradeBucket
                      : marker.point.structureGradeBucket,
                  ),
                }}
              />
            </g>
          ))}
          {view.scale >= 2.4 &&
            (() => {
              const occupied: { x: number; y: number; width: number }[] = [];
              return countyPaths.map((county) => {
                const [x, y] = project(county.label[0], county.label[1]);
                const width = (county.name.length * 13 + 12) / view.scale;
                if (
                  occupied.some(
                    (p) =>
                      Math.abs(x - p.x) < (width + p.width) / 2 &&
                      Math.abs(y - p.y) < 23 / view.scale,
                  )
                )
                  return null;
                occupied.push({ x, y, width });
                return (
                  <text
                    key={county.adcode}
                    x={x}
                    y={y}
                    className="county-label"
                    fontSize={13 / view.scale}
                    strokeWidth={3 / view.scale}
                    pointerEvents="none"
                  >
                    {county.name}
                  </text>
                );
              });
            })()}
          {geoData.cities.map((city) => {
            const [x, y] = project(city.label[0], city.label[1]);
            return (
              <text
                key={city.name}
                x={x}
                y={y - 12 / view.scale}
                className="city-label"
                opacity={view.scale >= 2.4 ? 0.45 : 1}
                fontSize={16 / view.scale}
                pointerEvents="none"
              >
                {city.name}
              </text>
            );
          })}
        </g>
        {view.scale <= 1.3 && (
          <>
            <text
              x="850"
              y="400"
              fill="#47657c"
              fontSize="19"
              letterSpacing="6"
            >
              黄海
            </text>
            <g transform="translate(940 105)" fill="none" stroke="#5d8397">
              <path d="M0 35V0L-5 12M0 0L5 12" />
              <text x="-4" y="-10" fill="#a4bdca" stroke="none" fontSize="12">
                N
              </text>
            </g>
          </>
        )}
      </svg>
      <div className="map-controls">
        <button aria-label="放大地图" onClick={() => zoom(1.5)}>
          ＋
        </button>
        <button aria-label="缩小地图" onClick={() => zoom(1 / 1.5)}>
          −
        </button>
        <button
          aria-label="重置地图"
          onClick={() => {
            setHover(null);
            setView({ x: 0, y: 0, scale: 1 });
          }}
        >
          全省
        </button>
      </div>
      <div className="map-legend map-grade-legend">
        <strong>
          {gradeBasis === "conditionGrades" ? "完好状况 BCI" : "结构状况 BSI"}
        </strong>
        {[
          ["3", "A / 合格"],
          ["4", "B级"],
          ["5", "C级"],
          ["6", "D级"],
          ["7", "E / 不合格"],
          ["other", "无等级 / 其他"],
        ].map(([code, label]) => (
          <span key={code}>
            <i style={{ background: gradeColor(code) }} />
            {label}
          </span>
        ))}
        <small>一点一桥 · 密集点连线指向真实位置</small>
      </div>
      {hover && (
        <div
          className="map-tooltip map-detail-card"
          role="dialog"
          aria-label="桥梁信息"
          style={{ left: hover.x, top: hover.y }}
          onMouseEnter={keepCard}
          onMouseLeave={closeCard}
          onFocus={keepCard}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) closeCard();
          }}
        >
          <button
            className="map-card-close"
            aria-label="关闭桥梁信息"
            onClick={() => setHover(null)}
          >
            ×
          </button>
          {hover.displaced && (
            <p className="map-offset-note">
              此标记为避让重叠已错位，连线起点为真实位置。
            </p>
          )}
          <BridgeMapCard
            key={hover.points.map((p) => p.id).join(",")}
            points={hover.points}
            cityName={(code) =>
              cities.find((city) => city.code === code)?.label || code
            }
            onBridge={onBridge}
          />
        </div>
      )}
    </div>
  );
}
