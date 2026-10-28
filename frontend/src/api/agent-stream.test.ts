import { describe, it, expect, vi } from "vitest";
vi.mock("./client", () => ({ api: vi.fn() }));
import { readAgentStream } from "./agent-stream";

function bytes(text: string, split = false) {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (split)
        for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
      else controller.enqueue(encoded);
      controller.close();
    },
  });
}
describe("agent SSE", () => {
  it("preserves split UTF-8 and CRLF frames", async () => {
    const texts: unknown[] = [];
    await readAgentStream(
      bytes(
        'event: delta\r\ndata: {"text":"桥梁"}\r\n\r\nevent: delta\ndata: {"text":"资料"}\n\nevent: done\ndata: {}\n\n',
        true,
      ),
      (e) => {
        if (e.event === "delta") texts.push(e.data.text);
      },
    );
    expect(texts.join("")).toBe("桥梁资料");
  });
  it("does not treat premature EOF as success", async () => {
    await expect(
      readAgentStream(
        bytes('event: delta\ndata: {"text":"部分"}\n\n'),
        () => {},
      ),
    ).rejects.toThrow("回答未完成");
  });
  it("surfaces upstream terminal errors", async () => {
    await expect(
      readAgentStream(
        bytes('event: error\ndata: {"message":"查询失败"}\n\n'),
        () => {},
      ),
    ).rejects.toThrow("查询失败");
  });
});
