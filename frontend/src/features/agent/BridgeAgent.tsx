import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../api/client";
import { streamAgent } from "../../api/agent-stream";

type Reference = { id: string; label: string; url: string };
type Message = {
  id: number;
  question: string;
  answer: string;
  status: string;
  error?: string;
  evidence?: { data: Record<string, unknown>; references: Reference[] };
  plan?: Record<string, unknown>;
};
const routeLabels: Record<string, string> = {
  business_query: "业务查询",
  domain_knowledge: "术语解释",
  greeting_help: "使用帮助",
  unsupported: "能力范围说明",
  out_of_scope: "非桥梁业务问题",
  clarification_required: "需要补充条件",
};

function EvidenceTotals({ data }: { data: Record<string, unknown> }) {
  const totals: { label: string; count: number; period?: string }[] = [];
  const network = data["总体统计"] as
    | {
        total?: number;
        cities?: { code: string; label: string; count: number }[];
      }
    | undefined;
  if (typeof network?.total === "number")
    totals.push({ label: "当前范围桥梁", count: network.total });
  for (const [kind, label] of [
    ["patrols", "巡检记录"],
    ["defects", "病害记录"],
    ["maintenance", "维修记录"],
  ]) {
    const group = data[kind] as
      | {
          全量聚合?: {
            dimension: string;
            count: number;
            first_date?: string;
            last_date?: string;
          }[];
        }
      | undefined;
    const total = group?.全量聚合?.find((row) => row.dimension === "total");
    if (total)
      totals.push({
        label,
        count: total.count,
        period: total.first_date
          ? `${total.first_date} 至 ${total.last_date}`
          : "该查询范围未查到记录",
      });
  }
  const alarm = data["历史报警"] as { total?: number } | undefined;
  if (typeof alarm?.total === "number")
    totals.push({ label: "匹配历史报警", count: alarm.total });
  if (!totals.length) return null;
  return (
    <>
      <div className="agent-totals" aria-label="后端统计结果">
        {totals.map((t) => (
          <div key={t.label}>
            <span>{t.label}</span>
            <strong>{t.count}</strong>
            {t.period && <small>{t.period}</small>}
          </div>
        ))}
      </div>
      {network?.cities && (
        <details>
          <summary>后端地市统计表（未经模型改写）</summary>
          <table>
            <thead>
              <tr>
                <th>地市</th>
                <th>桥梁数</th>
              </tr>
            </thead>
            <tbody>
              {network.cities.map((city) => (
                <tr key={city.code}>
                  <td>{city.label}</td>
                  <td>{city.count}</td>
                </tr>
              ))}
              <tr>
                <th>合计</th>
                <td>{network.total}</td>
              </tr>
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}

export function BridgeAgent({
  bridgeId,
  pageFilters = {},
  initialQuestion = "",
}: {
  bridgeId?: string;
  pageFilters?: Record<string, string>;
  initialQuestion?: string;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const conversation = useRef<string | undefined>(undefined);
  const sequence = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const status = useQuery({
    queryKey: ["agent-status"],
    queryFn: () =>
      api<{ configured: boolean; dataMode: string }>("agent/status"),
  });
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (follow.current && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [messages]);
  const update = (id: number, apply: (m: Message) => Message) =>
    setMessages((items) => items.map((m) => (m.id === id ? apply(m) : m)));
  async function ask(text: string) {
    if (!text.trim() || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const id = ++sequence.current;
    setPending(true);
    setQuestion("");
    follow.current = true;
    setMessages((items) => [
      ...items.slice(-29),
      { id, question: text, answer: "", status: "正在连接…" },
    ]);
    const timeout = setTimeout(() => abort.abort("timeout"), 190000);
    try {
      await streamAgent(
        {
          question: text,
          scope: bridgeId ? "bridge" : "network",
          bridgeId,
          pageFilters: Object.fromEntries(
            Object.entries(pageFilters).filter(([, value]) => value !== ""),
          ),
          conversationId: conversation.current,
        },
        abort.signal,
        ({ event, data }) => {
          if (event === "meta")
            conversation.current = String(data.conversationId);
          if (event === "status")
            update(id, (m) => ({ ...m, status: String(data.message) }));
          if (event === "plan") update(id, (m) => ({ ...m, plan: data }));
          if (event === "evidence")
            update(id, (m) => ({
              ...m,
              evidence: data as Message["evidence"],
            }));
          if (event === "delta" || event === "replace")
            update(id, (m) => ({
              ...m,
              answer: (event === "replace" ? "" : m.answer) + String(data.text),
            }));
          if (event === "done")
            update(id, (m) => ({ ...m, status: "回答完成" }));
        },
      );
    } catch (error) {
      update(id, (m) => ({
        ...m,
        status: "回答未完成",
        error: abort.signal.aborted
          ? abort.signal.reason === "timeout"
            ? "生成超时，可重试。"
            : "已停止生成，以上为未完成内容。"
          : error instanceof Error
            ? error.message
            : "问答失败",
      }));
    } finally {
      clearTimeout(timeout);
      controller.current = null;
      setPending(false);
    }
  }
  const presets = bridgeId
    ? ["桥梁概况", "主要病害", "维修情况", "巡检情况", "历史报警", "报告目录"]
    : [
        "接入桥梁概况",
        "各地市接入桥梁数量对比",
        "Ⅱ至Ⅴ类桥梁的BSI等级分布",
        "病害主要集中在哪些部位",
      ];
  return (
    <section className="bridge-agent agent-chat">
      <h2>{bridgeId ? "单桥智能问答" : "智能问答"}</h2>
      {status.data?.dataMode === "demo" && (
        <p>当前使用合成样例，不代表真实桥梁，不向模型提供业务资料。</p>
      )}
      {(status.error || (status.data && !status.data.configured)) && (
        <p role="alert">
          {status.error?.message || "尚未配置 Dify 问题分类和回答应用。"}
          <button onClick={() => void status.refetch()}>刷新配置状态</button>
        </p>
      )}
      <div className="agent-shortcuts">
        {presets.map((text) => (
          <button
            key={text}
            disabled={pending || !status.data?.configured}
            onClick={() => void ask(text)}
          >
            {text}
          </button>
        ))}
      </div>
      <div
        className="agent-messages"
        ref={viewport}
        role="log"
        aria-label="问答记录"
        onScroll={() => {
          const el = viewport.current;
          if (el)
            follow.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 70;
        }}
      >
        {!messages.length && (
          <p className="muted-caption">
            可以直接提问，也可以在回答后继续追问。切换桥梁或页面筛选会开启新的对话。
          </p>
        )}
        {messages.map((m) => (
          <article key={m.id} className="agent-message">
            <div className="agent-user">{m.question}</div>
            {m.plan && (
              <small>{routeLabels[String(m.plan.route)] || "问题解析"}</small>
            )}
            {m.evidence && <EvidenceTotals data={m.evidence.data} />}
            <div className="agent-answer">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ children }) => <span>{children}</span>,
                  img: () => null,
                }}
              >
                {m.answer}
              </ReactMarkdown>
            </div>
            <p className="agent-progress" role="status">
              {m.status}
            </p>
            {m.error && <p role="alert">{m.error}</p>}
            {m.evidence?.references.map((r) => (
              <a
                className="agent-reference"
                key={r.id}
                href={
                  r.url.startsWith("/") && !r.url.startsWith("//")
                    ? r.url
                    : undefined
                }
                target="_blank"
                rel="noreferrer"
              >
                [{r.id}] {r.label}
              </a>
            ))}
            {(m.plan || m.evidence) && (
              <details>
                <summary>查看查询条件、资料与统计范围</summary>
                <pre>{JSON.stringify(m.evidence?.data || m.plan, null, 2)}</pre>
              </details>
            )}
            {!pending && (
              <button onClick={() => void ask(m.question)}>重新生成</button>
            )}
          </article>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          aria-label="桥梁问题"
          maxLength={2000}
          placeholder="输入问题；Enter发送，Shift+Enter换行"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (!pending && status.data?.configured) void ask(question);
            }
          }}
        />
        <div className="agent-controls">
          <button
            type="submit"
            disabled={pending || !status.data?.configured || !question.trim()}
          >
            发送问题
          </button>
          {pending && (
            <button type="button" onClick={() => controller.current?.abort()}>
              停止生成
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              conversation.current = undefined;
              setMessages([]);
            }}
          >
            新对话
          </button>
        </div>
      </form>
    </section>
  );
}
