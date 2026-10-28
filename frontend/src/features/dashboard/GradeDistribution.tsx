import { gradeColor } from "./gradeColors";
import type { GradeCategory } from "../../api/types";
import { num } from "../../api/types";
import { Empty } from "../shared/ui";

const explanations: Record<string, string> = {
  other:
    "包含未提供、养护类别与评价不匹配、异常编码，以及养护类别未明确的评价；原始值保留",
};

export function GradeDistribution({
  categories,
  name,
  selectedCategory,
  selectedGrade,
  pending,
  onSelect,
}: {
  categories: GradeCategory[];
  name: string;
  selectedCategory: string;
  selectedGrade: string;
  pending: boolean;
  onSelect: (category: string, grade: string) => void;
}) {
  if (!categories.length)
    return <Empty>{pending ? "正在读取评价…" : "当前筛选无桥梁"}</Empty>;
  return (
    <div className="assessment-groups">
      {categories.map((category) => {
        const max = Math.max(1, ...category.grades.map((g) => g.count));
        return (
          <section
            className={`assessment-category ${category.code === "unknown" ? "assessment-category-summary" : ""}`}
            key={category.code}
            aria-label={`${name} ${category.label}`}
            data-category={category.code}
          >
            <header>
              <strong>{category.label}</strong>
              <span>{num(category.total)} 座</span>
            </header>
            {category.code !== "unknown" && (
              <div className="assessment-bars">
                {category.grades.map((g) => {
                  const selected =
                    selectedCategory === category.code &&
                    selectedGrade === g.code;
                  return (
                    <button
                      key={g.code}
                      className={`grade-row ${selected ? "active" : ""} ${explanations[g.code] ? "assessment-status" : ""}`}
                      aria-label={`${name} ${category.label} ${g.label} ${g.count}座`}
                      aria-pressed={selected}
                      disabled={g.count === 0 && !selected}
                      title={
                        explanations[g.code] || `${category.label}：${g.label}`
                      }
                      onClick={() => onSelect(category.code, g.code)}
                    >
                      <strong>{num(g.count)}</strong>
                      <i
                        style={{
                          height: `${(32 * g.count) / max}px`,
                          background: gradeColor(g.code),
                        }}
                      />
                      <span>{g.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
