// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { GeneratedMonitoringReport, MonitoringPaper, type MonitoringDocument } from "./GeneratedMonitoringReport";
import { api } from "../../api/client";
vi.mock("../../api/client", () => ({ api: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const report: MonitoringDocument = { id: "JC-test", generatedAt: "2026-11-04T12:00:00", timezone: "Asia/Shanghai", from: "2026-11-04", to: "2026-11-04", bridge: { name: "测试桥<script>", code: "b", city: "扬州", road: "路", manager: "", length: 100, width: 20, typeName: "梁桥", maintenanceCategoryName: "Ⅰ类" }, samples: 0, validSamples: 0, configuredDevices: 0, configuredPoints: 0, channelsWithData: 0, channels: [] };
it("renders seven chapters with no fabricated results and escapes source strings", () => {
 const { container } = render(<MonitoringPaper report={report} />);
 expect(container.querySelectorAll("h2").length).toBe(7);expect(container.textContent).toContain("所选时段暂无匹配实测数据");expect(container.textContent).not.toMatch(/NaN|Infinity|1970/);expect(container.querySelector("script")).toBeNull();
});
it("validates dates, generates and closes printable document", async () => {
 vi.mocked(api).mockResolvedValue(report);render(<GeneratedMonitoringReport bridgeId="a" />);
 fireEvent.change(screen.getByLabelText("统计开始日期"), { target: { value: "2026-11-04" } });fireEvent.change(screen.getByLabelText("统计结束日期"), { target: { value: "2026-11-03" } });
 fireEvent.click(screen.getByText("生成监测报告"));expect(api).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText("统计结束日期"), { target: { value: "2026-11-04" } });fireEvent.click(screen.getByText("生成监测报告"));await screen.findByRole("dialog");expect(document.body.classList.contains("printing-monitor-report")).toBe(true);
 fireEvent.click(screen.getByText("关闭预览"));await waitFor(() => expect(document.body.classList.contains("printing-monitor-report")).toBe(false));
});
it("does not hide source failure as empty data", async () => {
 vi.mocked(api).mockRejectedValue(new Error("来源查询失败"));render(<GeneratedMonitoringReport bridgeId="a" />);fireEvent.click(screen.getByText("生成监测报告"));await screen.findByText("来源查询失败");expect(screen.queryByRole("dialog")).toBeNull();
});
