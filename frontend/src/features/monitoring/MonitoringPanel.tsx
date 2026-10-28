import { useEffect, useRef, useState } from "react";
import { Select } from "antd";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { useStructure } from "../bridge/BridgeStructure";
import { bindingKey, monitorPointsQuery } from "../../api/structure";
import { api } from "../../api/client";
import type { MonitorPoint, Sample, Threshold } from "../../api/types";
import { localTime, time, num } from "../../api/types";
import { Empty, ErrorState, Panel } from "../shared/ui";

/** 指标与单位分别分组；仅加载滚动到可见范围的序列，保持缺测断点。 */
export function MonitoringPanel({ bridgeId }: { bridgeId: string }) {
  const [range, setRange] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    const localDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const duration = Date.parse(to) - Date.parse(from);
    if (
      localDate.test(from) &&
      localDate.test(to) &&
      duration >= 0 &&
      duration <= 31 * 86400000
    ) {
      return { from, to };
    }
    return {
      from: localTime(new Date(Date.now() - 7200000)),
      to: localTime(new Date()),
    };
  });
  const [draft, setDraft] = useState(range);
  const points = useQuery(monitorPointsQuery(bridgeId));
  const { selection, select, parts, selectedPart, config } = useStructure();
  const filtered = !!selection && selection !== "all";
  const chosen = filtered
    ? parts.filter(
        (p) =>
          p.zone === selection.zone &&
          (!selection.part || p.id === selection.part),
      )
    : [];
  const bindings = new Map(
    chosen.flatMap((p) => p.bindings).map((b) => [bindingKey(b), b]),
  );
  const validKeys = new Set((points.data || []).map(bindingKey));
  const invalidCount = [...bindings.keys()].filter(
    (k) => !validKeys.has(k),
  ).length;
  const visiblePoints = filtered
    ? (points.data || []).filter((p) => bindings.has(bindingKey(p)))
    : points.data || [];
  const groups = new Map<string, MonitorPoint[]>();
  for (const point of visiblePoints) {
    const key = JSON.stringify([point.metric || point.deviceType, point.unit]);
    const list = groups.get(key) || [];
    list.push(point);
    groups.set(key, list);
  }
  return (
    <Panel
      title="监测数据曲线"
      note="按指标分行 · 来源实测"
      className="monitor-panel"
    >
      {filtered && (
        <div className="monitor-binding-filter">
          <strong>当前范围：{selectedPart?.name || selection.zone}</strong>
          <button onClick={() => select(null)}>恢复全桥监测</button>
          {!bindings.size && <p>待绑定测点：当前部件或部位尚未绑定测点。</p>}
          {points.data && invalidCount > 0 && (
            <p role="status">
              {invalidCount}个绑定已失效，请在编辑部件中修复。
            </p>
          )}
          {config.error && <p role="alert">部件配置不可用，无法读取绑定。</p>}
        </div>
      )}
      <details className="monitor-history">
        <summary>历史时间查询</summary>
        <div className="date-filters">
          <label>
            从
            <input
              aria-label="监测开始时间"
              type="datetime-local"
              value={draft.from}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  from: e.target.value,
                })
              }
            />
          </label>
          <label>
            至
            <input
              aria-label="监测结束时间"
              type="datetime-local"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          <button onClick={() => setRange(draft)}>查询</button>
        </div>
        <p className="muted-caption">北京时间 · 最多31天 · 未知单位不合并</p>
      </details>
      {points.error ? (
        <ErrorState error={points.error} retry={() => void points.refetch()} />
      ) : points.isPending ? (
        <Empty>正在读取测点…</Empty>
      ) : !groups.size ? (
        <Empty>
          {filtered ? "当前选择没有有效绑定测点。" : "暂无可关联的监测设备。"}
        </Empty>
      ) : (
        [...groups].map(([key, list], i) => (
          <MetricRow
            key={key}
            bridgeId={bridgeId}
            points={list}
            range={range}
            first={i === 0}
          />
        ))
      )}
      <div className="video-placeholder">
        <span>▻</span>
        <div>
          视频监控<small>视频服务待接入</small>
        </div>
      </div>
    </Panel>
  );
}

