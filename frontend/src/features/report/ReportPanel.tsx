import { useState, useEffect, useRef } from "react";
import { Modal, Select } from "antd";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Report } from "../../api/types";
import { time } from "../../api/types";
import { Empty, ErrorState, Panel } from "../shared/ui";

const statusText: Record<string, string> = {
  MISSING_ATTACHMENT: "附件缺失",
  SOURCE_NOT_CONFIGURED: "附件来源未配置",
  UNSUPPORTED_SOURCE: "附件地址不支持",
  AVAILABLE: "地址已配置，读取时验证",
};

/** 定检报告和监测报告按来源明确区分；附件只能通过受保护接口访问。 */
export function ReportPanel({ bridgeId }: { bridgeId: string }) {
  const reports = useQuery({
    queryKey: ["reports", bridgeId],
    queryFn: () =>
      api<Report[]>(`bridges/${encodeURIComponent(bridgeId)}/reports`),
  });
  const requestVersion = useRef(0);
  useEffect(
    () => () => {
      requestVersion.current++;
    },
    [],
  );
  const [preview, setPreview] = useState<{
    name: string;
    url: string;
    image: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<Report | null>(null);
  const [source, setSource] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  const fileUrl = (r: Report) =>
    `/api/v1/bridges/${encodeURIComponent(bridgeId)}/reports/${encodeURIComponent(r.id)}/file`;
  const readFile = async (r: Report, download: boolean) => {
    const version = ++requestVersion.current;
    setLoading(r.id);
    setErrors((old) => ({ ...old, [r.id]: "" }));
    try {
      const response = await fetch(`${fileUrl(r)}?download=${download}`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401)
          window.dispatchEvent(new Event("session-expired"));
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.message || `文件读取失败（${response.status}）`,
        );
      }
      const blob = await response.blob();
      if (version !== requestVersion.current) return;
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        const encoded = (
          response.headers.get("content-disposition") || ""
        ).match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        let name =
          r.name +
          (r.pdf && !r.name.toLowerCase().endsWith(".pdf") ? ".pdf" : "");
        if (encoded) {
          try {
            name = decodeURIComponent(encoded);
          } catch {
            /* 使用元数据名称 */
          }
        }
        a.download = name.replace(/[\\/\r\n]/g, "_");
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else
        setPreview({ name: r.name, url, image: r.attachmentKind === "IMAGE" });
    } catch (error) {
      if (version !== requestVersion.current) return;
      setErrors((old) => ({
        ...old,
        [r.id]: error instanceof Error ? error.message : "附件读取失败",
      }));
    } finally {
      if (version === requestVersion.current) setLoading(null);
    }
  };
  const openReport = (report: Report) => {
    setPreview(null);
    setSelected(report);
    if (
      report.status === "AVAILABLE" &&
      (report.pdf || report.attachmentKind === "IMAGE")
    ) {
      void readFile(report, false);
    }
  };
  const history = selected
    ? (reports.data ?? [])
        .filter(
          (r) =>
            r.source === selected.source &&
            r.inspectionTypeName === selected.inspectionTypeName,
        )
        .sort((a, b) =>
          (b.inspectionDate ?? "").localeCompare(a.inspectionDate ?? ""),
        )
    : [];
  return (
    <Panel
      title="桥梁检测报告"
      note={`共 ${reports.data?.length ?? "—"} 份 · 点击名称查看`}
      className="report-panel"
    >
      {reports.error ? (
        <ErrorState
          error={reports.error}
          retry={() => void reports.refetch()}
        />
      ) : reports.isPending ? (
        <Empty>正在读取报告…</Empty>
      ) : !reports.data?.length ? (
        <Empty>暂无可确认归属的报告。监测分析报告数据待提供。</Empty>
      ) : (
        <>
          <div className="report-toolbar">
            <Select
              aria-label="报告来源筛选"
              size="small"
              value={source}
              onChange={setSource}
              options={[
                { value: "", label: "全部来源" },
                ...Array.from(
                  new Map(
                    reports.data.map((r) => [r.source, r.sourceLabel]),
                  ).entries(),
                ).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
          <div className="report-list table-scroll">
            <table className="data-table report-table">
              <thead>
                <tr>
                  <th>年份</th>
                  <th>报告类型</th>
                  <th>报告名称</th>
                </tr>
              </thead>
              <tbody>
                {reports.data
                  .filter((r) => !source || r.source === source)
                  .map((r) => (
                    <tr className="report-row" key={r.id}>
                      <td>{r.inspectionDate?.slice(0, 4) || "—"}</td>
                      <td>{r.inspectionTypeName || r.sourceLabel}</td>
                      <td>
                        <button
                          className="report-name-link"
                          onClick={() => openReport(r)}
                          disabled={loading !== null}
                        >
                          {r.name} <span aria-hidden="true">⧉</span>
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Modal
        title={`${selected?.inspectionTypeName || "桥梁检测报告"} · 历年报告`}
        open={!!selected}
        onCancel={() => {
          requestVersion.current++;
          setLoading(null);
          setSelected(null);
          setPreview(null);
        }}
        footer={null}
        width="88vw"
        className="bridge-report-modal"
        destroyOnHidden
      >
        <div className="report-history">
          <div className="report-history-heading">
            共 {history.length} 份 · 按检测日期排序
          </div>
          {history.map((r) => (
            <section
              className={`report-history-item ${selected?.id === r.id ? "is-open" : ""}`}
              key={r.id}
            >
              <button
                className="report-history-toggle"
                disabled={loading !== null}
                onClick={() => openReport(r)}
                aria-expanded={selected?.id === r.id}
              >
                <span>
                  {r.name}
                  <small>
                    {time(r.inspectionDate)} · {r.sourceLabel}
                  </small>
                </span>
                <span>{selected?.id === r.id ? "已展开 ▴" : "展开 ▾"}</span>
              </button>
              {selected?.id === r.id && (
                <div className="report-detail-layout">
                  <div className="report-preview-surface">
                    {loading === r.id ? (
                      <Empty>正在读取报告…</Empty>
                    ) : preview ? (
                      preview.image ? (
                        <img
                          className="report-image"
                          src={preview.url}
                          alt={preview.name}
                        />
                      ) : (
                        <iframe
                          className="pdf-frame"
                          title="报告 PDF 预览"
                          src={preview.url}
                        />
                      )
                    ) : (
                      <Empty>
                        {errors[r.id]
                          ? "附件读取失败，可重试或下载"
                          : r.status === "AVAILABLE"
                            ? "该格式暂不支持在线预览，请下载查看"
                            : "暂无可预览的报告附件"}
                      </Empty>
                    )}
                  </div>
                  <aside className="report-detail-meta">
                    <dl>
                      {[
                        ["报告年份", r.inspectionDate?.slice(0, 4) || "未提供"],
                        ["报告类型", r.inspectionTypeName],
                        ["报告名称", r.name],
                        [
                          "报告状态",
                          r.requirementStatus === "ALLOWED_EMPTY"
                            ? "按条件允许为空"
                            : statusText[r.status],
                        ],
                        ["数据来源", r.sourceLabel],
                        ["检测日期", time(r.inspectionDate)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {r.attachmentScope === "TASK" && (
                      <p className="shared-task-label">
                        共享任务附件 · 涉及 {r.relatedBridgeCount ?? "未提供"}{" "}
                        座桥梁
                      </p>
                    )}
                    <div className="report-provenance">
                      <p>{r.statusReason}</p>
                      <p>记录：{r.inspectionId || "未提供"}</p>
                      <p>同步：{time(r.sourceUpdatedAt)}</p>
                      {r.taskId && <p>关联任务：{r.taskId}</p>}
                    </div>
                    {errors[r.id] && (
                      <p role="alert" className="file-read-error">
                        附件读取失败：{errors[r.id]}。来源仍标记为已提供附件。
                      </p>
                    )}
                    <div className="report-actions">
                      {r.status === "AVAILABLE" && (
                        <>
                          {(r.pdf || r.attachmentKind === "IMAGE") && (
                            <button
                              disabled={loading !== null}
                              onClick={() => void readFile(r, false)}
                            >
                              重新预览
                            </button>
                          )}
                          <button
                            disabled={loading !== null}
                            onClick={() => void readFile(r, true)}
                          >
                            {loading === r.id ? "读取中…" : "下载报告"}
                          </button>
                        </>
                      )}
                    </div>
                  </aside>
                </div>
              )}
            </section>
          ))}
        </div>
      </Modal>
    </Panel>
  );
}
