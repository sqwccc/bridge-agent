import { useEffect, useState } from "react";
import { Drawer, Input, Pagination, Select } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { api } from "../api/client";
import type { Page } from "../api/client";
import type {
  Bridge,
  BridgeDictionaries,
  Dashboard,
  Group,
} from "../api/types";
import { num, time } from "../api/types";
import {
  AgentPlaceholder,
  Empty,
  ErrorState,
  Panel,
  Placeholder,
  Topbar,
} from "../features/shared/ui";
import { JiangsuMap } from "../features/dashboard/JiangsuMap";
import { HealthOverview } from "../features/dashboard/HealthOverview";
import { GradeDistribution } from "../features/dashboard/GradeDistribution";
import { AlarmPanel } from "../features/alarm/AlarmPanel";

/** URL 保存全省筛选状态，查询键跟随筛选，地图/统计/列表共享同一条件。 */
export function ScreenPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [filterOpen, setFilterOpen] = useState(false);
  const showList = (open: boolean) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (open) next.set("list", "1");
      else next.delete("list");
      return next;
    });
  const location = useLocation();
  const filters = Object.fromEntries(
    [
      "q",
      "city",
      "type",
      "monitoringType",
      "conditionGrade",
      "structureGrade",
      "bridgeStatus",
      "transferred",
      "demolished",
      "demolitionStatus",
      "spanType",
      "maintenanceCategory",
      "specialTypes",
      "population",
      "assessmentCategory",
    ].map((k) => {
      const value = params.get(k) || "";
      return [
        k,
        (k === "conditionGrade" || k === "structureGrade") &&
        ["missing", "conflict", "invalid", "unclassified"].includes(value)
          ? "other"
          : value,
      ];
    }),
  );
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(filters.q);
  const [dist, setDist] = useState<"cities" | "types" | "monitoringTypes">(
    "cities",
  );
  const [gradeView, setGradeView] = useState<
    "conditionGrades" | "structureGrades"
  >("conditionGrades");
  const [assetView, setAssetView] = useState<
    "bridgeStatuses" | "maintenanceCategories" | "spanTypes" | "specialTypes"
  >("bridgeStatuses");
  const summary = useQuery({
    queryKey: ["dashboard", filters],
    queryFn: () => api<Dashboard>("dashboard", filters),
  });
  const mapFilters = { ...filters, q: "" };
  const mapSummary = useQuery({
    queryKey: ["dashboard", mapFilters],
    queryFn: () => api<Dashboard>("dashboard", mapFilters),
  });
  const options = useQuery({
    queryKey: ["city-options"],
    queryFn: () => api<Group[]>("dashboard/options"),
    staleTime: 300000,
  });
  const dictionaries = useQuery({
    queryKey: ["bridge-dictionaries"],
    queryFn: () => api<BridgeDictionaries>("dictionaries/bridges"),
    staleTime: Infinity,
  });
  const bridges = useQuery({
    queryKey: ["bridges", filters, page],
    queryFn: () => api<Page<Bridge>>("bridges", { ...filters, page, size: 8 }),
    enabled: params.get("list") === "1",
  });
  useEffect(() => {
    sessionStorage.setItem("screen-url", location.pathname + location.search);
  }, [location]);
  useEffect(() => {
    setSearch(filters.q);
  }, [filters.q]);
  const filter = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  const openBridge = (id: string) =>
    navigate(`/bridges/${encodeURIComponent(id)}`, {
      state: { from: location.pathname + location.search },
    });
  const groups = summary.data?.[dist] || [];
  const gradeCategories =
    summary.data?.[
      gradeView === "conditionGrades"
        ? "conditionGradeCategories"
        : "structureGradeCategories"
    ] || [];
  const assetGroups = summary.data?.[assetView] || [];
  const assetKey = {
    bridgeStatuses: "bridgeStatus",
    maintenanceCategories: "maintenanceCategory",
    spanTypes: "spanType",
    specialTypes: "specialTypes",
  }[assetView];
  const gradeKey =
    gradeView === "conditionGrades" ? "conditionGrade" : "structureGrade";
  const selectGrade = (category: string, grade: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      const selected =
        filters.assessmentCategory === category && filters[gradeKey] === grade;
      if (selected) {
        next.delete("assessmentCategory");
        next.delete(gradeKey);
      } else {
        next.set("assessmentCategory", category);
        next.set(gradeKey, grade);
      }
      next.delete("page");
      return next;
    });
  const dictionaryOptions = (key: string) =>
    (dictionaries.data?.[key] || []).map((o) => ({
      value: o.code,
      label: o.label,
    }));
  const selectDist = (g: Group) => {
    const key = {
      cities: "city",
      types: "type",
      monitoringTypes: "monitoringType",
    }[dist];
    filter(key, filters[key] === g.code ? "" : g.code);
  };
  return (
    <main className="dashboard-page prototype-network-page">
      <Topbar
        metrics={
          <>
            <div className="kpi">
              <span>桥梁总数</span>
              <strong>{num(summary.data?.total)}</strong>
              <small>座</small>
            </div>
            <div className="kpi">
              <span>可定位桥梁</span>
              <strong>{num(summary.data?.located)}</strong>
              <small>座</small>
            </div>
            <div className="kpi">
              <span
                title={`按设备默认轻量化 ${num(summary.data?.monitoringDefaulted)} 座；有效关联设备 ${num(summary.data?.withMonitoringDevices)} 座`}
              >
                有效监测分类
              </span>
              <strong>{num(summary.data?.monitored)}</strong>
              <small>座</small>
            </div>
          </>
        }
      />
      {summary.error && (
        <ErrorState
          error={summary.error}
          retry={() => void summary.refetch()}
        />
      )}
      <div className="network-grid">
        <aside className="left-column">
          <Panel
            title="桥梁分布统计"
            note="仅含有效关联监测设备的桥梁"
            className="distribution-panel"
          >
            <div className="tabs">
              {(
                [
                  ["cities", "按地市"],
                  ["monitoringTypes", "按监测类型"],
                  ["types", "按桥型"],
                ] as const
              ).map(([key, name]) => (
                <button
                  key={key}
                  className={dist === key ? "active" : ""}
                  onClick={() => setDist(key)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="distribution-bars">
              {groups.map((g, i) => (
                <button
                  className="distribution-row"
                  key={g.code}
                  onClick={() => selectDist(g)}
                >
                  <span className="bar-rank">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="bar-content">
                    <span>{g.label}</span>
                    <span className="bar-track">
                      <i
                        style={{
                          width: `${(g.count / (groups[0]?.count || 1)) * 100}%`,
                        }}
                      />
                    </span>
                  </span>
                  <strong>{num(g.count)}</strong>
                </button>
              ))}
              {!groups.length && (
                <Empty>
                  {summary.isPending ? "正在读取底数…" : "当前筛选无桥梁"}
                </Empty>
              )}
            </div>
            <div className="panel-foot">
              按设备默认轻量化 {num(summary.data?.monitoringDefaulted)} 座 ·
              有效关联设备 {num(summary.data?.withMonitoringDevices)} 座
            </div>
          </Panel>
          <Panel
            title="整体技术状况分布"
            note="点击等级筛选"
            className="technical-panel"
          >
            <div className="tabs">
              <button
                className={gradeView === "conditionGrades" ? "active" : ""}
                onClick={() => setGradeView("conditionGrades")}
              >
                完好状况 BCI
              </button>
              <button
                className={gradeView === "structureGrades" ? "active" : ""}
                onClick={() => setGradeView("structureGrades")}
              >
                结构状况 BSI
              </button>
            </div>
            <GradeDistribution
              categories={gradeCategories}
              name={gradeView === "conditionGrades" ? "完好状况" : "结构状况"}
              selectedCategory={filters.assessmentCategory}
              selectedGrade={filters[gradeKey]}
              pending={summary.isPending}
              onSelect={selectGrade}
            />
            <p className="muted-caption assessment-caption">
              按养护类别分别统计；未提供、类别冲突及异常编码合并为其他。
            </p>
          </Panel>
        </aside>
        <section className="map-column">
          <div className="query-bar">
            <Input.Search
              aria-label="桥梁搜索"
              placeholder="查询：按桥名、编号检索…"
              allowClear
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (!e.target.value) filter("q", "");
              }}
              onSearch={(value) => {
                setParams((prev) => {
                  const next = new URLSearchParams(prev);
                  if (value) next.set("q", value);
                  else next.delete("q");
                  next.delete("page");
                  next.delete("list");
                  return next;
                });
              }}
            />
            <button onClick={() => setFilterOpen(true)}>筛选与分类</button>
            <button onClick={() => showList(true)}>查看桥梁清单</button>
            <button onClick={() => setParams({})}>重置</button>
          </div>
          {dictionaries.error && (
            <ErrorState
              error={dictionaries.error}
              retry={() => void dictionaries.refetch()}
            />
          )}
          <Panel
            title="江苏城市桥梁分布"
            note={
              filters.q
                ? `匹配 ${num(summary.data?.total)} 座 · ${num(summary.data?.located)} 座可定位并高亮`
                : `${num(mapSummary.data?.located)} 座可定位桥梁 · 一桥一标点`
            }
            className="map-panel"
          >
            <div className="map-frame">
              {mapSummary.error && (
                <ErrorState
                  error={mapSummary.error}
                  retry={() => void mapSummary.refetch()}
                />
              )}
              <JiangsuMap
                gradeBasis={gradeView}
                points={mapSummary.data?.points || []}
                searchQuery={filters.q}
                highlightedIds={
                  filters.q ? summary.data?.points.map((p) => p.id) || [] : []
                }
                cities={options.data || []}
                selectedCity={filters.city}
                onCity={(v) => filter("city", v)}
                onBridge={openBridge}
              />
              {(summary.isPending || mapSummary.isPending) && (
                <div className="map-loading">正在加载地图点位…</div>
              )}
            </div>
          </Panel>
        </section>
        <aside className="right-column">
          <HealthOverview
            categories={gradeCategories}
            basis={gradeView === "conditionGrades" ? "BCI" : "BSI"}
            selectedCategory={filters.assessmentCategory}
            selectedGrade={filters[gradeKey]}
            pending={summary.isPending}
            error={summary.error}
            onRetry={() => void summary.refetch()}
            onBasisChange={(basis) =>
              setGradeView(
                basis === "BCI" ? "conditionGrades" : "structureGrades",
              )
            }
            onSelect={selectGrade}
          />

          <Placeholder
            title="重点关注桥梁信息"
            description="健康评估与风险排序待接入。"
          />
          <AlarmPanel
            key={JSON.stringify(filters)}
            filters={filters}
            onBridge={openBridge}
          />
        </aside>
      </div>
      <AgentPlaceholder
        pageFilters={filters}
        onList={() => showList(true)}
        onFilters={() => setFilterOpen(true)}
      />
      <Drawer
        title="桥梁检索结果"
        open={params.get("list") === "1"}
        onClose={() => showList(false)}
        size={1120}
        className="bridge-list-drawer"
        destroyOnHidden
      >
        {" "}
        <Panel
          title="桥梁底数"
          note={`${num(bridges.data?.total)} 座 · 点击查看详情`}
          className="bridge-list-panel"
        >
          {bridges.error ? (
            <ErrorState
              error={bridges.error}
              retry={() => void bridges.refetch()}
            />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data-table bridge-table">
                  <thead>
                    <tr>
                      <th>桥梁名称</th>
                      <th>地市 / 桥梁编号</th>
                      <th>桥型</th>
                      <th>全长 m</th>
                      <th>完好 / 结构</th>
                      <th>监测类型</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bridges.data?.items.map((b) => (
                      <tr
                        key={b.id}
                        className="clickable"
                        onClick={() => openBridge(b.id)}
                      >
                        <td>
                          <button
                            className="text-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              openBridge(b.id);
                            }}
                          >
                            {b.name}
                          </button>
                          <small>
                            {b.spanTypeName}
                            {b.specialTypeNames.length
                              ? ` · ${b.specialTypeNames.join("、")}`
                              : ""}
                          </small>
                        </td>
                        <td>
                          {b.city}
                          <small>{b.code}</small>
                        </td>
                        <td>{b.typeName}</td>
                        <td>{num(b.length)}</td>
                        <td className="grade-cell">
                          <span
                            title={`来源编码：${b.conditionGrade ?? "未提供"}`}
                          >
                            {b.conditionGradeName}
                          </span>
                          <small
                            title={`来源编码：${b.structureGrade ?? "未提供"}`}
                          >
                            {b.structureGradeName}
                          </small>
                        </td>
                        <td>
                          {b.effectiveMonitoringTypeName}
                          <small>
                            {b.monitoringTypeBasis === "DEVICE_DEFAULT"
                              ? "按设备默认"
                              : b.monitoringTypeBasis === "REPORTED"
                                ? "来源上报"
                                : "待核查"}
                          </small>
                        </td>
                        <td>↗</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!bridges.data?.items.length && (
                  <Empty>
                    {bridges.isPending ? "加载桥梁…" : "没有匹配的桥梁"}
                  </Empty>
                )}
              </div>
              <Pagination
                size="small"
                current={page}
                pageSize={8}
                total={bridges.data?.total || 0}
                onChange={(p) =>
                  setParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("page", String(p));
                    return next;
                  })
                }
                showSizeChanger={false}
              />
            </>
          )}
        </Panel>
      </Drawer>
      <Drawer
        title="筛选与分类统计"
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        size={780}
        className="filters-drawer"
        destroyOnHidden
      >
        <p className="muted-caption">
          底数同步：{time(summary.data?.sourceUpdatedAt)}
        </p>
        <div className="filter-bar">
          <Select
            aria-label="地市筛选"
            value={filters.city}
            onChange={(v) => filter("city", v)}
            options={[
              { value: "", label: "全省地市" },
              ...(options.data || []).map((c) => ({
                value: c.code,
                label: c.label,
              })),
            ]}
          />
          <Select
            aria-label="桥型筛选"
            value={filters.type}
            onChange={(v) => filter("type", v)}
            options={[
              { value: "", label: "全部桥型" },
              ...dictionaryOptions("types"),
            ]}
          />
          <Select
            aria-label="监测类型筛选"
            value={filters.monitoringType}
            onChange={(v) => filter("monitoringType", v)}
            options={[
              { value: "", label: "全部监测类型" },
              ...dictionaryOptions("monitoringTypes"),
            ]}
          />
          <button onClick={() => setParams({})}>重置</button>
          <details className="more-filters">
            <summary>
              评价与生命周期筛选 / 档案分类
              {[
                "conditionGrade",
                "structureGrade",
                "bridgeStatus",
                "transferred",
                "demolished",
                "demolitionStatus",
                "spanType",
                "maintenanceCategory",
                "specialTypes",
                "population",
              ].some((k) => filters[k])
                ? " · 已应用"
                : ""}
            </summary>
            <div>
              <label>
                桥梁范围
                <Select
                  aria-label="桥梁范围筛选"
                  value={filters.population || "all"}
                  onChange={(v) => filter("population", v === "all" ? "" : v)}
                  options={[
                    { value: "all", label: "全部有效桥梁" },
                    { value: "normalUse", label: "正常使用且未拆除" },
                  ]}
                />
              </label>
              <label>
                三特类型（多选，任一匹配）
                <Select
                  aria-label="三特类型筛选"
                  mode="multiple"
                  allowClear
                  value={
                    filters.specialTypes ? filters.specialTypes.split(",") : []
                  }
                  onChange={(v) => filter("specialTypes", v.join(","))}
                  options={[
                    ...dictionaryOptions("specialTypes"),
                    ...(summary.data?.specialTypes || [])
                      .filter(
                        (g) =>
                          !(dictionaries.data?.specialTypes || []).some(
                            (o) => o.code === g.code,
                          ),
                      )
                      .map((g) => ({ value: g.code, label: g.label })),
                  ]}
                  placeholder="全部三特类型"
                />
              </label>
              <label>
                评价养护分组
                <Select
                  aria-label="评价养护分组筛选"
                  value={filters.assessmentCategory}
                  onChange={(v) => filter("assessmentCategory", v)}
                  options={[
                    { value: "", label: "全部评价养护分组" },
                    { value: "I", label: "Ⅰ类养护" },
                    { value: "II_V", label: "Ⅱ～Ⅴ类养护" },
                    { value: "unknown", label: "养护类别未明确" },
                  ]}
                />
              </label>
              {(
                [
                  ["conditionGrade", "完好状况筛选", "全部完好状况", "grades"],
                  ["structureGrade", "结构状况筛选", "全部结构状况", "grades"],
                  [
                    "bridgeStatus",
                    "使用状态筛选",
                    "全部使用状态",
                    "bridgeStatuses",
                  ],
                  [
                    "transferred",
                    "移交状态筛选",
                    "全部移交状态",
                    "transferred",
                  ],
                  ["demolished", "拆除状态筛选", "全部拆除状态", "demolished"],
                  [
                    "demolitionStatus",
                    "拆除处理状态筛选",
                    "全部拆除处理状态",
                    "demolitionStatuses",
                  ],
                  ["spanType", "跨径分类筛选", "全部跨径分类", "spanTypes"],
                  [
                    "maintenanceCategory",
                    "养护类别筛选",
                    "全部养护类别",
                    "maintenanceCategories",
                  ],
                ] as const
              ).map(([key, label, all, dict]) => {
                const grades =
                  key === "conditionGrade" || key === "structureGrade";
                return (
                  <label key={key}>
                    {label.replace("筛选", "")}
                    <Select
                      aria-label={label}
                      value={filters[key]}
                      onChange={(v) => filter(key, v)}
                      options={[
                        { value: "", label: all },
                        ...dictionaryOptions(dict),
                        ...(grades ? [{ value: "other", label: "其他" }] : []),
                        ...([
                          "bridgeStatus",
                          "spanType",
                          "maintenanceCategory",
                        ].includes(key)
                          ? [{ value: "missing", label: "未提供" }]
                          : []),
                      ]}
                    />
                  </label>
                );
              })}
            </div>
          </details>
        </div>
        <Panel
          title="桥梁分类统计"
          note="点击条目筛选"
          className="asset-stats-panel"
        >
          <div className="asset-kpis">
            <span title="使用状态为正常使用且明确未拆除；当前筛选范围内计数">
              正常使用 <strong>{num(summary.data?.normalUse)}</strong>
            </span>
            <span title="至少登记一个有效三特类型；不是缺失的三特标志总量">
              三特类型已登记{" "}
              <strong>{num(summary.data?.specialTypesRegistered)}</strong>
            </span>
            <span>
              独柱墩桥梁 <strong>{num(summary.data?.singleColumnPiers)}</strong>
            </span>
          </div>
          <Select
            aria-label="分类统计维度"
            value={assetView}
            onChange={setAssetView}
            options={[
              { value: "bridgeStatuses", label: "使用状态" },
              { value: "maintenanceCategories", label: "养护类别" },
              { value: "spanTypes", label: "跨径分类" },
              { value: "specialTypes", label: "三特类型（可重叠）" },
            ]}
          />
          <div className="asset-groups">
            {assetGroups.map((g) => (
              <button
                key={g.code}
                className="asset-group"
                onClick={() =>
                  filter(assetKey, filters[assetKey] === g.code ? "" : g.code)
                }
              >
                <span title={g.label}>
                  {(
                    {
                      "1": "合格",
                      "2": "不合格",
                      "3": "A级",
                      "4": "B级",
                      "5": "C级",
                      "6": "D级",
                      "7": "E级",
                      missing: "未提供",
                    } as Record<string, string>
                  )[g.code] || `编码 ${g.code}`}
                </span>
                <strong>{num(g.count)}</strong>
              </button>
            ))}
          </div>
          {assetView === "specialTypes" && (
            <p className="muted-caption">
              按来源类型登记计数，多选可能重叠。三特标志已提供{" "}
              {num(summary.data?.specialFlagProvided)} 座。
            </p>
          )}
        </Panel>
      </Drawer>
    </main>
  );
}
