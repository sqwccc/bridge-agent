import ky, { HTTPError } from "ky";

/** 仅 GET 有限重试；Cookie 携带 Session，业务数据从同源网关读取。 */
const client = ky.create({
  baseUrl: new URL(
    import.meta.env.VITE_API_BASE_URL || "/api/v1/",
    location.origin,
  ),
  credentials: "include",
  timeout: 20000,
  retry: { limit: 1, methods: ["get"] },
});

export interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 将服务端业务错误统一为可展示文本；查询错误不会转成空数据。 */
export async function api<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const searchParams = Object.fromEntries(
      Object.entries(params || {}).filter(
        ([k, v]) => v !== undefined && (v !== "" || k === "metric"),
      ),
    ) as Record<string, string | number>;
    return (
      await client.get(path, { searchParams, signal }).json<ApiResponse<T>>()
    ).data;
  } catch (e) {
    throw await normalize(e);
  }
}

export async function post<T>(
  path: string,
  body?: unknown,
  timeout = 20000,
): Promise<T> {
  const csrf = await api<{ token: string; headerName: string }>("auth/csrf");
  try {
    return (
      await client
        .post(path, {
          json: body || {},
          timeout,
          headers: { [csrf.headerName]: csrf.token },
        })
        .json<ApiResponse<T>>()
    ).data;
  } catch (e) {
    throw await normalize(e);
  }
}

/** Editing keeps the current draft on authentication expiry. */
export async function put<T>(path: string, body: unknown): Promise<T> {
  const csrf = await api<{ token: string; headerName: string }>("auth/csrf");
  try {
    return (
      await client
        .put(path, {
          json: body,
          retry: 0,
          headers: { [csrf.headerName]: csrf.token },
        })
        .json<ApiResponse<T>>()
    ).data;
  } catch (e) {
    throw await normalize(e, false);
  }
}

async function normalize(e: unknown, notifySession = true) {
  if (e instanceof HTTPError) {
    // ky 2 已消费响应体并保存在 data，不能再次 response.json()。
    const payload = e.data as ApiResponse<unknown> | undefined;
    if (
      notifySession &&
      e.response.status === 401 &&
      !e.request.url.endsWith("/auth/login")
    )
      window.dispatchEvent(new Event("session-expired"));
    return new ApiError(e.response.status, payload?.message || "请求失败");
  }
  return new ApiError(0, "数据服务连接失败，请稍后重试");
}
