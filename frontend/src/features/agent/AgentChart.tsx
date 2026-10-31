import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type Visualization = {
  type: "bar" | "line" | "scatter" | "table";
  title: string;
  scope: string;
  period: string;
  source: string;
  truncated: boolean;
  series: { key: string; label: string; unit: string }[];
  rows: Record<string, string | number | null>[];
};
const colors = ["#38bdf8", "#fbbf24", "#a78bfa", "#34d399"];

export function AgentChart({ chart }: { chart: Visualization }) {
  if (!chart.rows.length || !chart.series.length) return null;
  const columns =
    chart.type === "table"
      ? chart.series
      : chart.type === "scatter"
        ? chart.series
        : [
            {
              key: "name",
              label: chart.type === "line" ? "时间" : "分组",
              unit: "",
            },
            ...chart.series,
          ];
  return (
    <figure className="agent-chart" aria-label={chart.title}>
      <figcaption>
        <strong>{chart.title}</strong>
        <p>{chart.scope}</p>
        <small>
          {chart.period} · {chart.source}
          {chart.truncated ? " · 数据已截断" : ""}
        </small>
      </figcaption>
      {chart.type !== "table" && (
        <div style={{ width: "100%", height: 280, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart.type === "bar" ? (
              <BarChart
                data={chart.rows}
                margin={{ bottom: 35, left: 8, right: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-20}
                  textAnchor="end"
                  height={70}
                  tick={{ fontSize: 10 }}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                {chart.series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={`${s.label}${s.unit ? `（${s.unit}）` : ""}`}
                    fill={colors[i % colors.length]}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            ) : chart.type === "line" ? (
              <LineChart data={chart.rows} margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  minTickGap={50}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                />
                <YAxis />
                <Tooltip />
                <Legend />
                {chart.series.map((s, i) => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={`${s.label}${s.unit ? `（${s.unit}）` : ""}`}
                    stroke={colors[i % colors.length]}
                    dot={chart.rows.length < 3}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            ) : (
              <ScatterChart margin={{ bottom: 25, left: 10, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={chart.series[0].label}
                  unit={chart.series[0].unit}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={chart.series[1]?.label}
                  unit={chart.series[1]?.unit}
                />
                <Tooltip />
                <Scatter
                  data={chart.rows}
                  fill={colors[0]}
                  isAnimationActive={false}
                />
              </ScatterChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <details open={chart.type === "table"}>
        <summary>查看图表数据与单位</summary>
        <div style={{ overflow: "auto", maxHeight: 320 }}>
          <table>
            <thead>
              <tr>
                {columns.map((s) => (
                  <th key={s.key}>
                    {s.label}
                    {s.unit ? `（${s.unit}）` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((s) => (
                    <td key={s.key}>{r[s.key] ?? "未提供"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
