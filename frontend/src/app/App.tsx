import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { ScreenPage } from "../pages/ScreenPage";
import { BridgePage } from "../pages/BridgePage";
import { WorkPage } from "../pages/WorkPage";
import { QualityPage } from "../pages/QualityPage";
import { AnalysisPage } from "../pages/AnalysisPage";

export function App() {
  useEffect(() => {
    const resize = () =>
      document.documentElement.style.setProperty(
        "--screen-scale",
        String(
          Math.max(
            1,
            CSS.supports("zoom", "1")
              ? Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
              : 1,
          ),
        ),
      );
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/screen" replace />} />
      <Route path="/screen" element={<ScreenPage />} />
      <Route path="/bridges/:bridgeId" element={<BridgePage />} />
      <Route path="/bridges/10905200071/analysis" element={<AnalysisPage />} />
      <Route path="/bridges/:bridgeId/records" element={<WorkPage />} />
      <Route path="/data-quality" element={<QualityPage />} />
      <Route path="*" element={<Navigate to="/screen" replace />} />
    </Routes>
  );
}
