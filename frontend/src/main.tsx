import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { App } from "./app/App";
import "./styles/index.css";
import "./styles/prototype.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#35d3ea",
          colorBgContainer: "#082044",
          borderRadius: 1,
          fontFamily: '"Microsoft YaHei",sans-serif',
          fontSize: 14,
          fontSizeSM: 12,
          controlHeight: 34,
          controlHeightSM: 30,
        },
      }}
    >
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
