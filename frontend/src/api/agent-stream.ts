import { api } from "./client";

export type StreamEvent = { event: string; data: Record<string, unknown> };

/** SSE boundaries and UTF-8 characters may span network chunks. */
export async function readAgentStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  const consume = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    const parsed = JSON.parse(data.join("\n")) as Record<string, unknown>;
    onEvent({ event, data: parsed });
    if (event === "error")
      throw new Error(String(parsed.message || "回答中断"));
    if (event === "done") terminal = true;
  };
  try {
    while (!terminal) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (terminal) break;
      }
      if (buffer.length > 1_000_000) throw new Error("响应超过限制");
      if (done) {
        if (!terminal) throw new Error("连接已中断，回答未完成");
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function streamAgent(
  payload: unknown,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
) {
  const csrf = await api<{ token: string; headerName: string }>("auth/csrf");
  signal.throwIfAborted();
  const base = new URL(
    import.meta.env.VITE_API_BASE_URL || "/api/v1/",
    location.origin,
  );
  const response = await fetch(new URL("agent/ask", base), {
    method: "POST",
    credentials: "include",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("session-expired"));
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || "问答请求失败");
  }
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  )
    throw new Error("服务未返回流式响应");
  await readAgentStream(response.body, onEvent);
}
