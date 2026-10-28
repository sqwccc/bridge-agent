import { Link, useParams, useSearchParams } from "react-router";
import { Drawer } from "antd";
import { useQuery } from "@tanstack/react-query";
import { bridgeQuery } from "../api/bridge-query";
import type { FieldStatus } from "../api/types";
import { num, time } from "../api/types";
import {
  AgentPlaceholder,
  Empty,
  ErrorState,
  Panel,
  Topbar,
} from "../features/shared/ui";
import { AlarmPanel } from "../features/alarm/AlarmPanel";
import { MonitoringPanel } from "../features/monitoring/MonitoringPanel";
import { ReportPanel } from "../features/report/ReportPanel";
import { ArchiveFacts } from "../features/bridge/ArchiveFacts";
import { StructureProvider } from "../features/bridge/BridgeStructure";
import { BridgeVisual, BridgeHealth } from "../features/bridge/BridgeVisual";

function SourceField({
  value,
  status,
}: {
  value: string | null;
  status: FieldStatus;
}) {
  return (
    <span className={`source-field field-${status.status.toLowerCase()}`}>
      {value ?? "未提供"}
      {status.status !== "PRESENT" && <small>{status.reason}</small>}
    </span>
  );
}

export function BridgePage() {
  const id = useParams().bridgeId!;
  const [params, setParams] = useSearchParams();
  const profileTab = params.get("archive") === "full" ? "archive" : "overview";
  const setProfileTab = (tab: "overview" | "archive") =>
    setParams({ archive: tab === "archive" ? "full" : "overview" });
  const bridge = useQuery(bridgeQuery(id));
  const b = bridge.data;
  return (
    <main className="dashboard-page prototype-bridge-page">
      <Topbar
        title={b?.name || "单桥运行档案"}
        back
        description={
          b && (
            <>
              <span>
                {b.city} · {b.typeName} · 全长 {num(b.length)} m · 跨径组合{" "}
                {b.archive?.spanArrangement || "未提供"}
              </span>
              <span>
                {b.road || "道路未提供"} · 荷载{" "}
                {b.archive?.loadGradeName || "未提供"} · 建成{" "}
                {b.completedDate || "未提供"} · 运维{" "}
                {b.maintainer || b.manager || "未提供"}
              </span>
            </>
          )
        }
      />
      {bridge.error ? (
        <ErrorState error={bridge.error} retry={() => void bridge.refetch()} />
      ) : !b ? (
        <Empty>正在读取桥梁档案…</Empty>
      ) : (
        <>
          <StructureProvider key={id} bridgeId={id}>
            <div className="prototype-bridge-grid">
              <div className="bridge-model-column">
                <AgentPlaceholder
                  bridgeId={id}
                  onArchive={() => setProfileTab("overview")}
                />
                <BridgeVisual key={id} bridge={b} />
              </div>
              <BridgeHealth
                bridge={b}
                onArchive={() => setProfileTab("overview")}
              />
              <aside className="bridge-analysis-column">
                <MonitoringPanel key={`monitor-${id}`} bridgeId={id} />
                <AlarmPanel key={`alarm-${id}`} bridgeId={id} />
                <ReportPanel key={`reports-${id}`} bridgeId={id} />
              </aside>
            </div>
          </StructureProvider>
          <div className="bridge-secondary-tools">
            <span>
              来源同步：{time(b.sourceUpdatedAt)} · {b.code}
            </span>
            <button onClick={() => setProfileTab("archive")}>完整档案</button>
            <Link
              className="record-entry"
              to={`/bridges/${encodeURIComponent(id)}/records`}
            >
              巡检 · 病害 · 维修记录 →
            </Link>
          </div>
          <Drawer
            title="桥梁资料"
            open={params.has("archive")}
            onClose={() => setParams({})}
            size={1000}
            className="archive-drawer"
            destroyOnHidden
          >
            <Panel
              title="桥梁基础档案"
              note={
                b.dataIssues.length
                  ? `来源待核查 ${b.dataIssues.length} 项`
                  : "来源原始资料"
              }
              className="profile-panel"
            >
              <div className="tabs profile-tabs">
                <button
                  className={profileTab === "overview" ? "active" : ""}
                  onClick={() => setProfileTab("overview")}
                >
                  概况与评价
                </button>
                <button
                  className={profileTab === "archive" ? "active" : ""}
                  onClick={() => setProfileTab("archive")}
                >
                  完整档案
                </button>
              </div>
              {profileTab === "overview" ? (
                <>
                  <dl className="bridge-facts">
                    <div>
                      <dt>养护类别</dt>
                      <dd>{b.maintenanceCategoryName}</dd>
                    </div>
                    <div>
                      <dt>完好状况 BCI · 编码 {b.conditionGrade ?? "—"}</dt>
                      <dd>
                        <SourceField
                          value={
                            b.conditionGrade == null
                              ? null
                              : b.conditionGradeName
                          }
                          status={b.conditionGradeStatus}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>结构状况 BSI · 编码 {b.structureGrade ?? "—"}</dt>
                      <dd>
                        <SourceField
                          value={
                            b.structureGrade == null
                              ? null
                              : b.structureGradeName
                          }
                          status={b.structureGradeStatus}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>使用 / 移交状态</dt>
                      <dd>
                        {b.bridgeStatusName} / {b.transferredName}
                      </dd>
                    </div>
                    <div>
                      <dt>拆除 / 处理状态</dt>
                      <dd>
                        {b.demolishedName} / {b.demolitionStatusName}
                      </dd>
                    </div>
                    <div>
                      <dt>最近结构检测日期</dt>
                      <dd>
                        <SourceField
                          value={b.inspectionDate}
                          status={b.inspectionDateStatus}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>底数检测报告</dt>
                      <dd>
                        <SourceField
                          value={
                            b.inspectionReportPresent
                              ? "已提供地址，访问状态见报告列表"
                              : null
                          }
                          status={b.inspectionReportStatus}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>来源是否已建监测系统</dt>
                      <dd>
                        {b.monitoringSystemBuilt == null
                          ? "未提供"
                          : b.monitoringSystemBuilt
                            ? "是"
                            : "否"}
                      </dd>
                    </div>
                    <div>
                      <dt>有效关联监测设备</dt>
                      <dd>
                        {b.hasMonitoringDevices ? "有" : "无"} · 上报类型编码{" "}
                        {b.reportedMonitoringType ?? "未提供"}
                      </dd>
                    </div>
                    {[
                      ["桥梁编号", b.code],
                      ["所在城市", b.city],
                      ["所在道路", b.road],
                      ["建成年月", b.completedDate],
                      ["管理单位", b.manager],
                      ["养护单位", b.maintainer],
                      [
                        "经度 / 纬度",
                        b.longitude != null && b.latitude != null
                          ? `${b.longitude.toFixed(6)} / ${b.latitude.toFixed(6)}`
                          : null,
                      ],
                    ].map(([name, value]) => (
                      <div key={name}>
                        <dt>{name}</dt>
                        <dd>{value ?? "未提供"}</dd>
                      </div>
                    ))}
                  </dl>
                  {!!b.dataIssues.length && (
                    <div className="source-issues" role="note">
                      <strong>来源数据待核查</strong>
                      {b.dataIssues.map((issue) => (
                        <p key={`${issue.field}-${issue.code}`}>
                          {(
                            {
                              conditionGrade: "完好状况",
                              structureGrade: "结构状况",
                              reportedMonitoringType: "监测类型",
                              monitoringSystemBuilt: "监测建设标识",
                            } as Record<string, string>
                          )[issue.field] || issue.field}
                          ：{issue.message}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <ArchiveFacts bridge={b} />
              )}
            </Panel>
          </Drawer>
        </>
      )}
    </main>
  );
}
