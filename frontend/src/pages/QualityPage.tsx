import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Pagination, Select } from "antd";
import { api, type Page } from "../api/client";
import { num, time, type Group } from "../api/types";
import {
  workLabels,
  type WorkKind,
  type QualityAssessment,
  type QualityIssue,
} from "../api/work";
import { Topbar, Panel, Empty, ErrorState } from "../features/shared/ui";

export function QualityPage() {
  const [params, setParams] = useSearchParams();
  const candidate = params.get("kind") || "";
  const kind = (
    Object.hasOwn(workLabels, candidate) ? candidate : "patrols"
  ) as WorkKind;
  const city = params.get("city") || "",
    issue = params.get("issue") ?? "",
    page = Math.max(1, Number(params.get("page")) || 1);

  function update(values: Record<string, string>) {
    setParams({ kind, city, issue, ...values, page: "1" });
  }

  const cities = useQuery({
    queryKey: ["options"],
    queryFn: () => api<Group[]>("dashboard/options"),
  });
  const summary = useQuery({
    queryKey: ["quality-profile", kind, city],
    queryFn: () =>
      api<QualityAssessment>("data-quality/records", { kind, city }),
    staleTime: 60000,
  });
  const rows = useQuery({
    queryKey: ["quality-issues", kind, city, issue, page],
    queryFn: () =>
      api<Page<QualityIssue>>("data-quality/records/issues", {
        kind,
        city,
        issue,
        page,
        size: 12,
      }),
  });
  const assessment = summary.data,
    p = assessment?.profile;
  const checks: [string, number | undefined, string][] = [
    ["无法关联有效桥梁", p?.unmatchedRows, "UNMATCHED_BRIDGE"],
    ["桥梁归属有歧义", p?.ambiguousRows, "AMBIGUOUS_BRIDGE"],
    ["记录标识或地市缺失", p?.missingIdentifiers, "MISSING_IDENTIFIER"],
    ["桥梁关联字段缺失", p?.missingBridgeKeys, "MISSING_BRIDGE_KEY"],
    ["业务日期缺失", p?.missingDates, "MISSING_DATE"],
    ["业务日期在未来", p?.futureDates, "FUTURE_DATE"],
    ["同步时间缺失", p?.missingSyncTimes, "MISSING_SYNC_TIME"],
    [
      kind === "patrols" ? "检查结果缺失" : "业务必需信息缺失",
      p?.missingDetails,
      "MISSING_DETAILS",
    ],
    ["业务编码未识别", p?.unknownCodes, "UNKNOWN_CODE"],
    ["同步状态未识别", p?.unknownSyncStatus, "UNKNOWN_SYNC_STATUS"],
    [
      "整改日期早于养护日期",
      p?.earlierRectification,
      "RECTIFIED_BEFORE_MAINTENANCE",
    ],
  ];
  return (
    <main className="dashboard-page quality-page">
      <Topbar
        title="桥梁业务数据质量核查"
        subtitle="SOURCE DATA QUALITY"
        back
      />
      <div className="quality-content">
        <div className="records-nav">
          <div className="tabs">
            {Object.entries(workLabels).map(([value, label]) => (
              <button
                key={value}
                className={kind === value ? "active" : ""}
                onClick={() =>
                  update({
                    kind: value,
                    issue: "",
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <label>
            核查地市{" "}
            <Select
              aria-label="核查地市"
              value={city}
              onChange={(city) => update({ city })}
              options={[
                {
                  value: "",
                  label: "全省",
                },
                ...(cities.data || []).map((g) => ({
                  value: g.code,
                  label: g.label,
                })),
              ]}
            />
          </label>
        </div>
        {cities.error && (
          <ErrorState
            error={cities.error}
            retry={() => void cities.refetch()}
          />
        )}
        {summary.error ? (
          <ErrorState
            error={summary.error}
            retry={() => void summary.refetch()}
          />
        ) : !p ? (
          <Empty>正在核查来源数据…</Empty>
        ) : (
          <>
            <div className="quality-basis">
              <strong>核查口径：有设备桥梁的导入原始行</strong>
              <p>{assessment.basis}</p>
              <small>
                核查时间：{time(assessment.checkedAt)} · 汇总缓存{" "}
                {assessment.cacheSeconds / 60} 分钟 · 业务日期范围：
                {time(p.firstDate).slice(0, 10)} 至{" "}
                {time(p.lastDate).slice(0, 10)} · 最近来源同步：
                {time(p.latestSync)}
              </small>
            </div>
            <div className="quality-overview">
              {[
                ["原始行", p.rawRows],
                ["有效标识组合", p.distinctKeys],
                ["重复多出行", p.duplicateExcess],
                ["来源删除行", p.deletedRows],
                ["可唯一关联桥梁的原始行", p.mappedRows],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>{num(value as number)}</strong>
                </div>
              ))}
            </div>
            <div className="quality-checks">
              {checks.map(([label, value, code]) => (
                <button
                  key={code}
                  className={issue === code ? "active" : ""}
                  onClick={() => update({ issue: code })}
                >
                  <span>{label}</span>
                  <strong>{num(value)}</strong>
                </button>
              ))}
            </div>
            <p className="muted-caption">
              问题可以重叠，不能相加作为问题记录总数。重复多出行按“地市＋记录标识”统计，不等于病害编号重复。关联成功也不代表业务内容完整。
            </p>
            {assessment.relations && (
              <div className="quality-relations">
                <strong>业务关联核查 · 当前范围的最新有效记录</strong>
                <p>
                  同市同桥重复病害编号{" "}
                  {num(assessment.relations.duplicateDefectCodes)}{" "}
                  组；维修记录：唯一关联病害{" "}
                  {num(assessment.relations.uniqueMaintenance)} 条，多条病害候选{" "}
                  {num(assessment.relations.ambiguousMaintenance)}{" "}
                  条，未匹配病害{" "}
                  {num(assessment.relations.unmatchedMaintenance)} 条，编号缺失{" "}
                  {num(assessment.relations.missingReferenceKeys)} 条。
                </p>
                <small>
                  只核查同市、同桥和病害编号；多条候选不认定唯一关系，也不重复计为多次维修。
                </small>
              </div>
            )}
          </>
        )}
        <Panel
          title="来源问题记录"
          note={`${num(rows.data?.total)} 条原始行`}
          className="quality-issues-panel"
        >
          <div className="inline-tools">
            <Select
              aria-label="质量问题类型"
              value={issue}
              onChange={(issue) => update({ issue })}
              options={[
                {
                  value: "",
                  label: "全部已定义问题",
                },
                ...Object.entries(assessment?.issueLabels || {}).map(
                  ([value, label]) => ({ value, label }),
                ),
              ]}
            />
            <span className="muted-caption">
              原始行用于追查来源；桥梁详情只展示最新有效记录。
            </span>
          </div>
          {rows.isPending ? (
            <Empty>正在读取问题记录…</Empty>
          ) : rows.error ? (
            <ErrorState error={rows.error} retry={() => void rows.refetch()} />
          ) : !rows.data.items.length ? (
            <Empty>当前范围未发现所选类型问题。</Empty>
          ) : (
            <div className="table-scroll quality-table-scroll">
              <table className="data-table work-table">
                <thead>
                  <tr>
                    <th>来源记录标识 / 地市</th>
                    <th>桥梁关联值</th>
                    <th>业务日期 / 同步时间</th>
                    <th>发现的问题</th>
                    <th>追溯</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.data.items.map((r, i) => (
                    <tr key={`${r.cityCode}-${r.id}-${i}`}>
                      <td>
                        <strong>{r.id || "未提供"}</strong>
                        <small>
                          {r.cityCode || "地市未提供"} · 同步{" "}
                          {r.syncStatus || "未提供"}
                        </small>
                      </td>
                      <td>{r.sourceBridgeKey || "未提供"}</td>
                      <td>
                        <span>{time(r.occurredAt)}</span>
                        <small>{time(r.sourceUpdatedAt)}</small>
                      </td>
                      <td>
                        {r.issues.map((code) => (
                          <small className="relation-warning" key={code}>
                            {assessment?.issueLabels[code] || code}
                          </small>
                        ))}
                      </td>
                      <td>
                        {r.bridgeId ? (
                          <Link
                            to={`/bridges/${encodeURIComponent(r.bridgeId)}/records?kind=${kind}`}
                          >
                            查看桥梁记录 →
                          </Link>
                        ) : (
                          <span className="muted-caption">待核实归属</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            current={page}
            pageSize={12}
            total={rows.data?.total || 0}
            showSizeChanger={false}
            onChange={(page) =>
              setParams({ kind, city, issue, page: String(page) })
            }
          />
        </Panel>
      </div>
      <footer className="screen-footer">
        <span>来源数据核查</span>
        <span>核查结果不修改来源记录 · 数据服务故障单独提示</span>
      </footer>
    </main>
  );
}
