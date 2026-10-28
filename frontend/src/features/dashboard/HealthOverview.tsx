import { gradeColors as colors } from "./gradeColors";
import type { GradeCategory } from "../../api/types";
import { num } from "../../api/types";
import { Empty, ErrorState, Panel } from "../shared/ui";

const descriptions: Record<string, string> = {
  "3": "A级 完好",
  "4": "B级 良好",
  "5": "C级 合格",
  "6": "D级 不合格",
  "7": "E级 危险",
};

/** 分开展示两套来源评价体系，圆环中心为桥梁座数，不计算综合健康分。 */
export function HealthOverview({
  categories,
  basis,
  selectedCategory,
  selectedGrade,
  pending,
  error,
  onRetry,
  onBasisChange,
  onSelect,
}: {
  categories: GradeCategory[];
  basis: "BCI" | "BSI";
  selectedCategory: string;
  selectedGrade: string;
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
  onBasisChange: (basis: "BCI" | "BSI") => void;
  onSelect: (category: string, grade: string) => void;
}) {
  const total = categories.reduce((sum, c) => sum + c.total, 0);
  const unknown = categories.find((c) => c.code === "unknown");
  return (
    <Panel
      title="城市桥梁健康度统计"
      note={pending || error ? "来源评价概览" : `当前 ${num(total)} 座`}
      className="health-overview-panel"
    >
      <div className="tabs health-basis" aria-label="健康度评价依据">
        {(["BCI", "BSI"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={basis === value ? "active" : ""}
            aria-label={`健康度统计：${value === "BCI" ? "完好状况 BCI" : "结构状况 BSI"}`}
            aria-pressed={basis === value}
            onClick={() => onBasisChange(value)}
          >
            {value === "BCI" ? "完好状况 BCI" : "结构状况 BSI"}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorState error={error} retry={onRetry} />
      ) : pending || !categories.length ? (
        <Empty>{pending ? "正在读取评价…" : "当前筛选无桥梁"}</Empty>
      ) : (
        <>
          <div className="health-categories">
            {categories
              .filter((c) => c.code !== "unknown")
              .map((category) => {
                let offset = 0;
                const segments = category.grades
                  .filter((g) => g.count > 0)
                  .map((g) => {
                    const percent = category.total
                      ? (g.count / category.total) * 100
                      : 0;
                    const segment = { ...g, percent, offset };
                    offset += percent;
                    return segment;
                  });
                return (
                  <section
                    key={category.code}
                    className="health-category"
                    aria-label={`${basis} ${category.label}状态概览`}
                    data-category={category.code}
                  >
                    <header>
                      <strong>{category.label}</strong>
                      <span>
                        {category.code === "I" ? "安全评估结论" : "状态等级"}
                      </span>
                    </header>
                    <div className="health-category-content">
                      <svg
                        className="health-category-ring"
                        viewBox="0 0 100 100"
                        role="img"
                        aria-label={`${category.label} ${category.total}座，${category.grades.map((g) => `${g.label}${g.count}座`).join("，")}`}
                      >
                        <circle
                          className="health-ring-track"
                          cx="50"
                          cy="50"
                          r="37"
                        />
                        {segments.map((g) => (
                          <circle
                            key={g.code}
                            cx="50"
                            cy="50"
                            r="37"
                            pathLength="100"
                            fill="none"
                            stroke={colors[g.code] || colors.other}
                            strokeWidth="9"
                            strokeDasharray={`${g.percent} ${100 - g.percent}`}
                            strokeDashoffset={-g.offset}
                            transform="rotate(-90 50 50)"
                          >
                            <title>{`${g.label}：${g.count}座，占本组${g.percent.toFixed(1)}%`}</title>
                          </circle>
                        ))}
                        <text x="50" y="49" className="health-ring-total">
                          {num(category.total)}
                        </text>
                        <text x="50" y="65" className="health-ring-unit">
                          座
                        </text>
                      </svg>
                      <div className="health-category-legend">
                        {category.grades.map((g) => {
                          const selected =
                            selectedCategory === category.code &&
                            selectedGrade === g.code;
                          const label = descriptions[g.code] || g.label;
                          const percent = category.total
                            ? (g.count / category.total) * 100
                            : 0;
                          return (
                            <button
                              key={g.code}
                              type="button"
                              className={`health-state ${selected ? "active" : ""}`}
                              aria-label={`${basis} ${category.label} ${label} ${g.count}座`}
                              aria-pressed={selected}
                              disabled={g.count === 0 && !selected}
                              title={`${label}：${g.count}座，占本组${percent.toFixed(1)}%${g.code === "other" ? "；含未提供、类别冲突及异常编码" : "；点击联动筛选"}`}
                              onClick={() => onSelect(category.code, g.code)}
                            >
                              <i
                                style={{
                                  background: colors[g.code] || colors.other,
                                }}
                              />
                              <span>{label}</span>
                              <b>{num(g.count)}</b>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                );
              })}
          </div>
          <div className="health-unknown">
            <span>养护类别未明确</span>
            <strong>{num(unknown?.total ?? 0)} 座</strong>
          </div>
          <p className="muted-caption health-basis-note">
            Ⅰ类按安全结论、Ⅱ～Ⅴ类按来源等级统计；点击图例筛选。
          </p>
        </>
      )}
    </Panel>
  );
}
