import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Page } from "../../api/client";
import type { Alarm } from "../../api/types";
import { time } from "../../api/types";
import { Empty, ErrorState, Panel } from "../shared/ui";

/** 最新来源报警自动滚动；保留真实发生时间，悬停或键盘聚焦时暂停。 */
export function AlarmPanel({
  bridgeId,
  filters = {},
  onBridge,
}: {
  bridgeId?: string;
  filters?: Record<string, string>;
  onBridge?: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const query = useQuery({
    queryKey: ["alarms", "latest", bridgeId, filters],
    queryFn: () =>
      api<Page<Alarm>>("alarms", {
        ...filters,
        bridgeId,
        size: 50,
      }),
    refetchInterval: 60000,
  });
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let holdUntil = Date.now() + 2000;
    const timer = window.setInterval(() => {
      if (paused.current || document.hidden || Date.now() < holdUntil) return;
      const bottom = element.scrollHeight - element.clientHeight;
      if (bottom <= 0) return;
      if (element.scrollTop >= bottom - 1) {
        element.scrollTop = 0;
        holdUntil = Date.now() + 2000;
      } else {
        element.scrollTop += 1;
        if (element.scrollTop >= bottom - 1) holdUntil = Date.now() + 2000;
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [query.data]);
  return (
    <Panel
      title={bridgeId ? "报警事件列表" : "区域报警列表"}
      note={`最近 ${query.data?.items.length ?? "—"} 条 · 共 ${query.data?.total ?? "—"} 条`}
      className="alarm-panel"
    >
      {query.isPending ? (
        <Empty>正在读取报警…</Empty>
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.items.length ? (
        <Empty>当前范围暂无报警记录。</Empty>
      ) : (
        <div
          className="table-scroll alarm-scroll"
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="最新报警，悬停或聚焦暂停滚动"
          onMouseEnter={() => {
            paused.current = true;
          }}
          onMouseLeave={(event) => {
            paused.current = event.currentTarget.contains(
              document.activeElement,
            );
          }}
          onFocus={() => {
            paused.current = true;
          }}
          onBlur={(event) => {
            paused.current = event.currentTarget.matches(":hover");
          }}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>时间 / 桥梁</th>
                <th>指标 / 阈值</th>
                <th>等级 / 处置</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((a) => (
                <tr
                  key={`${a.cityCode}-${a.id}`}
                  onClick={() => onBridge?.(a.bridgeId)}
                  className={onBridge ? "clickable" : ""}
                >
                  <td>
                    <small>{time(a.time)}</small>
                    <strong>{a.bridgeName}</strong>
                  </td>
                  <td>
                    <span>{a.metric || "未提供指标"}</span>
                    <small>
                      {a.value ?? "—"} / {a.threshold || "未提供阈值"}
                    </small>
                  </td>
                  <td>
                    <span className={`alarm-level level-${a.level}`}>
                      {a.level}级
                    </span>
                    <small>
                      {a.handlingStatus
                        ? `处置编码 ${a.handlingStatus}`
                        : "处置未知"}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
