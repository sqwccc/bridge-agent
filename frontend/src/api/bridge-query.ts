import { queryOptions } from "@tanstack/react-query";
import { api } from "./client";
import type { Bridge } from "./types";

/** Map hover and detail share freshness and in-flight work; leaving cancels unused requests. */
export const bridgeQuery = (id: string) =>
  queryOptions({
    queryKey: ["bridge", id],
    queryFn: ({ signal }) =>
      api<Bridge>(`bridges/${encodeURIComponent(id)}`, undefined, signal),
    staleTime: 30_000,
  });
