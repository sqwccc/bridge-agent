import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Input, Modal, Pagination, Select } from "antd";
import { api, type Page } from "../../api/client";
import { num, time } from "../../api/types";
import {
  workLabels,
  type WorkKind,
  type WorkRecord,
  type WorkDetail,
  type WorkDictionaries,
} from "../../api/work";
import { Empty, ErrorState, Panel } from "../shared/ui";
import { RecordAttachments } from "./RecordAttachments";

export function RecordFacts({ record: r }: { record: WorkRecord }) {
  const fields: [string, string | number | null][] = [
    ["来源记录标识", r.id],
    ["来源桥梁关联值", r.sourceBridgeKey],
    ["地市编码", r.cityCode],
    ["业务日期", time(r.occurredAt)],
    ["来源同步时间", time(r.sourceUpdatedAt)],
    ["同步状态", r.syncStatus],
    ...(r.kind === "patrols"
      ? ([
          ["日常巡查标识", r.taskId],
          ["检查单元", r.unit],
          ["检查项目", r.itemText],
          ["检查方法", r.method],
          ["检查内容", r.content],
          ["检查结果", r.result],
          ["存在隐患（原文）", r.hazard],
        ] as [string, string | null][])
      : r.kind === "defects"
        ? ([
            ["病害编号", r.code],
            ["桥梁部位", `${r.zoneName}（${r.zone ?? "未提供"}）`],
            ["巡检项", `${r.itemName}（${r.item ?? "未提供"}）`],
            ["损坏类型", `${r.damageTypeName}（${r.damageType ?? "未提供"}）`],
            ["损坏程度", `${r.severityName}（${r.severity ?? "未提供"}）`],
            ["病害来源", `${r.originName}（${r.origin ?? "未提供"}）`],
            ["处理状态", `${r.statusName}（${r.status ?? "未提供"}）`],
            ["病害描述", r.description],
            ["定量描述", r.quantity],
            ["位置描述", r.location],
          ] as [string, string | null][])
        : ([
            ["关联病害编号", r.code],
            ["养护单位", r.unit],
            [
              "养护类型",
              `${r.maintenanceTypeName}（${r.maintenanceType ?? "未提供"}）`,
            ],
            ["整改状态", `${r.statusName}（${r.status ?? "未提供"}）`],
            ["整改日期", r.rectifiedDate],
          ] as [string, string | null][])),
    ["备注", r.note],
  ];
  return (
    <>
      <dl className="record-facts">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value == null || value === "" ? "未提供" : value}</dd>
          </div>
        ))}
      </dl>
      {!!r.dataIssues.length && (
        <div className="source-issues">
          <strong>来源数据待核查</strong>
          {r.dataIssues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}
    </>
  );
}

