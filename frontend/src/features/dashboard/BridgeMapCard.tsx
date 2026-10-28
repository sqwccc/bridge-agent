import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { bridgeQuery } from "../../api/bridge-query";
import type { Point } from "../../api/types";

/** 只在查看点位时读取档案；聚合点可逐桥查看，未提供的字段明确留空。 */
export function BridgeMapCard({
  points,
  cityName,
  onBridge,
}: {
  points: Point[];
  cityName: (code: string) => string;
  onBridge: (id: string) => void;
}) {
  const [selected, setSelected] = useState(points[0].id);
  const point = points.find((p) => p.id === selected) || points[0];
  const [settledId, setSettledId] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSettledId(point.id), 150);
    return () => clearTimeout(timer);
  }, [point.id]);
  const query = useQuery({
    ...bridgeQuery(point.id),
    enabled: settledId === point.id,
  });
  const bridge = query.data;
  return (
    <>
      <div className="map-card-eyebrow">
        桥梁档案{" "}
        <span>
          {points.length > 1
            ? `此处 ${points.length} 座桥梁`
            : cityName(point.cityCode)}
        </span>
      </div>
      {points.length > 1 && (
        <select
          aria-label="选择重叠桥梁"
          value={point.id}
          onChange={(e) => setSelected(e.target.value)}
        >
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <h3>{point.name}</h3>
      <div className="map-card-location">
        {bridge?.city || cityName(point.cityCode)} ·{" "}
        {bridge?.road || "道路未提供"}
      </div>
      {query.isPending ? (
        <div className="map-card-status" role="status">
          正在读取桥梁档案…
        </div>
      ) : query.error ? (
        <div className="map-card-status" role="alert">
          档案读取失败{" "}
          <button onClick={() => void query.refetch()}>重试</button>
        </div>
      ) : (
        bridge && (
          <dl className="map-card-facts">
            <div>
              <dt>桥梁编号</dt>
              <dd>{bridge.code || "未提供"}</dd>
            </div>
            <div>
              <dt>结构类型</dt>
              <dd>{bridge.typeName || "未提供"}</dd>
            </div>
            <div>
              <dt>桥长 / 桥宽</dt>
              <dd>
                {bridge.length == null ? "—" : `${bridge.length} m`} /{" "}
                {bridge.width == null ? "—" : `${bridge.width} m`}
              </dd>
            </div>
            <div>
              <dt>监测类型</dt>
              <dd>{bridge.effectiveMonitoringTypeName || "未提供"}</dd>
            </div>
            <div>
              <dt>完好状况 BCI</dt>
              <dd>{bridge.conditionGradeName || "未提供"}</dd>
            </div>
            <div>
              <dt>结构状况 BSI</dt>
              <dd>{bridge.structureGradeName || "未提供"}</dd>
            </div>
            <div>
              <dt>养护单位</dt>
              <dd>{bridge.maintainer || "未提供"}</dd>
            </div>
          </dl>
        )
      )}
      <div className="map-card-footer">
        <span>
          {point.longitude.toFixed(4)}° E / {point.latitude.toFixed(4)}° N
        </span>
        <button onClick={() => onBridge(point.id)}>查看档案 →</button>
      </div>
    </>
  );
}