function MetricRow({
  bridgeId,
  points,
  range,
  first,
}: {
  bridgeId: string;
  points: MonitorPoint[];
  range: { from: string; to: string };
  first: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [showThresholds, setShowThresholds] = useState(false);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [active, setActive] = useState(first);
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setActive(true);
        observer.disconnect();
      }
    });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, [active]);
  const key = (point: MonitorPoint) =>
    JSON.stringify([point.pointId, point.deviceId, point.metric]);
  const devicePrefix = new URLSearchParams(window.location.search).get(
    "devicePrefix",
  );
  const point =
    points.find((p) => key(p) === selected) ||
    (devicePrefix
      ? points.find((p) => p.deviceId.startsWith(devicePrefix))
      : undefined) ||
    points[0]!;
  const series = useQuery({
    queryKey: [
      "samples",
      bridgeId,
      point.pointId,
      point.deviceId,
      point.metric,
      range,
    ],
    queryFn: ({ signal }) =>
      api<{
        items: Sample[];
        truncated: boolean;
      }>(
        `bridges/${encodeURIComponent(bridgeId)}/monitoring/samples`,
        {
          point: point.pointId,
          device: point.deviceId,
          metric: point.metric ?? undefined,
          ...range,
        },
        signal,
      ),
    enabled: active,
  });
  const thresholds = useQuery({
    queryKey: [
      "thresholds",
      bridgeId,
      point.pointId,
      point.deviceId,
      point.metric,
    ],
    queryFn: ({ signal }) =>
      api<Threshold[]>(
        `bridges/${encodeURIComponent(bridgeId)}/monitoring/thresholds`,
        {
          point: point.pointId,
          device: point.deviceId,
          metric: point.metric ?? undefined,
        },
        signal,
      ).then((rows) => rows.filter((row) => row.metric === point.metric)),
    enabled: active && thresholdOpen,
  });
  return (
    <section
      className="metric-row"
      ref={element}
      aria-label={point.metricName || point.metric || "未知指标"}
    >
      <div className="metric-row-heading">
        <strong>{point.metricName || point.metric || "未知指标"}</strong>
        <small>{points.length} 个设备/测点</small>
        <Select
          aria-label={`监测测点 ${point.metricName}`}
          showSearch
          optionFilterProp="label"
          value={key(point)}
          onChange={setSelected}
          options={points.map((p) => ({
            value: key(p),
            label: `${p.pointName} / ${p.deviceName} · ${p.deviceId}`,
          }))}
        />
      </div>
      <div className="monitor-meta">
        <span>
          单位：{point.unit || "来源未提供"}
          {point.unitBasis === "FAQ_2026" ? "（对接字典）" : ""}
        </span>
        <span>
          {range.from.replace("T", " ")} 至 {range.to.replace("T", " ")}
        </span>
      </div>
      <details className="monitor-device-details">
        <summary>设备及来源信息</summary>
        <div className="monitor-device-meta">
          {point.deviceType || "类型未提供"} ·{" "}
          {point.deviceModel || "型号未提供"} · 设备状态编码{" "}
          {point.sourceDeviceStatus ?? "未提供"}
          <br />
          设备同步：{time(point.sourceUpdatedAt)}
        </div>
      </details>
      {!active ? (
        <Empty>滚动到此处读取监测数据…</Empty>
      ) : series.error ? (
        <ErrorState error={series.error} retry={() => void series.refetch()} />
      ) : series.isPending ? (
        <Empty>正在读取监测值…</Empty>
      ) : !series.data?.items.length ? (
        <Empty>
          所选区间暂无监测值，请选择历史时间查询。
          <small>请核对数据时间范围与测点，缺测不会显示为零。</small>
        </Empty>
      ) : (
        <>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series.data.items}>
                <CartesianGrid stroke="#244057" strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(t) =>
                    String(t).slice(5, 16).replace("T", " ")
                  }
                  stroke="#7598ad"
                  minTickGap={35}
                />
                <YAxis stroke="#7598ad" width={45} />
                <Tooltip
                  contentStyle={{
                    background: "#0c2236",
                    borderColor: "#2c5366",
                  }}
                  labelFormatter={(label) => String(label).replace("T", " ")}
                />
                {showThresholds &&
                  thresholds.data
                    ?.filter(
                      (t) =>
                        t.lower != null &&
                        t.upper != null &&
                        t.lower <= t.upper &&
                        t.level != null &&
                        t.level >= 1 &&
                        t.level <= 4 &&
                        !t.extremePlaceholder,
                    )
                    .flatMap((t) =>
                      [t.lower!, t.upper!].map((v, i) => (
                        <ReferenceLine
                          key={`${t.id}-${i}`}
                          y={v}
                          ifOverflow="extendDomain"
                          stroke={
                            (
                              {
                                1: "#e78484",
                                2: "#edb57c",
                                3: "#d7c284",
                                4: "#61bea2",
                              } as Record<number, string>
                            )[t.level!]
                          }
                          strokeDasharray="4 4"
                        />
                      )),
                    )}
                <Line
                  type="linear"
                  dataKey="value"
                  name={point.metricName || point.metric || "监测值"}
                  stroke="#39ded1"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="panel-foot">
            {series.data.items.length} 个记录 · 非数值{" "}
            {series.data.items.filter((p) => p.value === null).length} 个
            {series.data.truncated && " · 数据超过2000条，请缩小查询范围"}
          </div>
        </>
      )}
      {point && (
        <details
          className="threshold-section"
          onToggle={(e) => setThresholdOpen(e.currentTarget.open)}
        >
          <summary>
            监测阈值 ·{" "}
            {!thresholdOpen
              ? "展开查看"
              : thresholds.isPending
                ? "读取中"
                : thresholds.error
                  ? "读取失败"
                  : `${thresholds.data?.length ?? 0} 个区间`}
          </summary>
          {thresholds.error ? (
            <ErrorState
              error={thresholds.error}
              retry={() => void thresholds.refetch()}
            />
          ) : thresholds.isPending ? (
            <p className="muted-caption">正在读取阈值…</p>
          ) : !thresholds.data?.length ? (
            <p className="muted-caption">本设备及指标未提供可关联阈值。</p>
          ) : (
            <>
              <label className="threshold-toggle">
                <input
                  type="checkbox"
                  checked={showThresholds}
                  onChange={(e) => setShowThresholds(e.target.checked)}
                />
                显示阈值参考线
              </label>
              <div className="threshold-scroll">
                <table className="data-table threshold-table">
                  <thead>
                    <tr>
                      <th>监测级别</th>
                      <th>下限 / 上限</th>
                      <th>来源说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thresholds.data.map((t) => (
                      <tr key={t.id}>
                        <td>{t.levelName}</td>
                        <td>
                          {num(t.lower)} / {num(t.upper)}
                          <small>{t.unit || "单位未提供"}</small>
                        </td>
                        <td>
                          {t.dataIssues.length
                            ? t.dataIssues.join("；")
                            : t.note || "来源独立区间"}
                          {t.legacyThreshold && (
                            <small>历史阈值：{t.legacyThreshold}</small>
                          )}
                          <small>同步：{time(t.sourceUpdatedAt)}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted-caption">
                同级可有多个区间。来源未明确边界是否包含；保留原始上下限，不据此重新判断报警。
              </p>
            </>
          )}
        </details>
      )}
    </section>
  );
}
