import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { LoginPage } from "../pages/LoginPage";
import { ScreenPage } from "../pages/ScreenPage";
import { BridgePage } from "../pages/BridgePage";
import { WorkPage } from "../pages/WorkPage";
import { QualityPage } from "../pages/QualityPage";
import { ErrorState } from "../features/shared/ui";
import { useAccessConfig } from "./access";

/** 登录门禁只缓存用户身份；退出清空所有受保护数据。 */
function AuthGate() {
  const user = useQuery({
    queryKey: ["me"],
    queryFn: () => api("auth/me"),
    retry: false,
  });
  if (user.isPending)
    return <div className="loading-screen">正在连接系统…</div>;
  if (user.error instanceof ApiError && user.error.status === 401)
    return <Navigate to="/login" replace />;
  if (user.error)
    return <ErrorState error={user.error} retry={() => void user.refetch()} />;
  return <Outlet />;
}

export function App() {
  const access = useAccessConfig();
  const navigate = useNavigate();
  const client = useQueryClient();
  useEffect(() => {
    const resize = () =>
      document.documentElement.style.setProperty(
        "--screen-scale",
        String(
          Math.max(
            1,
            Math.min(window.innerWidth / 1920, window.innerHeight / 1080),
          ),
        ),
      );
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    const expired = () => {
      client.clear();
      navigate("/login", { replace: true });
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, [navigate, client]);
  if (access.isPending)
    return <div className="loading-screen">正在连接系统…</div>;
  if (access.error)
    return (
      <ErrorState error={access.error} retry={() => void access.refetch()} />
    );
  const preview = access.data.previewEnabled;
  return (
    <Routes>
      <Route
        path="/login"
        element={preview ? <Navigate to="/screen" replace /> : <LoginPage />}
      />
      <Route element={preview ? <Outlet /> : <AuthGate />}>
        <Route path="/screen" element={<ScreenPage />} />
        <Route path="/bridges/:bridgeId" element={<BridgePage />} />
        <Route path="/bridges/:bridgeId/records" element={<WorkPage />} />
        <Route path="/data-quality" element={<QualityPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/screen" replace />} />
    </Routes>
  );
}
