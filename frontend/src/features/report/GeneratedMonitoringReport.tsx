import { Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import "./monitoring-report.css";

type Threshold = {
  id: string;
  levelName: string;
  lower: number | null;
  upper: number | null;
  dataIssues: string[];
  legacyThreshold: string | null;
};
type Channel = {
  point: {
    pointId: string;
    pointName: string;
    deviceId: string;
    metric: string | null;
    metricName: string;
    unit: string | null;
  };
  samples: number;
  validSamples: number;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
  firstTime: string | null;
  lastTime: string | null;
  thresholds: Threshold[];
};
export type MonitoringDocument = {
  id: string;
  generatedAt: string;
  timezone: string;
  from: string;
  to: string;
  bridge: {
    name: string;
    code: string;
    city: string;
    road: string;
    manager: string;
    length: number | null;
    width: number | null;
    typeName: string;
    maintenanceCategoryName: string;
  };
  samples: number;
  validSamples: number;
  configuredDevices: number;
  configuredPoints: number;
  channelsWithData: number;
  channels: Channel[];
};
const fmt = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 }).format(v);
const stamp = (v: string | null) => v?.replace("T", " ") || "—";
function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function MonitoringPaper({
  report: r,
  includeDetails = false,
}: {
  report: MonitoringDocument;
  includeDetails?: boolean;
}) {
  const groups = new Map<
    string,
    {
      name: string;
      unit: string | null;
      count: number;
      samples: number;
      sum: number;
      min: number | null;
      max: number | null;
    }
  >();
  for (const c of r.channels) {
    const key = JSON.stringify([c.point.metric, c.point.unit]);
    const g = groups.get(key) || {
      name: c.point.metricName,
      unit: c.point.unit,
      count: 0,
      samples: 0,
      sum: 0,
      min: null,
      max: null,
    };
    g.count++;
    g.samples += c.validSamples;
    g.sum += (c.average ?? 0) * c.validSamples;
    if (c.minimum != null)
      g.min = g.min == null ? c.minimum : Math.min(g.min, c.minimum);
    if (c.maximum != null)
      g.max = g.max == null ? c.maximum : Math.max(g.max, c.maximum);
    groups.set(key, g);
  }
  const indicators = [...groups.values()];
  const noThreshold = r.channels.filter((c) => !c.thresholds.length).length;
  const issueThreshold = r.channels.filter((c) =>
    c.thresholds.some((t) => t.dataIssues.length),
  ).length;
  const sparse = r.channels.filter(
    (c) => c.samples > 0 && c.samples <= 2,
  ).length;
  const first = r.channels
    .map((c) => c.firstTime)
    .filter((t): t is string => !!t)
    .sort()[0];
  const last = r.channels
    .map((c) => c.lastTime)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);
  return (
    <article className="monitor-paper" aria-label="生成的监测报告">
      <header>
        <div>{r.bridge.manager || "桥梁结构健康监测系统"}</div>
        <h1>{r.bridge.name}结构健康监测报告</h1>
        <p>
          编号：{r.id}
          <br />
          生成时间：{stamp(r.generatedAt)}（北京时间）
        </p>
      </header>
      <table>
        <tbody>
          <tr>
            <th>桥梁名称</th>
            <td>{r.bridge.name}</td>
            <th>桥梁编码</th>
            <td>{r.bridge.code || "—"}</td>
          </tr>
          <tr>
            <th>结构类型</th>
            <td>{r.bridge.typeName || "—"}</td>
            <th>养护类别</th>
            <td>{r.bridge.maintenanceCategoryName || "—"}</td>
          </tr>
          <tr>
            <th>全长 / 宽度</th>
            <td>
              {fmt(r.bridge.length)} / {fmt(r.bridge.width)} m
            </td>
            <th>路线 / 城市</th>
            <td>
              {r.bridge.road || "—"} / {r.bridge.city || "—"}
            </td>
          </tr>
          <tr>
            <th>统计日期</th>
            <td colSpan={3}>
              {r.from} 至 {r.to}（含结束日，北京时间）
            </td>
          </tr>
          <tr>
            <th>实测覆盖</th>
            <td colSpan={3}>
              {stamp(first ?? null)} — {stamp(last ?? null)}
            </td>
          </tr>
        </tbody>
      </table>
      <h2>一、监测概况</h2>
      <table>
        <thead>
          <tr>
            <th>配置设备</th>
            <th>测点</th>
            <th>采样记录</th>
            <th>有数据通道 / 配置通道</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{r.configuredDevices}</td>
            <td>{r.configuredPoints}</td>
            <td>{fmt(r.samples)}</td>
            <td>
              {r.channelsWithData} / {r.channels.length}
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        本期按当前有效点位、设备与指标统计全部匹配实测记录。有数据通道比例为{" "}
        {r.channels.length
          ? fmt((r.channelsWithData / r.channels.length) * 100) + "%"
          : "—"}
        ，该比例不代表设备实时在线率。
      </p>
      {!r.samples && (
        <p className="report-important">
          所选时段暂无匹配实测数据，不作结构安全或无报警判断。
        </p>
      )}
      <h2>二、监测数据统计</h2>
      <table>
        <thead>
          <tr>
            <th>项目</th>
            <th>参考单位</th>
            <th>通道</th>
            <th>有效样本</th>
            <th>实测区间</th>
            <th>均值</th>
          </tr>
        </thead>
        <tbody>
          {indicators.map((g, i) => (
            <tr key={i}>
              <td>{g.name}</td>
              <td>{g.unit || "未提供"}</td>
              <td>{g.count}</td>
              <td>{fmt(g.samples)}</td>
              <td>
                {fmt(g.min)} ~ {fmt(g.max)}
              </td>
              <td>{fmt(g.samples ? g.sum / g.samples : null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="report-note">
        区间为同指标通道的极值包络，均值按有效样本数加权；单位沿用系统指标字典参考值，未完成现场量纲校验。
      </p>
      <h2>三、报警与阈值核对</h2>
      <p>
        自动报警分级：待核对。来源阈值的区间含义与边界规则尚未确认，本报告不将区间比较作为正式报警事件，也不统计处置状态。阈值配置不代表实际发生的报警事件。
      </p>
      <p>
        共 {r.channels.length} 个通道，其中 {r.channels.length - noThreshold}{" "}
        个已配置阈值，{noThreshold} 个未关联阈值，{issueThreshold}{" "}
        个存在阈值资料问题。
      </p>
      <details
        className={`report-appendix ${includeDetails ? "include-print" : ""}`}
        open={includeDetails || undefined}
      >
        <summary>
          查看完整阈值明细（
          {r.channels.reduce((n, c) => n + c.thresholds.length, 0)} 条）
        </summary>
        <table>
          <thead>
            <tr>
              <th>点位 / 设备 / 指标</th>
              <th>来源级别</th>
              <th>下限 ~ 上限</th>
              <th>核对说明</th>
            </tr>
          </thead>
          <tbody>
            {r.channels.flatMap((c) =>
              c.thresholds.map((t) => (
                <tr
                  key={`${c.point.pointId}-${c.point.deviceId}-${c.point.metric}-${t.id}`}
                >
                  <td>
                    {c.point.pointName || c.point.pointId}
                    <br />
                    {c.point.deviceId}
                    <br />
                    {c.point.metricName}
                  </td>
                  <td>{t.levelName}</td>
                  <td>
                    {fmt(t.lower)} ~ {fmt(t.upper)}
                  </td>
                  <td>
                    {t.dataIssues.join("；") || "边界含义待核对"}
                    {t.legacyThreshold ? `；原文：${t.legacyThreshold}` : ""}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </details>
      <h2>四、结构技术状况评价</h2>
      <p>
        本期未评价。尚未接入经确认的定检基线、自振频率比、冲击系数比及构件评分依据，不输出
        Dr、BCI*、BSI* 或推算的结构等级。已有定检报告请在报告附件列表查看。
      </p>
      <h2>五、数据质量</h2>
      <table>
        <thead>
          <tr>
            <th>检查项</th>
            <th>数量</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["无实测数据通道", r.channels.length - r.channelsWithData],
            ["样本仅1至2条的通道", sparse],
            ["未关联阈值通道", noThreshold],
            ["阈值存在来源问题的通道", issueThreshold],
            ["空值采样记录", r.samples - r.validSamples],
          ].map(([name, value]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="report-note">
        以上检查项可重叠；未验证采样频率、量纲和标定系数，不能据此计算完整率或可评分率。
      </p>
      <h2>六、结论与建议</h2>
      <ol>
        <li>
          {r.samples
            ? `本期共统计 ${fmt(r.samples)} 条采样记录，覆盖 ${r.channelsWithData} 个有效配置通道。`
            : "本期数据不足，建议核对采集时段、数据接入状态和通道归属。"}
        </li>
        {noThreshold > 0 && (
          <li>核对并补充 {noThreshold} 个通道的阈值资料。</li>
        )}
        {issueThreshold > 0 && (
          <li>复核 {issueThreshold} 个通道的阈值缺项、倒置或极值占位问题。</li>
        )}
        {sparse > 0 && <li>{sparse} 个通道样本稀少，需结合采样计划核对。</li>}
        <li>
          确认阈值边界、量纲与评价基线后，再开展报警分级和结构评分。本报告为监测数据汇总，不代替现场检测结论。
        </li>
      </ol>
      <h2>七、监测项目分布</h2>
      <figure>
        <figcaption>各监测项目配置通道数</figcaption>
        <svg
          viewBox={`0 0 650 ${Math.max(50, indicators.length * 28)}`}
          role="img"
          aria-label="各指标通道数"
        >
          {indicators.map((g, i) => (
            <g key={i} transform={`translate(0 ${i * 28})`}>
              <text x="0" y="18" fontSize="12">
                {g.name}
              </text>
              <rect
                x="130"
                y="4"
                height="18"
                width={
                  (400 * g.count) /
                  Math.max(1, ...indicators.map((v) => v.count))
                }
                fill="#477d9d"
              />
              <text x="545" y="18" fontSize="12">
                {g.count} 路
              </text>
            </g>
          ))}
        </svg>
      </figure>
      <p>
        本期有实测数据的通道 {r.channelsWithData} 个，无实测数据的通道{" "}
        {r.channels.length - r.channelsWithData}{" "}
        个。完整配置清单可按需展开查看。
      </p>
      <details
        className={`report-appendix ${includeDetails ? "include-print" : ""}`}
        open={includeDetails || undefined}
      >
        <summary>查看完整通道明细（{r.channels.length} 个）</summary>
        <table>
          <thead>
            <tr>
              <th>点位 / 设备</th>
              <th>指标</th>
              <th>样本</th>
              <th>最小 / 最大 / 均值</th>
            </tr>
          </thead>
          <tbody>
            {r.channels.map((c) => (
              <tr
                key={JSON.stringify([
                  c.point.pointId,
                  c.point.deviceId,
                  c.point.metric,
                ])}
              >
                <td>
                  {c.point.pointName || c.point.pointId}
                  <br />
                  {c.point.deviceId}
                </td>
                <td>{c.point.metricName}</td>
                <td>{fmt(c.samples)}</td>
                <td>
                  {fmt(c.minimum)} / {fmt(c.maximum)} / {fmt(c.average)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <table className="report-sign">
        <tbody>
          <tr>
            <th>编制</th>
            <td></td>
            <th>审核</th>
            <td></td>
            <th>批准</th>
            <td></td>
          </tr>
        </tbody>
      </table>
      <footer>
        统计生成时已入库实测值，配合当前有效档案与阈值；历史数据后续修订可能改变重新生成的结果。本次报告未归档。
      </footer>
    </article>
  );
}

export function GeneratedMonitoringReport({ bridgeId }: { bridgeId: string }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<MonitoringDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [includeDetails, setIncludeDetails] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!report) return;
    document.body.classList.add("printing-monitor-report");
    return () => document.body.classList.remove("printing-monitor-report");
  }, [report]);
  useEffect(() => {
    if (!report) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReport(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [report]);
  const generate = async () => {
    const days = (Date.parse(to) - Date.parse(from)) / 86400000;
    if (!Number.isFinite(days) || days < 0 || days >= 31) {
      setError("请选择1至31个自然日");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const data = await api<MonitoringDocument>(
        `bridges/${encodeURIComponent(bridgeId)}/monitoring-report`,
        { from, to },
        controller.signal,
      );
      if (!controller.signal.aborted) setReport(data);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "报告生成失败");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="monitor-report-generator">
      <div className="monitor-report-controls">
        <label>
          统计开始日期
          <input
            aria-label="统计开始日期"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          统计结束日期
          <input
            aria-label="统计结束日期"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button disabled={busy} onClick={() => void generate()}>
          {busy ? "正在生成…" : "生成监测报告"}
        </button>
      </div>
      <small>
        北京时间 · 最多31日 · A4预览及打印，按所选时段生成监测数据报告
      </small>
      {error && <p role="alert">{error}</p>}
      {report &&
        createPortal(
          <div
            className="monitor-report-print-host"
            role="dialog"
            aria-modal="true"
            aria-label="监测报告预览"
          >
            <nav>
              <span>监测报告 · A4纵版</span>
              <label>
                <input
                  type="checkbox"
                  checked={includeDetails}
                  onChange={(e) => setIncludeDetails(e.target.checked)}
                />{" "}
                导出包含完整明细
              </label>
              <button onClick={() => window.print()}>打印 / 导出 PDF</button>
              <button autoFocus onClick={() => setReport(null)}>
                关闭预览
              </button>
            </nav>
            <MonitoringPaper report={report} includeDetails={includeDetails} />
          </div>,
          document.body,
        )}
    </section>
  );
}

export function MonitoringReportEntry({ bridgeId }: { bridgeId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="record-entry" onClick={() => setOpen(true)}>
        监测报告 →
      </button>
      <Modal
        title="生成监测报告"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <GeneratedMonitoringReport bridgeId={bridgeId} />
      </Modal>
    </>
  );
}
