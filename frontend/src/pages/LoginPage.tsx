import { useState } from "react";
import { Button, Input } from "antd";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "../api/client";

/** 独立系统账号登录；不把密码保存至浏览器或 URL。 */
export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const query = useQueryClient();
  return (
    <main className="login-page">
      <div className="login-art">
        <div className="eyebrow">JIANGSU</div>
        <h1>
          连接桥梁数据
          <br />
          <span>洞察路网运行</span>
        </h1>
        <p>江苏城市桥梁智能体 · 数据驾驶舱</p>
        <svg viewBox="0 0 700 250" aria-hidden="true">
          <path d="M0 210H700M170 220V25M530 220V25M30 190Q170 -110 350 190Q530 -110 680 190M0 190H700" />
          {Array.from({ length: 19 }, (_, i) => (
            <line
              key={i}
              x1={i * 35 + 35}
              x2={i * 35 + 35}
              y1={190 - Math.sin(((i % 10) / 10) * Math.PI) * 140}
              y2="190"
            />
          ))}
        </svg>
        <small>来源可追溯 · 数据只读 · 两级联动</small>
      </div>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const user = await post("auth/login", { username, password });
            query.setQueryData(["me"], user);
            navigate("/screen", { replace: true });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand-mark">M</div>
        <h2>欢迎进入江苏桥梁智能体</h2>
        <p>使用本系统账号登录桥梁驾驶舱</p>
        <label htmlFor="username">账号</label>
        <Input
          id="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={64}
        />
        <label htmlFor="password">密码</label>
        <Input.Password
          id="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          maxLength={72}
        />
        {error && (
          <div className="error-state" role="alert">
            {error}
          </div>
        )}
        <Button
          htmlType="submit"
          type="primary"
          loading={busy}
          block
          size="large"
        >
          登录驾驶舱 →
        </Button>
        <small>账号由系统管理员初始化，不使用来源数据库账号。</small>
      </form>
      <footer>江苏桥梁智能体 / 数据时间以各面板显示为准</footer>
    </main>
  );
}
