import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { post } from "../../api/client";
import { useAccessConfig } from "../../app/access";
import { Drawer } from "antd";
import { BridgeAgent } from "../agent/BridgeAgent";

/** 大屏通用面板：内容滚动在面板内部发生，标题始终可见。 */
export function Panel({
  title,
  note,
  children,
  className = "",
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-title">
        <h2>{title}</h2>
        <span>{note}</span>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Empty({ children = "暂无数据" }: { children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-symbol">◇</span>
      <span>{children}</span>
    </div>
  );
}

export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      {error.message}
      {retry && <button onClick={retry}>重新加载</button>}
    </div>
  );
}

export function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Panel title={title} note={<span className="tag muted">待接入</span>}>
      <Empty>{description}</Empty>
    </Panel>
  );
}

/** 单桥打开 Dify 问答抽屉；快捷资料入口使用已有业务页面。 */
export function AgentPlaceholder({
  bridgeId,
  onArchive,
  onList,
  onFilters,
  pageFilters,
}: {
  bridgeId?: string;
  onArchive?: () => void;
  onList?: () => void;
  onFilters?: () => void;
  pageFilters?: Record<string, string>;
}) {
  const [agentOpen, setAgentOpen] = useState(false);
  return (
    <>
      <div className="agent-placeholder">
        <strong>智能体</strong>
        <input
          aria-label="智能体问答"
          placeholder={
            bridgeId
              ? "点击打开单桥档案问答与病害维修总结"
              : "点击打开总体问答，查询当前范围的桥梁资料"
          }
          readOnly
          onClick={() => setAgentOpen(true)}
        />
        <div className="agent-shortcuts">
          {bridgeId ? (
            <>
              <button onClick={onArchive}>基础档案</button>
              {[
                ["patrols", "巡检记录"],
                ["defects", "主要病害"],
                ["maintenance", "维修养护"],
              ].map(([kind, label]) => (
                <Link
                  key={kind}
                  to={`/bridges/${encodeURIComponent(bridgeId)}/records?kind=${kind}`}
                >
                  {label}
                </Link>
              ))}
            </>
          ) : (
            <>
              <button onClick={onList}>桥梁底数</button>
              <button onClick={onFilters}>分类统计</button>
              <Link to="/data-quality">数据质量</Link>
            </>
          )}
        </div>
        <button onClick={() => setAgentOpen(true)}>
          {bridgeId ? "打开单桥问答" : "打开总体问答"}
        </button>
      </div>
      <Drawer
        title="桥梁智能体"
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        size={720}
        destroyOnHidden
      >
        {agentOpen && (
          <BridgeAgent
            key={(bridgeId || "network") + JSON.stringify(pageFilters)}
            bridgeId={bridgeId}
            pageFilters={pageFilters}
          />
        )}
      </Drawer>
    </>
  );
}

/** 时钟仅为当前时间，不用作源数据新鲜度。 */
export function Topbar({
  title = "全省城市桥梁健康度智能体",
  subtitle = "江苏城市检监测融合",
  back = false,
  description,
  metrics,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  description?: ReactNode;
  metrics?: ReactNode;
}) {
  const [clock, setClock] = useState(new Date());
  const access = useAccessConfig();
  const location = useLocation();
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const returnTo =
    (location.state as { from?: string } | null)?.from ||
    sessionStorage.getItem("screen-url") ||
    "/screen";
  return (
    <header className={`topbar ${back ? "topbar-detail" : ""}`}>
      {back ? (
        <Link className="back-link" to={returnTo}>
          ← 返回路网
        </Link>
      ) : (
        <span className="brand-mark" aria-hidden="true" />
      )}
      <div className="screen-title">
        <h1>{title}</h1>
        {description ? (
          <div className="bridge-heading-info">{description}</div>
        ) : (
          <span>{subtitle}</span>
        )}
      </div>
      {metrics && <div className="header-kpis">{metrics}</div>}
      <div className="top-actions">
        <div className="header-tools">
          {location.pathname !== "/data-quality" && (
            <Link to="/data-quality">数据质量</Link>
          )}
          <button
            onClick={() =>
              document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen().catch(() => {})
            }
          >
            全屏
          </button>
          {!access.data?.previewEnabled && (
            <button
              onClick={async () => {
                try {
                  await post("auth/logout");
                  window.dispatchEvent(new Event("session-expired"));
                } catch {
                  alert("退出失败，请重试");
                }
              }}
            >
              退出
            </button>
          )}
        </div>
        <time
          dateTime={clock.toISOString()}
          title={clock.toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false,
          })}
        >
          {clock.toLocaleTimeString("zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false,
          })}
        </time>
      </div>
    </header>
  );
}
