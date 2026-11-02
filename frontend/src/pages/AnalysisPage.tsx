import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import "../styles/analysis.css";

export function AnalysisPage() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("loading");
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    const loadingDelay = window.setTimeout(() => setShowLoading(true), 500);
    const timer = window.setTimeout(() => setStatus("error"), 15000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "wanfu-analysis-ready") {
        clearTimeout(timer);
        setStatus("ready");
      } else if (event.data?.type === "wanfu-analysis-error") {
        clearTimeout(timer);
        setStatus("error");
      }
    };
    window.addEventListener("message", receive);
    return () => {
      clearTimeout(timer);
      clearTimeout(loadingDelay);
      window.removeEventListener("message", receive);
    };
  }, [attempt]);
  return (
    <main className="analysis-page">
      <header className="analysis-header">
        <Link to="/bridges/10905200071">← 返回万福大桥</Link>
        <h1>万福大桥 · 数据分析</h1>
        <button
          onClick={() => {
            setStatus("loading");
            setShowLoading(false);
            setAttempt(attempt + 1);
          }}
        >
          重新加载
        </button>
      </header>
      {status === "loading" && showLoading && (
        <p role="status">正在初始化图表…</p>
      )}
      {status === "error" && (
        <p role="alert">分析模块加载失败，请点击“重新加载”重试。</p>
      )}
      <iframe
        key={attempt}
        ref={frame}
        title="万福大桥分析模块"
        src="/wanfu-analysis-v3.2/index.html"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        onError={() => setStatus("error")}
      />
    </main>
  );
}
