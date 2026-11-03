// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";

vi.mock("../pages/ScreenPage", () => ({ ScreenPage: () => "screen page" }));
vi.mock("../pages/BridgePage", () => ({ BridgePage: () => "bridge page" }));
vi.mock("../pages/WorkPage", () => ({ WorkPage: () => null }));
vi.mock("../pages/QualityPage", () => ({ QualityPage: () => null }));
vi.mock("../pages/AnalysisPage", () => ({ AnalysisPage: () => null }));
vi.mock("../features/shared/ui", () => ({ ErrorState: () => "error" }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Location() {
  return React.createElement("output", null, useLocation().pathname);
}

for (const entry of ["/bridges/10905200071", "/login"]) {
  it(`opens ${entry} without login and ignores obsolete expiry events`, async () => {
    vi.stubGlobal("CSS", { supports: () => false });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["bridge-cache"], "preserved");
    render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(
          MemoryRouter,
          { initialEntries: [entry] },
          React.createElement(App),
          React.createElement(Location),
        ),
      ),
    );
    await screen.findByText(entry === "/login" ? "screen page" : "bridge page");
    act(() => {
      window.dispatchEvent(new Event("session-expired"));
    });
    expect(screen.getByRole("status").textContent).toBe(
      entry === "/login" ? "/screen" : entry,
    );
    expect(client.getQueryData(["bridge-cache"])).toBe("preserved");
    client.clear();
  });
}
