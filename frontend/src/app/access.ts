import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useAccessConfig() {
  return useQuery({
    queryKey: ["access-config"],
    queryFn: () => api<{ previewEnabled: boolean }>("auth/config"),
    staleTime: 30_000,
  });
}
