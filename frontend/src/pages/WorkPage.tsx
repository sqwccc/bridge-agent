import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Bridge } from "../api/types";
import { workLabels, type WorkKind } from "../api/work";
import { WorkRecords } from "../features/work/WorkRecords";
import { Topbar, Empty, ErrorState } from "../features/shared/ui";

export function WorkPage() {
  const id = useParams().bridgeId!;
  const [params, setParams] = useSearchParams();
  const candidate = params.get("kind") || "";
  const kind = (
    Object.hasOwn(workLabels, candidate) ? candidate : "patrols"
  ) as WorkKind;
  const bridge = useQuery({
    queryKey: ["bridge", id],
    queryFn: () => api<Bridge>(`bridges/${encodeURIComponent(id)}`),
  });
  return (
    <main className="dashboard-page records-page">
      <Topbar
        title={`${bridge.data?.name || "单桥"} · 巡检与养护`}
        subtitle="INSPECTION, DEFECT & MAINTENANCE"
        back
      />
      <div className="work-page-content">
        <div className="records-nav">
          <Link to={`/bridges/${encodeURIComponent(id)}`}>← 桥梁档案</Link>
          <div className="tabs">
            {Object.entries(workLabels).map(([value, label]) => (
              <button
                key={value}
                className={kind === value ? "active" : ""}
                onClick={() => setParams({ kind: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <Link to="/data-quality">数据质量核查 →</Link>
        </div>
        {bridge.error ? (
          <ErrorState
            error={bridge.error}
            retry={() => void bridge.refetch()}
          />
        ) : !bridge.data ? (
          <Empty>正在读取桥梁…</Empty>
        ) : (
          <WorkRecords
            key={`${id}-${params.toString()}`}
            bridgeId={id}
            kind={kind}
          />
        )}
      </div>
      <footer className="screen-footer">
        <span>可追溯业务档案</span>
        <span>最新版本、同市同桥关联 · 来源只读</span>
      </footer>
    </main>
  );
}
