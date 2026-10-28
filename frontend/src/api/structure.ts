import { queryOptions } from "@tanstack/react-query";
import { api } from "./client";
import type { MonitorPoint } from "./types";
export const ZONES = ["上部结构", "下部结构", "桥面系"] as const;
export type Zone = (typeof ZONES)[number];
export type Binding = {
  pointId: string;
  deviceId: string;
  metric: string | null;
};
export type StructurePart = {
  id: string;
  zone: Zone;
  name: string;
  description: string;
  anchor: string | null;
  bindings: Binding[];
};
export type StructureConfig = {
  version: number;
  shape: string;
  parts: StructurePart[];
};
export const bindingKey = (b: Binding) =>
  JSON.stringify([b.pointId, b.deviceId, b.metric]);
export const structureQuery = (id: string) =>
  queryOptions({
    queryKey: ["structure-config", id],
    queryFn: ({ signal }) =>
      api<StructureConfig>(
        `bridges/${encodeURIComponent(id)}/structure-config`,
        undefined,
        signal,
      ),
    staleTime: 30_000,
  });
export const monitorPointsQuery = (id: string) =>
  queryOptions({
    queryKey: ["monitor-points", id],
    queryFn: ({ signal }) =>
      api<MonitorPoint[]>(
        `bridges/${encodeURIComponent(id)}/monitoring/points`,
        undefined,
        signal,
      ),
    staleTime: 30_000,
  });
