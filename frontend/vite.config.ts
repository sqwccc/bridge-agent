import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const publicUrl = new URL(
  process.env.BRIDGEMIND_PUBLIC_URL || "https://82mmnq755926.vicp.fun",
);
if (!["http:", "https:"].includes(publicUrl.protocol)) {
  throw new Error("BRIDGEMIND_PUBLIC_URL must be an HTTP(S) URL");
}

export default defineConfig({
  base: process.env.VITE_APP_BASE_PATH || "/",
  build: {
    target: ["firefox79", "chrome80"],
    cssTarget: ["firefox79", "chrome80"],
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: [publicUrl.hostname],
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL || "http://127.0.0.1:8088",
        changeOrigin: true,
      },
    },
  },
});
