import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() =>
  vi.stubGlobal("location", { origin: "https://portal.example.com" }),
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("keeps API downloads and agent references under the portal prefix", async () => {
  vi.stubEnv("BASE_URL", "/zntmh/ql/");
  vi.stubEnv("VITE_API_BASE_URL", "/zntmh/ql/api/v1/");
  const { apiUrl, appUrl } = await import("./url");
  expect(
    new URL(apiUrl("bridges/B1/reports/R1/file?download=true")).pathname,
  ).toBe("/zntmh/ql/api/v1/bridges/B1/reports/R1/file");
  expect(appUrl("/bridges/B1")).toBe("/zntmh/ql/bridges/B1");
  expect(appUrl("/api/v1/dashboard?city=1")).toBe(
    "/zntmh/ql/api/v1/dashboard?city=1",
  );
});

it("preserves root deployment when no portal base is configured", async () => {
  vi.stubEnv("BASE_URL", "/");
  vi.stubEnv("VITE_API_BASE_URL", "");
  const { apiUrl, appUrl } = await import("./url");
  expect(new URL(apiUrl("auth/config")).pathname).toBe("/api/v1/auth/config");
  expect(appUrl("/screen")).toBe("/screen");
});