function RecordDetail({
  bridgeId,
  selection,
  onSelect,
  onClose,
}: {
  bridgeId: string;
  selection: { kind: WorkKind; id: string } | null;
  onSelect: (selection: { kind: WorkKind; id: string }) => void;
  onClose: () => void;
}) {
  const path = selection
    ? `bridges/${encodeURIComponent(bridgeId)}/records/${selection.kind}/${encodeURIComponent(selection.id)}`
    : "";
  const detail = useQuery({
    queryKey: ["work-detail", bridgeId, selection],
    queryFn: () => api<WorkDetail>(path),
    enabled: !!selection,
  });
  const d = detail.data;
  return (
    <Modal
      open={!!selection}
      title={selection ? `${workLabels[selection.kind]}详情` : "记录详情"}
      onCancel={onClose}
      footer={null}
      width={1060}
      destroyOnHidden
    >
      <div className="work-detail">
        {detail.error ? (
          <ErrorState
            error={detail.error}
            retry={() => void detail.refetch()}
          />
        ) : !d ? (
          <Empty>正在读取记录…</Empty>
        ) : (
          <>
            <RecordFacts record={d.record} />
            <h3>来源附件</h3>
            <RecordAttachments
              key={path}
              attachments={d.attachments}
              basePath={path}
            />
            <h3>业务追溯</h3>
            <p
              className={
                d.relationStatus === "AMBIGUOUS"
                  ? "relation-warning"
                  : "muted-caption"
              }
            >
              {d.relationReason}
            </p>
            {!!d.relatedRecords.total && (
              <>
                <p>
                  关联候选 {num(d.relatedRecords.total)} 条，当前显示前{" "}
                  {d.relatedRecords.items.length} 条。
                </p>
                <div className="related-records">
                  {d.relatedRecords.items.map((r) => (
                    <button
                      key={r.id}
                      onClick={() =>
                        onSelect({
                          kind: r.kind,
                          id: r.id,
                        })
                      }
                    >
                      {workLabels[r.kind]} · {time(r.occurredAt).slice(0, 10)} ·{" "}
                      {r.code} · {r.statusName}
                      <span>查看详情 →</span>
                    </button>
                  ))}
                </div>
                <Link
                  onClick={onClose}
                  to={`/bridges/${encodeURIComponent(bridgeId)}/records?kind=${d.record.kind === "defects" ? "maintenance" : "defects"}&defectCode=${encodeURIComponent(d.record.code || "")}`}
                >
                  查看全部关联候选 →
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function WorkRecords({
  bridgeId,
  kind,
}: {
  bridgeId: string;
  kind: WorkKind;
}) {
  const [params, setParams] = useSearchParams();
  const filterNames = [
    "from",
    "to",
    "status",
    "zone",
    "damageType",
    "severity",
    "maintenanceType",
    "q",
    "defectCode",
    "issuesOnly",
  ];
  const filters = Object.fromEntries(
    filterNames.map((k) => [k, params.get(k) || ""]),
  );
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [draft, setDraft] = useState(filters);
  const [validation, setValidation] = useState("");
  const [selection, setSelection] = useState<{
    kind: WorkKind;
    id: string;
  } | null>(null);
  const dictionaries = useQuery({
    queryKey: ["work-dictionaries"],
    queryFn: () => api<WorkDictionaries>("data-quality/records/dictionaries"),
    staleTime: Infinity,
  });
  const query = useQuery({
    queryKey: ["work-records", bridgeId, kind, filters, page],
    queryFn: () =>
      api<Page<WorkRecord>>(
        `bridges/${encodeURIComponent(bridgeId)}/records/${kind}`,
        {
          ...filters,
          page,
          size: 12,
        },
      ),
  });

  function apply() {
    if (draft.from && draft.to && draft.from > draft.to) {
      setValidation("开始日期不能晚于结束日期");
      return;
    }
    setValidation("");
    setParams({
      kind,
      ...Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== "")),
    });
  }

  function select(label: string, field: string, dict: string) {
    return (
      <label>
        {label}
        <Select
          aria-label={label}
          value={draft[field] || ""}
          onChange={(v) => setDraft({ ...draft, [field]: v })}
          options={[
            {
              value: "",
              label: "全部",
            },
            ...Object.entries(dictionaries.data?.[dict] || {}).map(
              ([value, label]) => ({ value, label }),
            ),
            ...(dict === "damages" ? [{ value: "99", label: "其他" }] : []),
            { value: "missing", label: "未提供" },
          ]}
        />
      </label>
    );
  }

  return (
    <>
      <Panel
        title={workLabels[kind]}
        note={`${num(query.data?.total)} 条 · 最新有效来源记录`}
        className="work-records-panel"
      >
        <form
          className="work-filters"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <label>
            开始日期
            <input
              aria-label="业务开始日期"
              type="date"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label>
            结束日期
            <input
              aria-label="业务结束日期"
              type="date"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          {kind !== "patrols" &&
            select(
              kind === "defects" ? "病害处理状态" : "维修整改状态",
              "status",
              kind === "defects" ? "defectStatuses" : "repairStatuses",
            )}
          {kind === "defects" && (
            <>
              {select("桥梁部位", "zone", "zones")}
              {select("损坏类型", "damageType", "damages")}
              {select("损坏程度", "severity", "severities")}
            </>
          )}
          {kind === "maintenance" &&
            select("养护类型", "maintenanceType", "maintenanceTypes")}
          {kind !== "patrols" && (
            <label>
              病害编号
              <Input
                aria-label="病害编号"
                value={draft.defectCode}
                maxLength={100}
                onChange={(e) =>
                  setDraft({ ...draft, defectCode: e.target.value })
                }
              />
            </label>
          )}
          <label>
            关键词
            <Input
              aria-label="业务记录关键词"
              value={draft.q}
              maxLength={100}
              placeholder="编号、描述、内容或隐患"
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            />
          </label>
          <label className="work-checkbox">
            <input
              type="checkbox"
              checked={draft.issuesOnly === "true"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  issuesOnly: e.target.checked ? "true" : "",
                })
              }
            />
            仅看待核查记录
          </label>
          <button type="submit">查询记录</button>
          <button
            type="button"
            onClick={() => {
              setDraft(Object.fromEntries(filterNames.map((k) => [k, ""])));
              setValidation("");
              setParams({ kind });
            }}
          >
            重置条件
          </button>
        </form>
        <p className="muted-caption">
          未选择日期时查询全部历史；日期均为北京时间。字段缺失不代表正常或已完成。
        </p>
        {validation && (
          <p role="alert" className="file-read-error">
            {validation}
          </p>
        )}
        {dictionaries.error && (
          <ErrorState
            error={dictionaries.error}
            retry={() => void dictionaries.refetch()}
          />
        )}
        {query.isPending ? (
          <Empty>正在读取{workLabels[kind]}…</Empty>
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : !query.data.items.length ? (
          <Empty>当前条件下没有可确认归属的有效记录。</Empty>
        ) : (
          <div className="table-scroll work-table-scroll">
            <table className="data-table work-table">
              <thead>
                <tr>
                  <th>业务日期 / 来源同步</th>
                  <th>
                    {kind === "patrols"
                      ? "检查内容与结果"
                      : "病害编号与业务内容"}
                  </th>
                  <th>来源状态</th>
                  <th>数据核查 / 附件</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{time(r.occurredAt)}</strong>
                      <small>{time(r.sourceUpdatedAt)}</small>
                    </td>
                    <td>
                      {kind === "patrols" ? (
                        <>
                          <strong>
                            {r.itemText || r.content || "检查内容未提供"}
                          </strong>
                          <span>结果：{r.result || "未提供"}</span>
                          <small>隐患原文：{r.hazard || "未提供"}</small>
                        </>
                      ) : (
                        <>
                          <strong>{r.code || "病害编号未提供"}</strong>
                          <span>
                            {kind === "defects"
                              ? r.description || r.damageTypeName
                              : r.maintenanceTypeName}
                          </span>
                          <small>
                            {kind === "defects"
                              ? `${r.zoneName} · ${r.severityName}`
                              : r.unit || "养护单位未提供"}
                          </small>
                        </>
                      )}
                    </td>
                    <td>
                      {kind === "patrols" ? (
                        <span>巡检明细</span>
                      ) : (
                        <strong>{r.statusName}</strong>
                      )}
                      <small>同步：{r.syncStatus || "未提供"}</small>
                    </td>
                    <td>
                      <span
                        className={
                          r.dataIssues.length
                            ? "relation-warning"
                            : "muted-caption"
                        }
                      >
                        {r.dataIssues.length
                          ? `${r.dataIssues.length} 项待核查`
                          : "未发现已定义异常"}
                      </span>
                      <small>
                        {r.attachmentProvided ? "已提供附件信息" : "未提供附件"}
                      </small>
                    </td>
                    <td>
                      <button onClick={() => setSelection({ kind, id: r.id })}>
                        查看详情
                      </button>
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
          total={query.data?.total || 0}
          showSizeChanger={false}
          onChange={(p) =>
            setParams({ ...Object.fromEntries(params), page: String(p) })
          }
        />
      </Panel>
      <RecordDetail
        bridgeId={bridgeId}
        selection={selection}
        onSelect={setSelection}
        onClose={() => setSelection(null)}
      />
    </>
  );
}
